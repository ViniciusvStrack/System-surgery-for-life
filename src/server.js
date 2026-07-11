import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { Catalog } from "./catalog.js";
import { StoreBot } from "./bot.js";
import { getConfig, loadEnv } from "./config.js";
import { JsonStore } from "./json-store.js";
import { InventoryService } from "./inventory.js";
import { extractMessages, verifySignature, WhatsAppClient } from "./whatsapp.js";
import { money } from "./utils.js";
import { AuthService } from "./auth.js";

await loadEnv();
const config = getConfig();
const inventory = new InventoryService(path.join(config.root, "runtime/inventory.json"));
const catalog = new Catalog(path.join(config.root, "data/catalog.json"), inventory);
const sessions = new JsonStore(path.join(config.root, "runtime/sessions.json"), {});
const orders = new JsonStore(path.join(config.root, "runtime/orders.json"), []);
const bot = new StoreBot({ catalog, sessions, orders, faqFile: path.join(config.root, "data/faqs.json"), config });
const whatsapp = new WhatsAppClient(config);
const auth = new AuthService({ usersFile: path.join(config.root, "runtime/users.json"), sessionsFile: path.join(config.root, "runtime/auth-sessions.json"), resetsFile: path.join(config.root, "runtime/password-resets.json"), auditFile: path.join(config.root, "runtime/audit.json"), encryptionKey: config.authEncryptionKey, adminEmail: config.bootstrapAdminEmail, adminPassword: config.bootstrapAdminPassword, secureCookies: config.appEnv === "production" });

const publicFiles = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/estoque": ["estoque/index.html", "text/html; charset=utf-8"],
  "/estoque/": ["estoque/index.html", "text/html; charset=utf-8"],
  "/estoque/styles.css": ["estoque/styles.css", "text/css; charset=utf-8"],
  "/estoque/auth.css": ["estoque/auth.css", "text/css; charset=utf-8"],
  "/estoque/api.js": ["estoque/api.js", "text/javascript; charset=utf-8"],
  "/estoque/app.js": ["estoque/app.js", "text/javascript; charset=utf-8"],
};

function sendJson(response, status, value, headers = {}) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY", ...headers });
  response.end(JSON.stringify(value));
}

function isAdmin(request) {
  return Boolean(config.adminToken) && request.headers["x-admin-token"] === config.adminToken;
}

function requestContext(request) { return { ip: request.socket.remoteAddress || "", userAgent: request.headers["user-agent"] || "" }; }

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    request.on("data", (chunk) => { size += chunk.length; if (size > 1_000_000) request.destroy(); else chunks.push(chunk); });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function orderForStore(order) {
  const items = order.items.map((x) => `• ${x.name} (${x.variant}) × ${x.qty}`).join("\n");
  const note = order.note ? `\nObservação: ${order.note}` : "";
  return `🔔 *NOVO PEDIDO ${order.id}*\nCliente: ${order.customer}\nWhatsApp: ${order.user}\n${items}\nEntrega: ${order.delivery}\nEndereço: ${order.address}${note}\nTotal estimado: ${money(order.total)}\n\nResponda ao cliente para confirmar estoque, prazo e pagamento.`;
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    try { const result = auth.login(JSON.parse((await readBody(request)).toString("utf8")), requestContext(request)); if (result.requiresTwoFactor) return sendJson(response, 202, result); return sendJson(response, 200, { user: result.user, csrf: result.csrf, requiresTwoFactorSetup: result.requiresTwoFactorSetup }, { "Set-Cookie": auth.cookie(result.token) }); }
    catch (error) { return sendJson(response, error.status || 400, { error: error.message }); }
  }
  if (request.method === "GET" && url.pathname === "/api/auth/me") {
    const current = auth.sessionFrom(request); return current ? sendJson(response, 200, { user: current.safeUser, csrf: current.session.csrf, requiresTwoFactorSetup: current.user.role === "admin" && !current.user.twoFactor?.enabled }) : sendJson(response, 401, { error: "Autenticação necessária." });
  }
  if (request.method === "POST" && url.pathname === "/api/auth/logout") { auth.logout(request); return sendJson(response, 200, { ok: true }, { "Set-Cookie": auth.clearCookie() }); }
  if (request.method === "POST" && url.pathname === "/api/auth/2fa/setup") { try { return sendJson(response, 200, auth.setupTwoFactor(request)); } catch (error) { return sendJson(response, error.status || 400, { error: error.message }); } }
  if (request.method === "POST" && url.pathname === "/api/auth/2fa/confirm") { try { const body = JSON.parse((await readBody(request)).toString("utf8")); return sendJson(response, 200, { user: auth.confirmTwoFactor(request, body.code) }); } catch (error) { return sendJson(response, error.status || 400, { error: error.message }); } }
  if (request.method === "POST" && url.pathname === "/api/auth/forgot-password") { const body = JSON.parse((await readBody(request)).toString("utf8")); const token = auth.requestReset(body.email); return sendJson(response, 200, { message: "Se a conta existir, as instruções serão enviadas.", developmentResetToken: config.appEnv === "development" ? token : undefined }); }
  if (request.method === "POST" && url.pathname === "/api/auth/reset-password") { try { const body = JSON.parse((await readBody(request)).toString("utf8")); auth.resetPassword(body.token, body.password); return sendJson(response, 200, { ok: true }); } catch (error) { return sendJson(response, 400, { error: error.message }); } }
  if (url.pathname === "/api/admin/users") {
    try { const current = auth.authorize(request, ["admin"], request.method !== "GET"); if (request.method === "GET") return sendJson(response, 200, auth.listUsers()); if (request.method === "POST") { const body = JSON.parse((await readBody(request)).toString("utf8")); return sendJson(response, 201, auth.createUser(body, current.safeUser)); } }
    catch (error) { return sendJson(response, error.status || 400, { error: error.message, code: error.code }); }
  }
  if (request.method === "GET" && url.pathname === "/api/admin/audit") { try { auth.authorize(request, ["admin"]); return sendJson(response, 200, auth.listAudit()); } catch (error) { return sendJson(response, error.status || 400, { error: error.message }); } }
  if (request.method === "OPTIONS" && url.pathname.startsWith("/api/inventory")) {
    response.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token", "Access-Control-Allow-Methods": "GET, PUT, OPTIONS" });
    return response.end();
  }
  if (url.pathname === "/api/inventory/snapshot") {
    let current = null;
    try { current = auth.authorize(request, request.method === "GET" ? ["admin", "stock", "support"] : ["admin", "stock"], request.method !== "GET"); }
    catch (error) { if (!isAdmin(request)) return sendJson(response, error.status || 401, { error: error.message, code: error.code }); }
    if (request.method === "GET") return sendJson(response, 200, inventory.snapshot());
    if (request.method === "PUT") {
      try {
        const body = JSON.parse((await readBody(request)).toString("utf8"));
        const result = inventory.replace(body); auth.audit(current?.safeUser || null, "inventory.update", { fromRevision: body.revision, toRevision: result.revision }); return sendJson(response, 200, result);
      } catch (error) {
        return sendJson(response, error.code === "REVISION_CONFLICT" ? 409 : 400, { error: error.message, currentRevision: error.currentRevision });
      }
    }
  }
  if (request.method === "GET" && url.pathname === "/api/catalog") return sendJson(response, 200, catalog.available());
  if (request.method === "GET" && publicFiles[url.pathname] && (config.simulatorEnabled || url.pathname.startsWith("/estoque"))) {
    const [file, type] = publicFiles[url.pathname];
    response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY", "Content-Security-Policy": "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" });
    return response.end(fs.readFileSync(path.join(config.root, "public", file)));
  }
  if (request.method === "POST" && url.pathname === "/api/chat" && config.simulatorEnabled) {
    try {
      const body = JSON.parse((await readBody(request)).toString("utf8"));
      if (typeof body.message !== "string" || !body.message.trim() || body.message.length > 1000) return sendJson(response, 400, { error: "Mensagem inválida" });
      const sessionId = String(body.sessionId || "simulador").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
      const result = await bot.handle(`sim-${sessionId}`, body.message, String(body.name || "Cliente").slice(0, 80));
      return sendJson(response, 200, { messages: result.messages, orderId: result.order?.id, handoff: Boolean(result.handoff) });
    } catch { return sendJson(response, 400, { error: "Não foi possível processar a mensagem" }); }
  }
  if (request.method === "POST" && url.pathname === "/api/reset" && config.simulatorEnabled) {
    try {
      const body = JSON.parse((await readBody(request)).toString("utf8"));
      const key = `sim-${String(body.sessionId || "simulador").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80)}`;
      const all = sessions.read(); delete all[key]; sessions.write(all);
      return sendJson(response, 200, { ok: true });
    } catch { return sendJson(response, 400, { error: "Falha ao reiniciar" }); }
  }
  if (request.method === "GET" && url.pathname === "/health") { response.writeHead(200, { "Content-Type": "application/json" }); return response.end(JSON.stringify({ ok: true, whatsappConfigured: whatsapp.configured() })); }
  if (request.method === "GET" && url.pathname === "/webhook") {
    const valid = url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === config.verifyToken;
    response.writeHead(valid ? 200 : 403); return response.end(valid ? url.searchParams.get("hub.challenge") ?? "" : "Token inválido");
  }
  if (request.method === "POST" && url.pathname === "/webhook") {
    try {
      const raw = await readBody(request);
      if (!verifySignature(raw, request.headers["x-hub-signature-256"], config.appSecret)) { response.writeHead(401); return response.end("Assinatura inválida"); }
      const messages = extractMessages(JSON.parse(raw.toString("utf8")));
      response.writeHead(200); response.end("EVENT_RECEIVED"); // Responde rápido para a Meta não repetir o evento.
      for (const message of messages) {
        await whatsapp.markRead(message.id);
        const result = await bot.handle(message.from, message.text, message.name);
        for (const text of result.messages) await whatsapp.sendText(message.from, text);
        if (result.order && config.storeNumber) await whatsapp.sendText(config.storeNumber, orderForStore(result.order));
        if (result.handoff && config.storeNumber) await whatsapp.sendText(config.storeNumber, `🙋 Cliente ${message.name} (${message.from}) solicitou atendimento humano.`);
      }
      return;
    } catch (error) { console.error(error); if (!response.headersSent) { response.writeHead(500); response.end("Erro interno"); } return; }
  }
  response.writeHead(404); response.end("Não encontrado");
});

server.listen(config.port, () => console.log(`Bot da ${config.storeName} ativo em http://localhost:${config.port}`));
