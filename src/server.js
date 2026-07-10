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

await loadEnv();
const config = getConfig();
const inventory = new InventoryService(path.join(config.root, "runtime/inventory.json"));
const catalog = new Catalog(path.join(config.root, "data/catalog.json"), inventory);
const sessions = new JsonStore(path.join(config.root, "runtime/sessions.json"), {});
const orders = new JsonStore(path.join(config.root, "runtime/orders.json"), []);
const bot = new StoreBot({ catalog, sessions, orders, faqFile: path.join(config.root, "data/faqs.json"), config });
const whatsapp = new WhatsAppClient(config);

const publicFiles = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
};

function sendJson(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" });
  response.end(JSON.stringify(value));
}

function isAdmin(request) {
  return Boolean(config.adminToken) && request.headers["x-admin-token"] === config.adminToken;
}

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
  if (request.method === "OPTIONS" && url.pathname.startsWith("/api/inventory")) {
    response.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token", "Access-Control-Allow-Methods": "GET, PUT, OPTIONS" });
    return response.end();
  }
  if (request.method === "GET" && url.pathname === "/estoque") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    return response.end(fs.readFileSync(path.join(config.root, "sistema_estoque_surgery_for_life_V2_IMPECAVEL (1).html")));
  }
  if (url.pathname === "/api/inventory/snapshot") {
    if (!isAdmin(request)) return sendJson(response, 401, { error: "Token administrativo inválido" });
    if (request.method === "GET") return sendJson(response, 200, inventory.snapshot());
    if (request.method === "PUT") {
      try {
        const body = JSON.parse((await readBody(request)).toString("utf8"));
        return sendJson(response, 200, inventory.replace(body));
      } catch (error) {
        return sendJson(response, error.code === "REVISION_CONFLICT" ? 409 : 400, { error: error.message, currentRevision: error.currentRevision });
      }
    }
  }
  if (request.method === "GET" && url.pathname === "/api/catalog") return sendJson(response, 200, catalog.available());
  if (request.method === "GET" && publicFiles[url.pathname] && config.simulatorEnabled) {
    const [file, type] = publicFiles[url.pathname];
    response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
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
