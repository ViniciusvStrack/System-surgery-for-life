const API_URL = "/api/inventory/snapshot";
const TOKEN_KEY = "sfl_admin_token";

export class InventoryApi {
  constructor() { this.token = localStorage.getItem(TOKEN_KEY) || ""; }
  async authenticate(force = false) {
    if (force) { this.token = ""; localStorage.removeItem(TOKEN_KEY); }
    if (!this.token) this.token = prompt("Token administrativo da Surgery For Life:") || "";
    if (!this.token) throw new Error("Token administrativo não informado.");
    localStorage.setItem(TOKEN_KEY, this.token);
    return this.read();
  }
  async read() { return this.#request("GET"); }
  async save(snapshot) { return this.#request("PUT", snapshot); }
  async #request(method, body) {
    const response = await fetch(API_URL, { method, headers: { "Content-Type": "application/json", "X-Admin-Token": this.token }, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json().catch(() => ({ error: "Resposta inválida do servidor." }));
    if (!response.ok) { const error = new Error(data.error || "Falha de comunicação."); error.status = response.status; throw error; }
    return data;
  }
}
