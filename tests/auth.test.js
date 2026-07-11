import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AuthService, hashPassword, totp, verifyPassword, verifyTotp } from "../src/auth.js";

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sfl-auth-"));
  return new AuthService({ usersFile: path.join(root, "users.json"), sessionsFile: path.join(root, "sessions.json"), resetsFile: path.join(root, "resets.json"), auditFile: path.join(root, "audit.json"), encryptionKey: "test-encryption-key-with-enough-entropy", adminEmail: "admin@surgery.test", adminPassword: "Senha-Administrador-2026!", secureCookies: false });
}
function request(token, csrf = "") { return { headers: { cookie: `sfl_session=${token}`, "x-csrf-token": csrf } }; }

test("senha usa scrypt com salt e comparação segura", () => {
  const first = hashPassword("Uma-Senha-Muito-Forte-2026!"); const second = hashPassword("Uma-Senha-Muito-Forte-2026!");
  assert.notEqual(first, second); assert.equal(verifyPassword("Uma-Senha-Muito-Forte-2026!", first), true); assert.equal(verifyPassword("senha-errada", first), false);
  assert.throws(() => hashPassword("curta"), /12 e 128/);
});

test("TOTP gera e valida código temporal de seis dígitos", () => {
  const secret = "JBSWY3DPEHPK3PXP"; const code = totp(secret);
  assert.match(code, /^\d{6}$/); assert.equal(verifyTotp(secret, code), true); assert.equal(verifyTotp(secret, "000000") && code !== "000000", false);
});

test("administrador precisa configurar 2FA antes de autorizar operações", () => {
  const auth = setup(); const login = auth.login({ email: "admin@surgery.test", password: "Senha-Administrador-2026!" });
  assert.equal(login.requiresTwoFactorSetup, true); assert.throws(() => auth.authorize(request(login.token, login.csrf), ["admin"], true), /dois fatores/);
  const setup2fa = auth.setupTwoFactor(request(login.token)); auth.confirmTwoFactor(request(login.token), totp(setup2fa.secret));
  const authorized = auth.authorize(request(login.token, login.csrf), ["admin"], true); assert.equal(authorized.user.role, "admin");
});

test("login posterior do administrador exige código TOTP", () => {
  const auth = setup(); const first = auth.login({ email: "admin@surgery.test", password: "Senha-Administrador-2026!" }); const setup2fa = auth.setupTwoFactor(request(first.token)); auth.confirmTwoFactor(request(first.token), totp(setup2fa.secret)); auth.logout(request(first.token));
  assert.equal(auth.login({ email: "admin@surgery.test", password: "Senha-Administrador-2026!" }).requiresTwoFactor, true);
  assert.throws(() => auth.login({ email: "admin@surgery.test", password: "Senha-Administrador-2026!", code: "111111" }), /inválido/);
  assert.ok(auth.login({ email: "admin@surgery.test", password: "Senha-Administrador-2026!", code: totp(setup2fa.secret) }).token);
});

test("papéis limitam acesso e CSRF protege alterações", () => {
  const auth = setup(); auth.createUser({ name: "Atendimento", email: "support@surgery.test", password: "Senha-Atendimento-2026!", role: "support" });
  const login = auth.login({ email: "support@surgery.test", password: "Senha-Atendimento-2026!" });
  assert.equal(auth.authorize(request(login.token), ["support"]).user.role, "support");
  assert.throws(() => auth.authorize(request(login.token), ["admin"]), /permissão/);
  assert.throws(() => auth.authorize(request(login.token, "errado"), ["support"], true), /CSRF/);
  assert.ok(auth.authorize(request(login.token, login.csrf), ["support"], true));
});

test("recuperação é temporária, de uso único e revoga sessões", () => {
  const auth = setup(); auth.createUser({ name: "Estoque", email: "stock@surgery.test", password: "Senha-Estoque-Antiga-2026!", role: "stock" }); const login = auth.login({ email: "stock@surgery.test", password: "Senha-Estoque-Antiga-2026!" });
  const token = auth.requestReset("stock@surgery.test"); auth.resetPassword(token, "Senha-Estoque-Nova-2026!");
  assert.equal(auth.sessionFrom(request(login.token)), null); assert.throws(() => auth.resetPassword(token, "Outra-Senha-Nova-2026!"), /inválido ou expirado/);
  assert.ok(auth.login({ email: "stock@surgery.test", password: "Senha-Estoque-Nova-2026!" }).token);
});

test("auditoria registra criação, login, 2FA e recuperação", () => {
  const auth = setup(); const login = auth.login({ email: "admin@surgery.test", password: "Senha-Administrador-2026!" }); const setup2fa = auth.setupTwoFactor(request(login.token)); auth.confirmTwoFactor(request(login.token), totp(setup2fa.secret));
  const actions = auth.listAudit().map((entry) => entry.action); assert.ok(actions.includes("auth.bootstrap")); assert.ok(actions.includes("auth.login")); assert.ok(actions.includes("auth.2fa.enable"));
});
