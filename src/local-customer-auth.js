import crypto from "node:crypto";
import { JsonStore } from "./json-store.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN = /^[A-Za-z0-9_-]{40,100}$/;
const now = () => Date.now();
const hash = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");

function passwordHash(password) {
  if (typeof password !== "string" || password.length < 12 || password.length > 128) throw Object.assign(new Error("A senha deve ter entre 12 e 128 caracteres."), { status: 400 });
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${salt.toString("base64")}$${derived.toString("base64")}`;
}

function verifyPassword(password, encoded) {
  try {
    const [, saltValue, expectedValue] = String(encoded).split("$");
    const expected = Buffer.from(expectedValue, "base64");
    const actual = crypto.scryptSync(String(password), Buffer.from(saltValue, "base64"), expected.length, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch { return false; }
}

export class LocalCustomerAuthService {
  constructor({ customersFile, sessionsFile, secureCookies = false, sessionTtlMs = 30 * 24 * 60 * 60_000 } = {}) {
    this.customers = new JsonStore(customersFile, []);
    this.sessions = new JsonStore(sessionsFile, []);
    this.secureCookies = secureCookies;
    this.sessionTtlMs = sessionTtlMs;
  }

  cookie(token) { return `sfl_local_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(this.sessionTtlMs / 1000)}${this.secureCookies ? "; Secure" : ""}`; }
  clearCookie() { return `sfl_local_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${this.secureCookies ? "; Secure" : ""}`; }
  sessionFrom(request) {
    const raw = String(request?.headers?.cookie || "").split(";").map((part) => part.trim()).find((part) => part.startsWith("sfl_local_session="))?.slice(18);
    if (!raw || !TOKEN.test(raw)) return null;
    const sessions = this.sessions.read().filter((session) => session.expiresAt > now());
    if (sessions.length !== this.sessions.read().length) this.sessions.write(sessions);
    const session = sessions.find((item) => item.tokenHash === hash(raw));
    const user = session && this.customers.read().find((item) => item.id === session.customerId && item.active);
    return user ? { user, session } : null;
  }
  publicUser(user) { return { id: user.id, name: user.name, email: user.email }; }
  createSession(user) {
    const token = crypto.randomBytes(32).toString("base64url");
    const session = { tokenHash: hash(token), customerId: user.id, csrf: crypto.randomBytes(24).toString("base64url"), expiresAt: now() + this.sessionTtlMs };
    this.sessions.write([...this.sessions.read().filter((item) => item.expiresAt > now()), session]);
    return { token, csrf: session.csrf };
  }
  register({ name, email, password }) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedName = String(name || "").trim().replace(/\s+/g, " ");
    if (normalizedName.length < 2 || normalizedName.length > 100 || !EMAIL.test(normalizedEmail)) throw Object.assign(new Error("Informe nome e e-mail válidos."), { status: 400 });
    const customers = this.customers.read();
    if (customers.some((item) => item.email === normalizedEmail)) throw Object.assign(new Error("Já existe uma conta com este e-mail."), { status: 409 });
    const user = { id: crypto.randomUUID(), name: normalizedName, email: normalizedEmail, passwordHash: passwordHash(password), active: true, createdAt: new Date().toISOString() };
    customers.push(user); this.customers.write(customers);
    const session = this.createSession(user);
    return { user: this.publicUser(user), ...session };
  }
  login({ email, password }) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const user = this.customers.read().find((item) => item.email === normalizedEmail && item.active);
    if (!user || !verifyPassword(password, user.passwordHash)) throw Object.assign(new Error("E-mail ou senha inválidos."), { status: 401 });
    const session = this.createSession(user);
    return { user: this.publicUser(user), ...session };
  }
  requireCsrf(request) {
    const current = this.sessionFrom(request);
    if (!current) throw Object.assign(new Error("Autenticação necessária."), { status: 401 });
    if (request.headers["x-csrf-token"] !== current.session.csrf) throw Object.assign(new Error("Proteção CSRF inválida."), { status: 403 });
    return current;
  }
  logout(request) { const current = this.requireCsrf(request); this.sessions.write(this.sessions.read().filter((item) => item.tokenHash !== current.session.tokenHash)); return { cookie: this.clearCookie() }; }
}
