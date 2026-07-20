function safeText(value, maximum = 160) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function safeCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function sanitizeOrder(order) {
  if (!order || typeof order !== "object" || Array.isArray(order)) return null;
  const items = Array.isArray(order.items)
    ? order.items.slice(0, 100).map((item) => ({
        name: safeText(item?.name, 120),
        size: safeText(item?.size, 30),
        color: safeText(item?.color, 60),
        model: safeText(item?.model, 60),
        quantity: Math.max(1, safeCount(item?.quantity)),
        personalized: item?.personalized === true,
      }))
    : [];
  return {
    code: safeText(order.code, 80),
    status: safeText(order.status, 40),
    items,
    subtotalCents: safeCount(order.subtotalCents),
    createdAt: safeText(order.createdAt, 40),
    reservationExpiresAt: safeText(order.reservationExpiresAt, 40),
  };
}

function normalizeSnapshot(snapshot) {
  const source = snapshot && typeof snapshot === "object" ? snapshot : {};
  return {
    revision: safeCount(source.revision),
    products: Array.isArray(source.products) ? source.products : [],
    movements: Array.isArray(source.movements) ? source.movements : [],
    orders: Array.isArray(source.orders)
      ? source.orders.map(sanitizeOrder).filter(Boolean)
      : [],
  };
}

export class InventoryApi {
  constructor() {
    this.csrf = "";
  }
  async me() {
    const data = await this.request("/api/auth/me");
    this.csrf = data.csrf;
    return data;
  }
  async login(email, password, code = "") {
    const data = await this.request("/api/auth/login", "POST", {
      email,
      password,
      code,
    });
    if (data.csrf) this.csrf = data.csrf;
    return data;
  }
  async logout() {
    await this.request("/api/auth/logout", "POST", {});
    this.csrf = "";
  }
  async forgotPassword(email) {
    return this.request("/api/auth/forgot-password", "POST", { email });
  }
  async resetPassword(token, password) {
    return this.request("/api/auth/reset-password", "POST", {
      token,
      password,
    });
  }
  async setupTwoFactor() {
    return this.request("/api/auth/2fa/setup", "POST", {});
  }
  async confirmTwoFactor(code) {
    const data = await this.request("/api/auth/2fa/confirm", "POST", { code });
    await this.me();
    return data;
  }
  async read() {
    return normalizeSnapshot(await this.request("/api/inventory/snapshot"));
  }
  async save(snapshot) {
    return normalizeSnapshot(
      await this.request("/api/inventory/snapshot", "PUT", snapshot),
    );
  }
  async users() {
    return this.request("/api/admin/users");
  }
  async createUser(user) {
    return this.request("/api/admin/users", "POST", user);
  }
  async audit() {
    return this.request("/api/admin/audit");
  }
  async request(url, method = "GET", body) {
    const headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (this.csrf && method !== "GET") headers["X-CSRF-Token"] = this.csrf;
    const response = await fetch(url, {
      method,
      credentials: "same-origin",
      cache: method === "GET" ? "no-store" : "default",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response
      .json()
      .catch(() => ({ error: "Resposta inválida do servidor." }));
    if (!response.ok) {
      const error = new Error(data.error || "Falha de comunicação.");
      error.status = response.status;
      error.code = data.code;
      error.data = data;
      throw error;
    }
    return data;
  }
}
