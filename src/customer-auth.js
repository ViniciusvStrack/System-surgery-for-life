import crypto from "node:crypto";
import { JsonStore } from "./json-store.js";

const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const COOKIE_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const base64url = (value) => Buffer.from(value).toString("base64url");
const oauthError = (message, status = 400, code = "OAUTH_INVALID_REQUEST") =>
  Object.assign(new Error(message), { status, code });

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function boundedInteger(value, fallback, minimum, maximum, name) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new Error(`${name} deve estar entre ${minimum} e ${maximum}.`);
  }
  return number;
}

function validateCookieName(name) {
  if (!COOKIE_NAME.test(String(name || ""))) throw new Error("Nome de cookie invalido.");
  return String(name);
}

function requestCookieHeader(requestOrHeader) {
  if (typeof requestOrHeader === "string") return requestOrHeader;
  const value = requestOrHeader?.headers?.cookie;
  return Array.isArray(value) ? value.join("; ") : String(value || "");
}

export function readCookie(requestOrHeader, name) {
  const header = requestCookieHeader(requestOrHeader);
  if (!header || header.length > 8192) return null;
  const matches = [];
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 1 || part.slice(0, index).trim() !== name) continue;
    const value = part.slice(index + 1).trim();
    if (value) matches.push(value);
  }
  // Cookies duplicados podem produzir interpretacoes diferentes no proxy e na aplicacao.
  return matches.length === 1 ? matches[0] : null;
}

export function normalizeReturnTo(value, fallback = "/") {
  const input = value === undefined || value === null || value === "" ? fallback : value;
  if (typeof input !== "string" || input.length > 1024 || !input.startsWith("/") || input.startsWith("//")) {
    throw oauthError("Destino de retorno invalido.", 400, "INVALID_RETURN_TO");
  }
  if (/[\\\u0000-\u001f\u007f]/.test(input)) throw oauthError("Destino de retorno invalido.", 400, "INVALID_RETURN_TO");
  let parsed;
  try { parsed = new URL(input, "https://local.invalid"); }
  catch { throw oauthError("Destino de retorno invalido.", 400, "INVALID_RETURN_TO"); }
  if (parsed.origin !== "https://local.invalid" || !parsed.pathname.startsWith("/") || parsed.pathname.startsWith("//")) {
    throw oauthError("Destino de retorno invalido.", 400, "INVALID_RETURN_TO");
  }
  // Fragments nao chegam ao servidor e nao sao necessarios para restaurar a pagina.
  return `${parsed.pathname}${parsed.search}`;
}

function absoluteUrl(value, name, { requireHttps = false } = {}) {
  let parsed;
  try { parsed = new URL(String(value || "")); }
  catch { throw new Error(`${name} deve ser uma URL absoluta.`); }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) {
    throw new Error(`${name} deve ser uma URL HTTP(S) sem credenciais ou fragmento.`);
  }
  if (requireHttps && parsed.protocol !== "https:") throw new Error(`${name} deve usar HTTPS em producao.`);
  return parsed.toString();
}

function decodeJwtPart(segment, label) {
  if (!segment || segment.length > 16_384 || !BASE64URL.test(segment)) {
    throw oauthError(`id_token com ${label} invalido.`, 401, "INVALID_ID_TOKEN");
  }
  try {
    const decoded = Buffer.from(segment, "base64url");
    if (decoded.toString("base64url") !== segment) throw new Error("non-canonical base64url");
    const value = JSON.parse(decoded.toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
    return value;
  } catch {
    throw oauthError(`id_token com ${label} invalido.`, 401, "INVALID_ID_TOKEN");
  }
}

function abortable(promise, signal) {
  if (signal.aborted) return Promise.reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(promise).then(
      (value) => { signal.removeEventListener("abort", onAbort); resolve(value); },
      (error) => { signal.removeEventListener("abort", onAbort); reject(error); },
    );
  });
}

async function readBoundedResponse(response, maxBytes, controller, errorCode) {
  if (response.body && typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await abortable(reader.read(), controller.signal);
      if (done) break;
      const chunk = Buffer.from(value);
      size += chunk.length;
      if (size > maxBytes) {
        controller.abort();
        await reader.cancel().catch(() => {});
        throw oauthError("Resposta muito grande do provedor de identidade.", 502, errorCode);
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks, size).toString("utf8");
  }
  if (typeof response.text !== "function") throw oauthError("Resposta invalida do provedor de identidade.", 502, errorCode);
  const text = await abortable(response.text(), controller.signal);
  if (Buffer.byteLength(text, "utf8") > maxBytes) throw oauthError("Resposta muito grande do provedor de identidade.", 502, errorCode);
  return text;
}

async function fetchJson(fetchImpl, url, options, { maxBytes, timeoutMs, errorCode }) {
  if (typeof fetchImpl !== "function") throw new Error("Uma implementacao de fetch e obrigatoria.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal });
    const declaredLength = Number(response?.headers?.get?.("content-length") || 0);
    if (!response?.ok || (declaredLength && declaredLength > maxBytes)) {
      throw oauthError("Resposta invalida do provedor de identidade.", 502, errorCode);
    }
    const text = await readBoundedResponse(response, maxBytes, controller, errorCode);
    let value;
    try { value = JSON.parse(text); }
    catch { throw oauthError("Resposta invalida do provedor de identidade.", 502, errorCode); }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw oauthError("Resposta invalida do provedor de identidade.", 502, errorCode);
    return { value, headers: response.headers };
  } catch (error) {
    if (error?.code === errorCode) throw error;
    throw oauthError("Provedor de identidade temporariamente indisponivel.", 502, errorCode);
  } finally {
    clearTimeout(timer);
  }
}

function cacheMaxAge(headers, fallbackMs, maximumMs) {
  const header = String(headers?.get?.("cache-control") || "");
  const match = header.match(/(?:^|,)\s*max-age=(\d+)\s*(?:,|$)/i);
  if (!match) return fallbackMs;
  return Math.max(60_000, Math.min(Number(match[1]) * 1000, maximumMs));
}

export class GoogleJwksCache {
  constructor({
    fetchImpl = globalThis.fetch,
    jwksUri = GOOGLE_JWKS_URI,
    now = () => Date.now(),
    defaultTtlMs = 60 * 60_000,
    maximumTtlMs = 24 * 60 * 60_000,
    minimumRefreshMs = 60_000,
    timeoutMs = 5_000,
  } = {}) {
    this.fetchImpl = fetchImpl;
    this.jwksUri = absoluteUrl(jwksUri, "JWKS_URI", { requireHttps: true });
    this.now = now;
    this.defaultTtlMs = boundedInteger(defaultTtlMs, 60 * 60_000, 60_000, 24 * 60 * 60_000, "defaultTtlMs");
    this.maximumTtlMs = boundedInteger(maximumTtlMs, 24 * 60 * 60_000, 60_000, 7 * 24 * 60 * 60_000, "maximumTtlMs");
    this.minimumRefreshMs = boundedInteger(minimumRefreshMs, 60_000, 0, 60 * 60_000, "minimumRefreshMs");
    this.timeoutMs = boundedInteger(timeoutMs, 5_000, 100, 30_000, "timeoutMs");
    this.keys = new Map();
    this.expiresAt = 0;
    this.lastRefreshAt = 0;
    this.inflight = null;
  }

  async refresh() {
    if (this.inflight) return this.inflight;
    this.inflight = (async () => {
      const { value, headers } = await fetchJson(this.fetchImpl, this.jwksUri, { method: "GET", headers: { Accept: "application/json" }, redirect: "error" }, { maxBytes: 128 * 1024, timeoutMs: this.timeoutMs, errorCode: "JWKS_UNAVAILABLE" });
      if (!Array.isArray(value.keys) || value.keys.length < 1 || value.keys.length > 20) {
        throw oauthError("Conjunto de chaves invalido.", 502, "JWKS_UNAVAILABLE");
      }
      const next = new Map();
      for (const jwk of value.keys) {
        if (!jwk || jwk.kty !== "RSA" || typeof jwk.kid !== "string" || jwk.kid.length > 200 || !jwk.n || !jwk.e) continue;
        if (jwk.use && jwk.use !== "sig") continue;
        if (jwk.alg && jwk.alg !== "RS256") continue;
        try {
          const key = crypto.createPublicKey({ key: jwk, format: "jwk" });
          if (key.asymmetricKeyType !== "rsa" || (key.asymmetricKeyDetails?.modulusLength || 0) < 2048) continue;
          next.set(jwk.kid, key);
        }
        catch { /* ignora chaves que o OpenSSL nao consegue importar */ }
      }
      if (!next.size) throw oauthError("Conjunto de chaves invalido.", 502, "JWKS_UNAVAILABLE");
      const timestamp = this.now();
      this.keys = next;
      this.lastRefreshAt = timestamp;
      this.expiresAt = timestamp + cacheMaxAge(headers, this.defaultTtlMs, this.maximumTtlMs);
    })();
    try { await this.inflight; }
    finally { this.inflight = null; }
  }

  async getKey(kid, { forceRefresh = false } = {}) {
    if (typeof kid !== "string" || !kid || kid.length > 200) return null;
    const timestamp = this.now();
    const cached = this.keys.get(kid);
    const stale = timestamp >= this.expiresAt;
    const refreshAllowed = !this.lastRefreshAt || timestamp - this.lastRefreshAt >= this.minimumRefreshMs;
    if (stale || (!cached && refreshAllowed) || (forceRefresh && refreshAllowed)) await this.refresh();
    return this.keys.get(kid) || null;
  }
}

function tokenAudienceIsValid(audience, authorizedParty, clientId) {
  if (authorizedParty !== undefined && authorizedParty !== clientId) return false;
  if (typeof audience === "string") return audience === clientId;
  if (!Array.isArray(audience) || !audience.includes(clientId)) return false;
  return audience.length === 1 || authorizedParty === clientId;
}

function signatureIsValid(key, signingInput, signature) {
  try { return crypto.verify("RSA-SHA256", Buffer.from(signingInput), key, signature); }
  catch { return false; }
}

export async function verifyGoogleIdToken(idToken, {
  clientId,
  expectedNonce,
  jwksCache,
  now = () => Date.now(),
  clockToleranceSeconds = 60,
  issuers = GOOGLE_ISSUERS,
} = {}) {
  if (typeof idToken !== "string" || idToken.length < 20 || idToken.length > 20_000) {
    throw oauthError("id_token invalido.", 401, "INVALID_ID_TOKEN");
  }
  if (typeof clientId !== "string" || !clientId || !jwksCache || typeof expectedNonce !== "string") {
    throw new Error("Parametros de verificacao do id_token incompletos.");
  }
  const parts = idToken.split(".");
  if (parts.length !== 3 || !BASE64URL.test(parts[2])) throw oauthError("id_token invalido.", 401, "INVALID_ID_TOKEN");
  const header = decodeJwtPart(parts[0], "cabecalho");
  const claims = decodeJwtPart(parts[1], "claims");
  if (header.alg !== "RS256" || typeof header.kid !== "string" || header.kid.length > 200 || header.crit !== undefined) {
    throw oauthError("Algoritmo de assinatura nao permitido.", 401, "INVALID_ID_TOKEN");
  }
  const signingInput = `${parts[0]}.${parts[1]}`;
  const signature = Buffer.from(parts[2], "base64url");
  if (!signature.length || signature.toString("base64url") !== parts[2]) throw oauthError("Assinatura do id_token invalida.", 401, "INVALID_ID_TOKEN");
  let key = await jwksCache.getKey(header.kid);
  let validSignature = key && signatureIsValid(key, signingInput, signature);
  if (!validSignature) {
    key = await jwksCache.getKey(header.kid, { forceRefresh: true });
    validSignature = key && signatureIsValid(key, signingInput, signature);
  }
  if (!validSignature) throw oauthError("Assinatura do id_token invalida.", 401, "INVALID_ID_TOKEN");

  const tolerance = boundedInteger(clockToleranceSeconds, 60, 0, 300, "clockToleranceSeconds");
  const timestampSeconds = Math.floor(now() / 1000);
  const issuerAllowed = issuers instanceof Set ? issuers.has(claims.iss) : Array.isArray(issuers) && issuers.includes(claims.iss);
  if (!issuerAllowed) throw oauthError("Emissor do id_token invalido.", 401, "INVALID_ID_TOKEN");
  if (!tokenAudienceIsValid(claims.aud, claims.azp, clientId)) throw oauthError("Audiencia do id_token invalida.", 401, "INVALID_ID_TOKEN");
  if (!Number.isInteger(claims.exp) || claims.exp <= timestampSeconds - tolerance) {
    throw oauthError("id_token expirado.", 401, "INVALID_ID_TOKEN");
  }
  if (claims.iat !== undefined && (!Number.isInteger(claims.iat) || claims.iat > timestampSeconds + tolerance)) {
    throw oauthError("Data do id_token invalida.", 401, "INVALID_ID_TOKEN");
  }
  if (claims.nbf !== undefined && (!Number.isInteger(claims.nbf) || claims.nbf > timestampSeconds + tolerance)) {
    throw oauthError("id_token ainda nao e valido.", 401, "INVALID_ID_TOKEN");
  }
  if (typeof claims.nonce !== "string" || !safeEqual(sha256(claims.nonce), sha256(expectedNonce))) {
    throw oauthError("Nonce do id_token invalido.", 401, "INVALID_ID_TOKEN");
  }
  if (claims.email_verified !== true) throw oauthError("O e-mail do Google nao foi verificado.", 403, "EMAIL_NOT_VERIFIED");

  const sub = typeof claims.sub === "string" ? claims.sub.trim() : "";
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  const name = typeof claims.name === "string" ? claims.name.trim() : "";
  if (!sub || sub.length > 255 || !email || email.length > 254 || !EMAIL.test(email) || !name || name.length > 200) {
    throw oauthError("Perfil do Google incompleto.", 401, "INVALID_ID_TOKEN");
  }
  return { sub, email, name };
}

export class CustomerAuthService {
  constructor({
    customersFile,
    sessionsFile,
    transactionsFile,
    clientId,
    clientSecret,
    callbackUrl,
    secureCookies = false,
    sessionSameSite = "Lax",
    sessionCookieName = "sfl_customer_session",
    transientCookieName = "sfl_customer_oauth",
    sessionTtlMs = 30 * 24 * 60 * 60_000,
    transactionTtlMs = 10 * 60_000,
    defaultReturnTo = "/",
    fetchImpl = globalThis.fetch,
    jwksCache,
    now = () => Date.now(),
    randomBytes = crypto.randomBytes,
    authorizationEndpoint = GOOGLE_AUTHORIZATION_ENDPOINT,
    tokenEndpoint = GOOGLE_TOKEN_ENDPOINT,
  }) {
    if (![customersFile, sessionsFile, transactionsFile, clientId, clientSecret, callbackUrl].every((value) => typeof value === "string" && value)) {
      throw new Error("Arquivos, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_CALLBACK_URL sao obrigatorios.");
    }
    if (!['Lax', 'Strict'].includes(sessionSameSite)) throw new Error("sessionSameSite deve ser Lax ou Strict.");
    this.customers = new JsonStore(customersFile, []);
    this.sessions = new JsonStore(sessionsFile, []);
    this.transactions = new JsonStore(transactionsFile, []);
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.callbackUrl = absoluteUrl(callbackUrl, "GOOGLE_CALLBACK_URL", { requireHttps: secureCookies });
    this.secureCookies = Boolean(secureCookies);
    this.sessionSameSite = sessionSameSite;
    this.sessionCookieName = validateCookieName(sessionCookieName);
    this.transientCookieName = validateCookieName(transientCookieName);
    this.sessionTtlMs = boundedInteger(sessionTtlMs, 30 * 24 * 60 * 60_000, 5 * 60_000, 90 * 24 * 60 * 60_000, "sessionTtlMs");
    this.transactionTtlMs = boundedInteger(transactionTtlMs, 10 * 60_000, 60_000, 15 * 60_000, "transactionTtlMs");
    this.defaultReturnTo = normalizeReturnTo(defaultReturnTo);
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.randomBytes = randomBytes;
    this.authorizationEndpoint = absoluteUrl(authorizationEndpoint, "authorizationEndpoint", { requireHttps: true });
    this.tokenEndpoint = absoluteUrl(tokenEndpoint, "tokenEndpoint", { requireHttps: true });
    this.jwksCache = jwksCache || new GoogleJwksCache({ fetchImpl, now });
  }

  randomToken(bytes = 32) {
    const entropy = this.randomBytes(bytes);
    if (!Buffer.isBuffer(entropy) || entropy.length !== bytes) throw new Error("Fonte de aleatoriedade invalida.");
    return base64url(entropy);
  }

  transientCookie(token) {
    return `${this.transientCookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(this.transactionTtlMs / 1000)}${this.secureCookies ? "; Secure" : ""}`;
  }

  clearTransientCookie() {
    return `${this.transientCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${this.secureCookies ? "; Secure" : ""}`;
  }

  sessionCookie(token) {
    return `${this.sessionCookieName}=${token}; Path=/; HttpOnly; SameSite=${this.sessionSameSite}; Max-Age=${Math.floor(this.sessionTtlMs / 1000)}${this.secureCookies ? "; Secure" : ""}`;
  }

  clearSessionCookie() {
    return `${this.sessionCookieName}=; Path=/; HttpOnly; SameSite=${this.sessionSameSite}; Max-Age=0${this.secureCookies ? "; Secure" : ""}`;
  }

  beginLogin({ returnTo } = {}) {
    const target = normalizeReturnTo(returnTo, this.defaultReturnTo);
    const timestamp = this.now();
    const flowToken = this.randomToken();
    const state = this.randomToken();
    const nonce = this.randomToken();
    const codeVerifier = this.randomToken(64);
    const codeChallenge = base64url(crypto.createHash("sha256").update(codeVerifier).digest());
    const active = this.transactions.read().filter((item) => item.expiresAt > timestamp);
    active.push({
      idHash: sha256(flowToken),
      stateHash: sha256(state),
      nonce,
      codeVerifier,
      returnTo: target,
      createdAt: timestamp,
      expiresAt: timestamp + this.transactionTtlMs,
    });
    this.transactions.write(active.slice(-2000));
    const authorization = new URL(this.authorizationEndpoint);
    authorization.searchParams.set("client_id", this.clientId);
    authorization.searchParams.set("redirect_uri", this.callbackUrl);
    authorization.searchParams.set("response_type", "code");
    authorization.searchParams.set("scope", "openid email profile");
    authorization.searchParams.set("state", state);
    authorization.searchParams.set("nonce", nonce);
    authorization.searchParams.set("code_challenge", codeChallenge);
    authorization.searchParams.set("code_challenge_method", "S256");
    return { authorizationUrl: authorization.toString(), cookie: this.transientCookie(flowToken) };
  }

  consumeTransaction(cookieHeader, state) {
    if (typeof state !== "string" || state.length < 32 || state.length > 256 || !BASE64URL.test(state)) {
      throw oauthError("Estado OAuth invalido ou expirado.", 400, "INVALID_OAUTH_STATE");
    }
    const flowToken = readCookie(cookieHeader, this.transientCookieName);
    if (!flowToken || flowToken.length > 256 || !BASE64URL.test(flowToken)) {
      throw oauthError("Estado OAuth invalido ou expirado.", 400, "INVALID_OAUTH_STATE");
    }
    const timestamp = this.now();
    const idHash = sha256(flowToken);
    const all = this.transactions.read();
    const transaction = all.find((item) => item.expiresAt > timestamp && safeEqual(item.idHash, idHash));
    // Consome antes de qualquer operacao de rede: callback repetido nunca reutiliza o code_verifier.
    this.transactions.write(all.filter((item) => item.expiresAt > timestamp && !safeEqual(item.idHash, idHash)));
    if (!transaction || !safeEqual(transaction.stateHash, sha256(state))) {
      throw oauthError("Estado OAuth invalido ou expirado.", 400, "INVALID_OAUTH_STATE");
    }
    return transaction;
  }

  async exchangeCode(code, codeVerifier) {
    if (typeof code !== "string" || !code || code.length > 4096 || /[\u0000-\u001f\u007f]/.test(code)) {
      throw oauthError("Codigo de autorizacao invalido.", 400, "INVALID_AUTHORIZATION_CODE");
    }
    const body = new URLSearchParams({
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.callbackUrl,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    });
    const { value } = await fetchJson(this.fetchImpl, this.tokenEndpoint, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      redirect: "error",
    }, { maxBytes: 64 * 1024, timeoutMs: 8_000, errorCode: "TOKEN_EXCHANGE_FAILED" });
    if (typeof value.id_token !== "string" || value.id_token.length > 20_000) {
      throw oauthError("Resposta de autenticacao sem id_token valido.", 502, "TOKEN_EXCHANGE_FAILED");
    }
    return value.id_token;
  }

  upsertCustomer(profile) {
    const users = this.customers.read();
    const bySubject = users.find((item) => item.sub === profile.sub);
    const conflictingEmail = users.find((item) => item.email === profile.email && item.sub !== profile.sub);
    if (conflictingEmail) throw oauthError("Nao foi possivel vincular esta conta Google.", 409, "ACCOUNT_CONFLICT");
    const minimal = { sub: profile.sub, email: profile.email, name: profile.name };
    if (bySubject) {
      Object.assign(bySubject, minimal);
      delete bySubject.picture;
    }
    else users.push(minimal);
    this.customers.write(users);
    return structuredClone(minimal);
  }

  createSession(sub) {
    const timestamp = this.now();
    const token = this.randomToken();
    const csrf = this.randomToken();
    const active = this.sessions.read().filter((item) => item.expiresAt > timestamp);
    active.push({ idHash: sha256(token), sub, csrf, createdAt: timestamp, expiresAt: timestamp + this.sessionTtlMs });
    this.sessions.write(active.slice(-20_000));
    return { token, csrf };
  }

  async completeLogin({ code, state, cookieHeader }, context = {}) {
    void context; // reservado para auditoria sem persistir IP/user-agent por padrao.
    const transaction = this.consumeTransaction(cookieHeader, state);
    const idToken = await this.exchangeCode(code, transaction.codeVerifier);
    const profile = await verifyGoogleIdToken(idToken, {
      clientId: this.clientId,
      expectedNonce: transaction.nonce,
      jwksCache: this.jwksCache,
      now: this.now,
    });
    const user = this.upsertCustomer(profile);
    const session = this.createSession(user.sub);
    return {
      user,
      csrf: session.csrf,
      returnTo: transaction.returnTo,
      setCookies: [this.clearTransientCookie(), this.sessionCookie(session.token)],
    };
  }

  sessionFrom(requestOrHeader) {
    const token = readCookie(requestOrHeader, this.sessionCookieName);
    if (!token || token.length > 256 || !BASE64URL.test(token)) return null;
    const timestamp = this.now();
    const tokenHash = sha256(token);
    const all = this.sessions.read();
    const active = all.filter((item) => item.expiresAt > timestamp);
    if (active.length !== all.length) this.sessions.write(active);
    const session = active.find((item) => safeEqual(item.idHash, tokenHash));
    if (!session) return null;
    const user = this.customers.read().find((item) => item.sub === session.sub);
    return user ? { user: structuredClone(user), session } : null;
  }

  me(requestOrHeader) {
    const current = this.sessionFrom(requestOrHeader);
    if (!current) throw oauthError("Autenticacao necessaria.", 401, "AUTH_REQUIRED");
    return { user: { name: current.user.name, email: current.user.email }, csrf: current.session.csrf };
  }

  requireCsrf(requestOrHeader, suppliedToken) {
    const current = this.sessionFrom(requestOrHeader);
    if (!current) throw oauthError("Autenticacao necessaria.", 401, "AUTH_REQUIRED");
    const fromHeader = suppliedToken ?? requestOrHeader?.headers?.["x-csrf-token"];
    if (typeof fromHeader !== "string" || fromHeader.length > 256 || !safeEqual(sha256(fromHeader), sha256(current.session.csrf))) {
      throw oauthError("Protecao CSRF invalida.", 403, "INVALID_CSRF");
    }
    return current;
  }

  logout(requestOrHeader, suppliedToken) {
    const current = this.requireCsrf(requestOrHeader, suppliedToken);
    this.sessions.write(this.sessions.read().filter((item) => !safeEqual(item.idHash, current.session.idHash)));
    return { ok: true, cookie: this.clearSessionCookie() };
  }
}
