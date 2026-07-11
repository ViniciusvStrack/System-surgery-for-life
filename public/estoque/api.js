export class InventoryApi {
  constructor() { this.csrf = ""; }
  async me() { const data = await this.request("/api/auth/me"); this.csrf = data.csrf; return data; }
  async login(email, password, code = "") { const data = await this.request("/api/auth/login", "POST", { email, password, code }); if (data.csrf) this.csrf = data.csrf; return data; }
  async logout() { await this.request("/api/auth/logout", "POST", {}); this.csrf = ""; }
  async forgotPassword(email) { return this.request("/api/auth/forgot-password", "POST", { email }); }
  async resetPassword(token, password) { return this.request("/api/auth/reset-password", "POST", { token, password }); }
  async setupTwoFactor() { return this.request("/api/auth/2fa/setup", "POST", {}); }
  async confirmTwoFactor(code) { const data = await this.request("/api/auth/2fa/confirm", "POST", { code }); await this.me(); return data; }
  async read() { return this.request("/api/inventory/snapshot"); }
  async save(snapshot) { return this.request("/api/inventory/snapshot", "PUT", snapshot); }
  async users() { return this.request("/api/admin/users"); }
  async createUser(user) { return this.request("/api/admin/users", "POST", user); }
  async audit() { return this.request("/api/admin/audit"); }
  async request(url, method = "GET", body) {
    const headers = { "Content-Type": "application/json" }; if (this.csrf && method !== "GET") headers["X-CSRF-Token"] = this.csrf;
    const response = await fetch(url, { method, credentials: "same-origin", headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json().catch(() => ({ error: "Resposta inválida do servidor." }));
    if (!response.ok) { const error = new Error(data.error || "Falha de comunicação."); error.status = response.status; error.code = data.code; error.data = data; throw error; }
    return data;
  }
}
