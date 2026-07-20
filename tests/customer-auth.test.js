import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  CustomerAuthService,
  GoogleJwksCache,
  normalizeReturnTo,
  readCookie,
  verifyGoogleIdToken,
} from "../src/customer-auth.js";
import { validateConfig } from "../src/config.js";

const NOW = 1_800_000_000_000;
const CLIENT_ID = "google-client-id.apps.googleusercontent.com";

function response(value, cacheControl = "") {
  const text = JSON.stringify(value);
  return {
    ok: true,
    status: 200,
    headers: { get(name) { if (name.toLowerCase() === "cache-control") return cacheControl; if (name.toLowerCase() === "content-length") return String(Buffer.byteLength(text)); return null; } },
    async text() { return text; },
  };
}

function keyPair(kid = "key-1") {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  return { kid, privateKey, jwk: { ...publicKey.export({ format: "jwk" }), kid, use: "sig", alg: "RS256" } };
}

function jwt(payload, pair, header = {}) {
  const encodedHeader = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: pair.kid, ...header })).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const input = `${encodedHeader}.${encodedPayload}`;
  return `${input}.${crypto.sign("RSA-SHA256", Buffer.from(input), pair.privateKey).toString("base64url")}`;
}

function claims(nonce, overrides = {}) {
  return {
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    exp: Math.floor(NOW / 1000) + 600,
    iat: Math.floor(NOW / 1000),
    nonce,
    email_verified: true,
    sub: "google-subject-123",
    email: "Cliente@Example.com",
    name: "Cliente Teste",
    picture: "https://lh3.googleusercontent.com/photo.jpg",
    ...overrides,
  };
}

function files() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sfl-customer-auth-"));
  return {
    root,
    customersFile: path.join(root, "customers.json"),
    sessionsFile: path.join(root, "sessions.json"),
    transactionsFile: path.join(root, "transactions.json"),
  };
}

function service(options = {}) {
  return new CustomerAuthService({
    ...files(),
    clientId: CLIENT_ID,
    clientSecret: "server-side-secret",
    callbackUrl: "http://localhost:3000/api/customer-auth/google/callback",
    now: () => NOW,
    ...options,
  });
}

test("inicio usa state, nonce, PKCE S256 e cookie transitorio seguro", () => {
  const auth = service();
  const result = auth.beginLogin({ returnTo: "/loja/produto?id=jaleco" });
  const url = new URL(result.authorizationUrl);
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("scope"), "openid email profile");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.match(url.searchParams.get("state"), /^[A-Za-z0-9_-]{43}$/);
  assert.match(url.searchParams.get("nonce"), /^[A-Za-z0-9_-]{43}$/);
  assert.match(result.cookie, /^sfl_customer_oauth=[A-Za-z0-9_-]+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=600$/);

  const transaction = JSON.parse(fs.readFileSync(auth.transactions.file, "utf8"))[0];
  const cookieToken = result.cookie.match(/^sfl_customer_oauth=([^;]+)/)[1];
  assert.notEqual(transaction.idHash, cookieToken);
  assert.notEqual(transaction.stateHash, url.searchParams.get("state"));
  assert.equal(transaction.returnTo, "/loja/produto?id=jaleco");
  assert.equal(url.searchParams.get("code_challenge"), crypto.createHash("sha256").update(transaction.codeVerifier).digest("base64url"));
});

test("callback verifica assinatura/claims, nao persiste tokens e cria sessao com hash", async () => {
  const pair = keyPair();
  let issuedIdToken = "";
  let tokenRequest;
  const fetchImpl = async (url, options = {}) => {
    if (url === "https://oauth2.googleapis.com/token") {
      tokenRequest = options;
      return response({ access_token: "access-token-must-not-be-stored", token_type: "Bearer", id_token: issuedIdToken });
    }
    if (url === "https://www.googleapis.com/oauth2/v3/certs") return response({ keys: [pair.jwk] }, "public, max-age=3600");
    throw new Error(`unexpected URL ${url}`);
  };
  const auth = service({ fetchImpl });
  const started = auth.beginLogin({ returnTo: "/loja/carrinho" });
  const authorization = new URL(started.authorizationUrl);
  issuedIdToken = jwt(claims(authorization.searchParams.get("nonce")), pair);
  const result = await auth.completeLogin({
    code: "one-time-authorization-code",
    state: authorization.searchParams.get("state"),
    cookieHeader: started.cookie.split(";")[0],
  });

  const body = new URLSearchParams(tokenRequest.body);
  assert.equal(tokenRequest.method, "POST");
  assert.equal(body.get("grant_type"), "authorization_code");
  assert.equal(body.get("client_secret"), "server-side-secret");
  assert.equal(body.get("code_verifier").length, 86);
  assert.deepEqual(result.user, { sub: "google-subject-123", email: "cliente@example.com", name: "Cliente Teste" });
  assert.equal(result.returnTo, "/loja/carrinho");
  assert.equal(result.setCookies.length, 2);

  const sessionCookie = result.setCookies[1].split(";")[0];
  const rawSessionToken = sessionCookie.split("=")[1];
  const stored = fs.readFileSync(auth.sessions.file, "utf8");
  const allStored = [stored, fs.readFileSync(auth.customers.file, "utf8"), fs.readFileSync(auth.transactions.file, "utf8")].join("\n");
  assert.equal(stored.includes(rawSessionToken), false);
  assert.equal(allStored.includes("access-token-must-not-be-stored"), false);
  assert.equal(allStored.includes(issuedIdToken), false);
  assert.deepEqual(auth.me(sessionCookie), { user: { name: "Cliente Teste", email: "cliente@example.com" }, csrf: result.csrf });
});

test("state e cookie sao vinculados, de uso unico e consumidos antes da rede", async () => {
  let requests = 0;
  const auth = service({ fetchImpl: async () => { requests += 1; throw new Error("network should not run"); } });
  const started = auth.beginLogin();
  const url = new URL(started.authorizationUrl);
  const cookieHeader = started.cookie.split(";")[0];
  await assert.rejects(auth.completeLogin({ code: "code", state: `${url.searchParams.get("state")}x`, cookieHeader }), (error) => error.code === "INVALID_OAUTH_STATE");
  await assert.rejects(auth.completeLogin({ code: "code", state: url.searchParams.get("state"), cookieHeader }), (error) => error.code === "INVALID_OAUTH_STATE");
  assert.equal(requests, 0);
});

test("verificacao criptografica rejeita claims criticas invalidas", async () => {
  const pair = keyPair();
  const cache = new GoogleJwksCache({ fetchImpl: async () => response({ keys: [pair.jwk] }), now: () => NOW });
  const verify = (overrides = {}, expectedNonce = "nonce-ok") => verifyGoogleIdToken(jwt(claims("nonce-ok", overrides), pair), { clientId: CLIENT_ID, expectedNonce, jwksCache: cache, now: () => NOW });
  assert.equal((await verify()).email, "cliente@example.com");
  await assert.rejects(verify({ iss: "https://attacker.invalid" }), /Emissor/);
  await assert.rejects(verify({ aud: "outro-client-id" }), /Audiencia/);
  await assert.rejects(verify({ exp: Math.floor(NOW / 1000) - 61 }), /expirado/);
  await assert.rejects(verify({ nbf: Math.floor(NOW / 1000) + 61 }), /ainda nao e valido/);
  await assert.rejects(verify({ email_verified: false }), (error) => error.status === 403 && error.code === "EMAIL_NOT_VERIFIED");
  await assert.rejects(verify({}, "nonce-diferente"), /Nonce/);
  await assert.rejects(verify({ aud: [CLIENT_ID, "other"], azp: "other" }), /Audiencia/);
  await assert.rejects(verify({ aud: CLIENT_ID, azp: "other" }), /Audiencia/);
});

test("assinatura alterada e algoritmo diferente sao rejeitados", async () => {
  const pair = keyPair();
  const cache = new GoogleJwksCache({ fetchImpl: async () => response({ keys: [pair.jwk] }), now: () => NOW });
  const valid = jwt(claims("nonce"), pair);
  const tokenParts = valid.split(".");
  const changedSignature = Buffer.from(tokenParts[2], "base64url");
  changedSignature[Math.floor(changedSignature.length / 2)] ^= 1;
  const tampered = `${tokenParts[0]}.${tokenParts[1]}.${changedSignature.toString("base64url")}`;
  await assert.rejects(verifyGoogleIdToken(tampered, { clientId: CLIENT_ID, expectedNonce: "nonce", jwksCache: cache, now: () => NOW }), /Assinatura/);
  const none = jwt(claims("nonce"), pair, { alg: "none" });
  await assert.rejects(verifyGoogleIdToken(none, { clientId: CLIENT_ID, expectedNonce: "nonce", jwksCache: cache, now: () => NOW }), /Algoritmo/);
});

test("JWKS usa cache, respeita TTL e busca rotacao com limite", async () => {
  const first = keyPair("old");
  const second = keyPair("new");
  let currentTime = NOW;
  let calls = 0;
  const cache = new GoogleJwksCache({
    now: () => currentTime,
    minimumRefreshMs: 60_000,
    fetchImpl: async () => { calls += 1; return response({ keys: calls === 1 ? [first.jwk] : [second.jwk] }, "max-age=3600"); },
  });
  assert.ok(await cache.getKey("old"));
  assert.ok(await cache.getKey("old"));
  assert.equal(calls, 1);
  assert.equal(await cache.getKey("new"), null);
  assert.equal(calls, 1);
  currentTime += 61_000;
  assert.ok(await cache.getKey("new"));
  assert.equal(calls, 2);
});

test("timeout do JWKS cobre tambem a leitura do corpo", async () => {
  const cache = new GoogleJwksCache({
    timeoutMs: 100,
    fetchImpl: async () => ({ ok: true, headers: { get() { return null; } }, text: () => new Promise(() => {}) }),
  });
  const startedAt = Date.now();
  await assert.rejects(cache.refresh(), (error) => error.code === "JWKS_UNAVAILABLE");
  assert.ok(Date.now() - startedAt < 2_000);
});

test("sessao exige CSRF no logout, e logout revoga e limpa cookie", async () => {
  const pair = keyPair();
  let idToken;
  const auth = service({
    fetchImpl: async (url) => url.includes("/token") ? response({ id_token: idToken }) : response({ keys: [pair.jwk] }),
  });
  const started = auth.beginLogin();
  const authorization = new URL(started.authorizationUrl);
  idToken = jwt(claims(authorization.searchParams.get("nonce")), pair);
  const loggedIn = await auth.completeLogin({ code: "code", state: authorization.searchParams.get("state"), cookieHeader: started.cookie.split(";")[0] });
  const cookie = loggedIn.setCookies[1].split(";")[0];
  assert.throws(() => auth.logout({ headers: { cookie, "x-csrf-token": "wrong" } }), (error) => error.status === 403 && error.code === "INVALID_CSRF");
  const result = auth.logout({ headers: { cookie, "x-csrf-token": loggedIn.csrf } });
  assert.equal(result.ok, true);
  assert.match(result.cookie, /Max-Age=0/);
  assert.throws(() => auth.me(cookie), (error) => error.status === 401);
});

test("cookies de producao usam Secure e retorno nunca aceita open redirect", () => {
  const auth = service({ secureCookies: true, callbackUrl: "https://surgery.example/api/customer-auth/google/callback", sessionSameSite: "Strict" });
  const started = auth.beginLogin();
  assert.match(started.cookie, /HttpOnly; SameSite=Lax; Max-Age=600; Secure$/);
  assert.match(auth.sessionCookie("token"), /HttpOnly; SameSite=Strict; Max-Age=2592000; Secure$/);
  assert.equal(normalizeReturnTo("/loja?categoria=jalecos#ignorado"), "/loja?categoria=jalecos");
  for (const invalid of ["https://evil.example", "//evil.example/path", "/\\evil.example", "javascript:alert(1)", `/loja\nLocation: https://evil.example`, `/${"a".repeat(1024)}`]) {
    assert.throws(() => normalizeReturnTo(invalid), /retorno invalido/i);
  }
  assert.equal(readCookie("a=1; session=abc; b=2", "session"), "abc");
  assert.equal(readCookie("session=abc; session=def", "session"), null);
});

test("configuracao OAuth e TTL sao validados e OAuth pode ficar desativado com guest checkout", () => {
  const base = { host: "127.0.0.1", port: 3000, deliveryFee: 0, freeShippingFrom: 0, appEnv: "development", simulatorEnabled: true, exposeDevelopmentResetToken: false };
  assert.equal(validateConfig(base), base);
  assert.throws(() => validateConfig({ ...base, googleOauthClientId: CLIENT_ID }), /devem ser configurados juntos/);
  assert.throws(() => validateConfig({ ...base, customerSessionTtlDays: 91 }), /entre 1 e 90/);
  assert.throws(() => validateConfig({ ...base, googleOauthClientId: CLIENT_ID, googleOauthClientSecret: "secret", googleOauthCallbackUrl: "not-a-url" }), /URL absoluta/);
  const production = { ...base, appEnv: "production", simulatorEnabled: false, authEncryptionKey: "x".repeat(40), verifyToken: "verify", appSecret: "secret", googleOauthClientId: CLIENT_ID, googleOauthClientSecret: "secret", googleOauthCallbackUrl: "http://example.com/callback" };
  assert.throws(() => validateConfig(production), /HTTPS/);
});
