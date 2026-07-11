import crypto from "node:crypto";
import { JsonStore } from "./json-store.js";

const ROLES = new Set(["admin", "stock", "support"]);
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const now = () => Date.now();
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

export function hashPassword(password) {
  if (typeof password !== "string" || password.length < 12 || password.length > 128) throw new Error("A senha deve ter entre 12 e 128 caracteres.");
  const salt = crypto.randomBytes(16); const N = 32768; const r = 8; const p = 1;
  const hash = crypto.scryptSync(password, salt, 64, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password, encoded) {
  try { const [, n, r, p, salt, expected] = encoded.split("$"); const target = Buffer.from(expected, "base64"); const actual = crypto.scryptSync(password, Buffer.from(salt, "base64"), target.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 }); return crypto.timingSafeEqual(actual, target); }
  catch { return false; }
}

function base32Encode(buffer) {
  let bits = 0; let value = 0; let output = "";
  for (const byte of buffer) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { output += B32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits) output += B32[(value << (5 - bits)) & 31]; return output;
}

function base32Decode(text) {
  let bits = 0; let value = 0; const bytes = [];
  for (const char of text.replace(/=+$/, "").toUpperCase()) { const index = B32.indexOf(char); if (index < 0) continue; value = (value << 5) | index; bits += 5; if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(bytes);
}

export function totp(secret, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 30000); const buffer = Buffer.alloc(8); buffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac("sha1", base32Decode(secret)).update(buffer).digest(); const offset = digest[19] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

export function verifyTotp(secret, code) {
  if (!/^\d{6}$/.test(String(code || ""))) return false;
  return [-1, 0, 1].some((window) => { const expected = Buffer.from(totp(secret, Date.now() + window * 30000)); const actual = Buffer.from(String(code)); return expected.length === actual.length && crypto.timingSafeEqual(expected, actual); });
}

export class AuthService {
  constructor({ usersFile, sessionsFile, resetsFile, auditFile, encryptionKey, adminEmail, adminPassword, secureCookies = false }) {
    this.users = new JsonStore(usersFile, []); this.sessions = new JsonStore(sessionsFile, []); this.resets = new JsonStore(resetsFile, []); this.auditStore = new JsonStore(auditFile, []);
    this.key = crypto.createHash("sha256").update(encryptionKey).digest(); this.secureCookies = secureCookies; this.attempts = new Map();
    if (!this.users.read().length && adminEmail && adminPassword) this.createUser({ name: "Administrador", email: adminEmail, password: adminPassword, role: "admin" }, null, "auth.bootstrap");
  }

  safeUser(user) { return { id: user.id, name: user.name, email: user.email, role: user.role, active: user.active, twoFactorEnabled: Boolean(user.twoFactor?.enabled), createdAt: user.createdAt }; }
  listUsers() { return this.users.read().map((user) => this.safeUser(user)); }

  createUser(input, actor = null, action = "user.create") {
    const email = String(input.email || "").trim().toLowerCase(); const name = String(input.name || "").trim(); const role = String(input.role || "");
    if (!/^\S+@\S+\.\S+$/.test(email) || name.length < 2 || !ROLES.has(role)) throw new Error("Nome, e-mail ou perfil inválido.");
    const users = this.users.read(); if (users.some((user) => user.email === email)) throw new Error("Já existe uma conta com este e-mail.");
    const user = { id: crypto.randomUUID(), name, email, role, passwordHash: hashPassword(input.password), active: true, twoFactor: { enabled: false }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    users.push(user); this.users.write(users); this.audit(actor, action, { targetUserId: user.id, email, role }); return this.safeUser(user);
  }

  login({ email, password, code }, context = {}) {
    const normalized = String(email || "").trim().toLowerCase(); const throttle = this.attempts.get(normalized);
    if (throttle?.blockedUntil > now()) throw Object.assign(new Error("Muitas tentativas. Aguarde 15 minutos."), { status: 429 });
    const users = this.users.read(); const user = users.find((item) => item.email === normalized && item.active);
    if (!user || !verifyPassword(String(password || ""), user.passwordHash)) { this.fail(normalized); throw Object.assign(new Error("E-mail ou senha inválidos."), { status: 401 }); }
    if (user.role === "admin" && user.twoFactor?.enabled && !code) return { requiresTwoFactor: true };
    if (user.twoFactor?.enabled && !verifyTotp(this.decrypt(user.twoFactor.secret), code)) { this.fail(normalized); throw Object.assign(new Error("Código de autenticação inválido."), { status: 401 }); }
    this.attempts.delete(normalized); const result = this.createSession(user, context, user.role !== "admin" || user.twoFactor.enabled);
    this.audit(this.safeUser(user), "auth.login", { ip: context.ip }); return { ...result, user: this.safeUser(user), requiresTwoFactorSetup: user.role === "admin" && !user.twoFactor.enabled };
  }

  fail(email) { const record = this.attempts.get(email) || { count: 0, blockedUntil: 0 }; record.count += 1; if (record.count >= 5) { record.blockedUntil = now() + 15 * 60_000; record.count = 0; } this.attempts.set(email, record); }
  createSession(user, context, mfaComplete) { const token = crypto.randomBytes(32).toString("base64url"); const session = { idHash: sha256(token), userId: user.id, csrf: crypto.randomBytes(24).toString("base64url"), mfaComplete, createdAt: now(), expiresAt: now() + 8 * 60 * 60_000, lastSeenAt: now(), ip: context.ip || "", userAgent: String(context.userAgent || "").slice(0, 300) }; const sessions = this.sessions.read().filter((item) => item.expiresAt > now()); sessions.push(session); this.sessions.write(sessions); return { token, csrf: session.csrf }; }
  cookie(token) { return `sfl_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${this.secureCookies ? "; Secure" : ""}`; }
  clearCookie() { return `sfl_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${this.secureCookies ? "; Secure" : ""}`; }

  sessionFrom(request) {
    const token = String(request.headers.cookie || "").split(";").map((part) => part.trim()).find((part) => part.startsWith("sfl_session="))?.slice(12); if (!token) return null;
    const sessions = this.sessions.read(); const session = sessions.find((item) => item.idHash === sha256(token) && item.expiresAt > now()); if (!session) return null;
    const user = this.users.read().find((item) => item.id === session.userId && item.active); return user ? { session, user, safeUser: this.safeUser(user) } : null;
  }

  logout(request) { const auth = this.sessionFrom(request); if (auth) { this.sessions.write(this.sessions.read().filter((item) => item.idHash !== auth.session.idHash)); this.audit(auth.safeUser, "auth.logout", {}); } }
  authorize(request, roles = [], csrf = false) { const auth = this.sessionFrom(request); if (!auth) throw Object.assign(new Error("Autenticação necessária."), { status: 401 }); if (!auth.session.mfaComplete) throw Object.assign(new Error("Configure a autenticação em dois fatores."), { status: 403, code: "MFA_SETUP_REQUIRED" }); if (roles.length && !roles.includes(auth.user.role)) throw Object.assign(new Error("Você não possui permissão para esta operação."), { status: 403 }); if (csrf && request.headers["x-csrf-token"] !== auth.session.csrf) throw Object.assign(new Error("Proteção CSRF inválida."), { status: 403 }); return auth; }

  setupTwoFactor(request) { const auth = this.sessionFrom(request); if (!auth) throw Object.assign(new Error("Autenticação necessária."), { status: 401 }); const secret = base32Encode(crypto.randomBytes(20)); const users = this.users.read(); const user = users.find((item) => item.id === auth.user.id); user.twoFactor = { enabled: false, secret: this.encrypt(secret), pendingAt: new Date().toISOString() }; this.users.write(users); return { secret, uri: `otpauth://totp/${encodeURIComponent("Surgery For Life:" + user.email)}?secret=${secret}&issuer=${encodeURIComponent("Surgery For Life")}&digits=6&period=30` }; }
  confirmTwoFactor(request, code) { const auth = this.sessionFrom(request); if (!auth) throw Object.assign(new Error("Autenticação necessária."), { status: 401 }); const users = this.users.read(); const user = users.find((item) => item.id === auth.user.id); if (!user.twoFactor?.secret || !verifyTotp(this.decrypt(user.twoFactor.secret), code)) throw new Error("Código TOTP inválido."); user.twoFactor.enabled = true; user.updatedAt = new Date().toISOString(); this.users.write(users); const sessions = this.sessions.read(); const session = sessions.find((item) => item.idHash === auth.session.idHash); session.mfaComplete = true; this.sessions.write(sessions); this.audit(this.safeUser(user), "auth.2fa.enable", {}); return this.safeUser(user); }

  requestReset(email) { const user = this.users.read().find((item) => item.email === String(email || "").trim().toLowerCase() && item.active); if (!user) return null; const token = crypto.randomBytes(32).toString("base64url"); const records = this.resets.read().filter((item) => item.expiresAt > now() && !item.usedAt); records.push({ tokenHash: sha256(token), userId: user.id, expiresAt: now() + 30 * 60_000, usedAt: null }); this.resets.write(records); this.audit(this.safeUser(user), "auth.password_reset.request", {}); return token; }
  resetPassword(token, password) { const records = this.resets.read(); const record = records.find((item) => item.tokenHash === sha256(String(token || "")) && !item.usedAt && item.expiresAt > now()); if (!record) throw new Error("Token de recuperação inválido ou expirado."); const users = this.users.read(); const user = users.find((item) => item.id === record.userId); user.passwordHash = hashPassword(password); user.updatedAt = new Date().toISOString(); record.usedAt = now(); this.users.write(users); this.resets.write(records); this.sessions.write(this.sessions.read().filter((item) => item.userId !== user.id)); this.audit(this.safeUser(user), "auth.password_reset.complete", {}); }

  audit(actor, action, details) { const entries = this.auditStore.read(); entries.push({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), actor: actor ? { id: actor.id, name: actor.name, email: actor.email, role: actor.role } : null, action, details }); this.auditStore.write(entries.slice(-10000)); }
  listAudit() { return this.auditStore.read().slice().reverse(); }
  encrypt(text) { const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv("aes-256-gcm", this.key, iv); const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]); return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${encrypted.toString("base64")}`; }
  decrypt(value) { const [iv, tag, data] = value.split("."); const decipher = crypto.createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "base64")); decipher.setAuthTag(Buffer.from(tag, "base64")); return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8"); }
}
