import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream";
import { createGzip } from "node:zlib";
import { Catalog } from "./catalog.js";
import { StoreBot } from "./bot.js";
import { getConfig, loadEnv, validateConfig } from "./config.js";
import { JsonStore } from "./json-store.js";
import { InventoryService } from "./inventory.js";
import {
  extractMessages,
  verifySignature,
  WhatsAppClient,
} from "./whatsapp.js";
import { money } from "./utils.js";
import { AuthService } from "./auth.js";
import QRCode from "qrcode";
import { SlidingWindowRateLimiter, WebhookDeduplicator } from "./security.js";
import { CustomerAuthService } from "./customer-auth.js";
import { LocalCustomerAuthService } from "./local-customer-auth.js";
import { CommerceService, hashPrincipal } from "./commerce.js";
import { parseAssistantPayload, StoreAssistant } from "./store-assistant.js";
import {
  recommendSize,
  generateEmbroideryPreview,
  WaitlistService,
  calculateKitDiscount,
  buildKit,
  generateSocialProof,
  getAvailableCollectionDates,
  estimateDelivery,
  generateReorderQrData,
  ReferralService,
  generatePushPayload,
  createReverseLabel,
  getPlantaoMode,
  generateCareQrData,
} from "./premium-features.js";
import { LowStockNotifier } from "./low-stock-notifier.js";

await loadEnv();
const config = validateConfig(getConfig());
const inventory = new InventoryService(
  path.join(config.root, "runtime/inventory.json"),
  {
    seedFile: path.join(config.root, "data/inventory.seed.json"),
  },
);
const catalog = new Catalog(
  path.join(config.root, "data/catalog.json"),
  inventory,
);
const sessions = new JsonStore(
  path.join(config.root, "runtime/sessions.json"),
  {},
);
const orders = new JsonStore(path.join(config.root, "runtime/orders.json"), []);
const commerce = new CommerceService({
  inventory,
  catalog,
  storeNumber: config.storeNumber,
  storeName: config.storeName,
  handoffSecret: config.authEncryptionKey,
  reservationTtlMinutes: config.reservationTtlMinutes,
});
const bot = new StoreBot({
  catalog,
  sessions,
  orders,
  commerce,
  faqFile: path.join(config.root, "data/faqs.json"),
  config,
});
const whatsapp = new WhatsAppClient(config);
const authRateLimiter = new SlidingWindowRateLimiter({
  limit: 30,
  windowMs: 60_000,
});
const orderRateLimiter = new SlidingWindowRateLimiter({
  limit: 12,
  windowMs: 15 * 60_000,
});
const assistantIpRateLimiter = new SlidingWindowRateLimiter({
  limit: 60,
  windowMs: 5 * 60_000,
});
const assistantConversationRateLimiter = new SlidingWindowRateLimiter({
  limit: 24,
  windowMs: 5 * 60_000,
});
const webhookDeduplicator = new WebhookDeduplicator(
  new JsonStore(path.join(config.root, "runtime/webhook-events.json"), []),
);
const auth = new AuthService({
  usersFile: path.join(config.root, "runtime/users.json"),
  sessionsFile: path.join(config.root, "runtime/auth-sessions.json"),
  resetsFile: path.join(config.root, "runtime/password-resets.json"),
  auditFile: path.join(config.root, "runtime/audit.json"),
  encryptionKey: config.authEncryptionKey,
  adminEmail: config.bootstrapAdminEmail,
  adminPassword: config.bootstrapAdminPassword,
  secureCookies: config.appEnv === "production",
});
const googleOauthConfigured = Boolean(
  config.googleOauthClientId &&
  config.googleOauthClientSecret &&
  config.googleOauthCallbackUrl,
);
const customerAuth = googleOauthConfigured
  ? new CustomerAuthService({
      customersFile: path.join(config.root, "runtime/customers.json"),
      sessionsFile: path.join(config.root, "runtime/customer-sessions.json"),
      transactionsFile: path.join(
        config.root,
        "runtime/customer-oauth-transactions.json",
      ),
      clientId: config.googleOauthClientId,
      clientSecret: config.googleOauthClientSecret,
      callbackUrl: config.googleOauthCallbackUrl,
      sessionTtlMs: config.customerSessionTtlDays * 24 * 60 * 60_000,
      secureCookies: config.appEnv === "production",
    })
  : null;
const localCustomerAuth = new LocalCustomerAuthService({
  customersFile: path.join(config.root, "runtime/local-customers.json"),
  sessionsFile: path.join(config.root, "runtime/local-customer-sessions.json"),
  sessionTtlMs: config.customerSessionTtlDays * 24 * 60 * 60_000,
  secureCookies: config.appEnv === "production",
});
const storeAssistant = new StoreAssistant({ catalog, commerce, config });

const waitlistService = new WaitlistService(path.join(config.root, "runtime/waitlist.json"));
const referralService = new ReferralService(path.join(config.root, "runtime/referrals.json"));
const lowStockNotifier = new LowStockNotifier({
  whatsappClient: whatsapp,
  storeNumber: config.storeNumber,
  inventory,
});

const publicFiles = {
  "/": ["loja/index.html", "text/html; charset=utf-8", "store"],
  "/loja": ["loja/index.html", "text/html; charset=utf-8", "store"],
  "/loja/": ["loja/index.html", "text/html; charset=utf-8", "store"],
  "/loja/styles.css": ["loja/styles.css", "text/css; charset=utf-8", "store"],
  "/loja/app.js": ["loja/app.js", "text/javascript; charset=utf-8", "store"],
  "/loja/legal.css": ["loja/legal.css", "text/css; charset=utf-8", "store"],
  "/privacidade": [
    "loja/privacidade.html",
    "text/html; charset=utf-8",
    "store",
  ],
  "/termos": ["loja/termos.html", "text/html; charset=utf-8", "store"],
  "/assets/sfl-hero.jpg": ["assets/sfl-hero.jpg", "image/jpeg", "asset"],
  "/assets/sfl-fabric.jpg": ["assets/sfl-fabric.jpg", "image/jpeg", "asset"],
  "/assets/sfl-coat.jpg": ["assets/sfl-coat.jpg", "image/jpeg", "asset"],
  "/assets/sfl-scrub.jpg": ["assets/sfl-scrub.jpg", "image/jpeg", "asset"],
  "/assets/sfl-coat-rear.jpg": [
    "assets/sfl-coat-rear.jpg",
    "image/jpeg",
    "asset",
  ],
  "/assets/sfl-scrub-angle.jpg": [
    "assets/sfl-scrub-angle.jpg",
    "image/jpeg",
    "asset",
  ],
  "/assets/sfl-fabric-white.jpg": [
    "assets/sfl-fabric-white.jpg",
    "image/jpeg",
    "asset",
  ],
  "/assets/brand/sfl-logo-stacked.png": [
    "assets/brand/sfl-logo-stacked.png",
    "image/png",
    "asset",
  ],
  "/assets/brand/sfl-logo-horizontal.png": [
    "assets/brand/sfl-logo-horizontal.png",
    "image/png",
    "asset",
  ],
  "/assets/brand/sfl-logo-monogram.png": [
    "assets/brand/sfl-logo-monogram.png",
    "image/png",
    "asset",
  ],
  "/assets/brand/sfl-monogram-512.png": [
    "assets/brand/sfl-monogram-512.png",
    "image/png",
    "asset",
  ],
  "/simulador": ["index.html", "text/html; charset=utf-8", "simulator"],
  "/simulador/": ["index.html", "text/html; charset=utf-8", "simulator"],
  "/simulador/styles.css": [
    "styles.css",
    "text/css; charset=utf-8",
    "simulator",
  ],
  "/simulador/app.js": [
    "app.js",
    "text/javascript; charset=utf-8",
    "simulator",
  ],
  "/styles.css": ["styles.css", "text/css; charset=utf-8", "simulator"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8", "simulator"],
  "/estoque": ["estoque/index.html", "text/html; charset=utf-8"],
  "/estoque/": ["estoque/index.html", "text/html; charset=utf-8"],
  "/estoque/styles.css": ["estoque/styles.css", "text/css; charset=utf-8"],
  "/estoque/auth.css": ["estoque/auth.css", "text/css; charset=utf-8"],
  "/estoque/api.js": ["estoque/api.js", "text/javascript; charset=utf-8"],
  "/estoque/app.js": ["estoque/app.js", "text/javascript; charset=utf-8"],
};

function sendJson(response, status, value, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    ...(config.appEnv === "production"
      ? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains" }
      : {}),
    ...(status === 413 ? { Connection: "close" } : {}),
    ...headers,
  });
  response.end(JSON.stringify(value));
}

function redirect(response, status, location, headers = {}) {
  response.writeHead(status, {
    Location: location,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    ...(config.appEnv === "production"
      ? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains" }
      : {}),
    ...headers,
  });
  response.end();
}

function loginErrorLocation(returnTo = "/loja") {
  try {
    const target = new URL(returnTo, "https://store.invalid");
    target.searchParams.set("login", "erro");
    return `${target.pathname}${target.search}`;
  } catch {
    return "/loja?login=erro";
  }
}

function sendStaticFile(response, absolutePath, type, cache, request) {
  const stream = fs.createReadStream(absolutePath);
  let opened = false;
  stream.once("open", () => {
    opened = true;
    const compressible = /^(?:text\/|application\/(?:javascript|json))/.test(type);
    const acceptsGzip = /\bgzip\b/i.test(String(request.headers["accept-encoding"] || ""));
    const useGzip = compressible && acceptsGzip;
    response.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": cache,
      ...(useGzip ? { "Content-Encoding": "gzip", Vary: "Accept-Encoding" } : {}),
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
      "Permissions-Policy":
        "camera=(), microphone=(), geolocation=(), payment=()",
      "Content-Security-Policy":
        "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
    });
    pipeline(useGzip ? stream.pipe(createGzip({ level: 6 })) : stream, response, (error) => {
      if (error && !response.destroyed) response.destroy();
    });
  });
  stream.once("error", () => {
    if (!opened && !response.headersSent)
      sendJson(response, 404, { error: "Não encontrado" });
    else response.destroy();
  });
}

function isAdmin(request) {
  return (
    config.appEnv !== "production" &&
    Boolean(config.adminToken) &&
    request.headers["x-admin-token"] === config.adminToken
  );
}

function requestContext(request) {
  return {
    ip: request.socket.remoteAddress || "",
    userAgent: request.headers["user-agent"] || "",
  };
}

function sendStoreError(response, error) {
  const status =
    Number(error?.status) || (error instanceof SyntaxError ? 400 : 500);
  const code =
    typeof error?.code === "string"
      ? error.code
      : status === 400
        ? "INVALID_ORDER"
        : "STORE_ERROR";
  const message =
    status >= 500
      ? code === "STORE_NOT_READY"
        ? "A loja ainda não está pronta para receber pedidos."
        : "Não foi possível processar o pedido agora."
      : String(error?.message || "Pedido inválido.").slice(0, 200);
  const details =
    status === 409 && error?.details && typeof error.details === "object"
      ? error.details
      : undefined;
  return sendJson(response, status, {
    error: { code, message, ...(details ? { details } : {}) },
  });
}

function sendAssistantError(response, error) {
  const status =
    Number(error?.status) || (error instanceof SyntaxError ? 400 : 500);
  const code =
    typeof error?.code === "string"
      ? error.code
      : error instanceof SyntaxError
        ? "INVALID_JSON"
        : status === 413
          ? "ASSISTANT_PAYLOAD_TOO_LARGE"
          : status < 500
            ? "INVALID_ASSISTANT_REQUEST"
            : "ASSISTANT_UNAVAILABLE";
  const message =
    status >= 500
      ? "O assistente está temporariamente indisponível."
      : error instanceof SyntaxError
        ? "O corpo JSON é inválido."
        : String(
            error?.message || "Não foi possível processar a mensagem.",
          ).slice(0, 200);
  return sendJson(response, status, { error: { code, message } });
}

function hasJsonContentType(request) {
  return (
    String(request.headers["content-type"] || "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase() === "application/json"
  );
}

function orderPrincipal(request) {
  if (customerAuth) {
    const current = customerAuth.sessionFrom(request);
    if (current) {
      customerAuth.requireCsrf(request);
      return hashPrincipal("customer", current.user.sub);
    }
  }
  const local = localCustomerAuth.sessionFrom(request);
  if (local) {
    localCustomerAuth.requireCsrf(request);
    return hashPrincipal("customer", local.user.id);
  }
  const context = requestContext(request);
  const anonymousFingerprint = `${context.ip}\n${String(context.userAgent).slice(0, 300)}`;
  return hashPrincipal("guest", anonymousFingerprint || crypto.randomUUID());
}

function readBody(request, maxBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const onData = (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > maxBytes) {
        settled = true;
        request.pause();
        reject(
          Object.assign(new Error("Payload excede o limite permitido."), {
            status: 413,
          }),
        );
        return;
      }
      chunks.push(chunk);
    };
    request.on("data", onData);
    request.on("end", () => {
      if (!settled) {
        settled = true;
        resolve(Buffer.concat(chunks));
      }
    });
    request.on("error", (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
  });
}

function requireCsrf(request) {
  const current = auth.sessionFrom(request);
  if (!current)
    throw Object.assign(new Error("Autenticação necessária."), { status: 401 });
  if (request.headers["x-csrf-token"] !== current.session.csrf)
    throw Object.assign(new Error("Proteção CSRF inválida."), { status: 403 });
  return current;
}

function orderForStore(order) {
  const items = order.items
    .map((x) => `• ${x.name} (${x.variant}) × ${x.qty}`)
    .join("\n");
  const note = order.note ? `\nObservação: ${order.note}` : "";
  return `🔔 *NOVO PEDIDO ${order.id}*\nCliente: ${order.customer}\nWhatsApp: ${order.user}\n${items}\nEntrega: ${order.delivery}\nEndereço: ${order.address}${note}\nTotal estimado: ${money(order.total)}\n\nResponda ao cliente para confirmar estoque, prazo e pagamento.`;
}

async function handleRequest(request, response) {
  let url;
  try {
    url = new URL(request.url || "/", "http://localhost");
  } catch {
    return sendJson(response, 400, { error: "Solicitação inválida." });
  }
  if (
    request.method === "POST" &&
    [
      "/api/auth/login",
      "/api/auth/forgot-password",
      "/api/auth/reset-password",
    ].includes(url.pathname)
  ) {
    const rate = authRateLimiter.consume(
      request.socket.remoteAddress || "unknown",
    );
    if (!rate.allowed)
      return sendJson(
        response,
        429,
        { error: "Muitas solicitações. Tente novamente em instantes." },
        { "Retry-After": String(rate.retryAfterSeconds) },
      );
  }
  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    try {
      const result = auth.login(
        JSON.parse((await readBody(request)).toString("utf8")),
        requestContext(request),
      );
      if (result.requiresTwoFactor) return sendJson(response, 202, result);
      return sendJson(
        response,
        200,
        {
          user: result.user,
          csrf: result.csrf,
          requiresTwoFactorSetup: result.requiresTwoFactorSetup,
        },
        { "Set-Cookie": auth.cookie(result.token) },
      );
    } catch (error) {
      return sendJson(response, error.status || 400, { error: error.message });
    }
  }
  if (request.method === "GET" && url.pathname === "/api/auth/me") {
    const current = auth.sessionFrom(request);
    return current
      ? sendJson(response, 200, {
          user: current.safeUser,
          csrf: current.session.csrf,
          requiresTwoFactorSetup:
            current.user.role === "admin" && !current.user.twoFactor?.enabled,
        })
      : sendJson(response, 401, { error: "Autenticação necessária." });
  }
  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    try {
      requireCsrf(request);
      auth.logout(request);
      return sendJson(
        response,
        200,
        { ok: true },
        { "Set-Cookie": auth.clearCookie() },
      );
    } catch (error) {
      return sendJson(response, error.status || 400, { error: error.message });
    }
  }
  if (request.method === "POST" && url.pathname === "/api/auth/2fa/setup") {
    try {
      requireCsrf(request);
      const setup = auth.setupTwoFactor(request);
      setup.qrCode = await QRCode.toDataURL(setup.uri, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 280,
        color: { dark: "#101B2DFF", light: "#FFFFFFFF" },
      });
      return sendJson(response, 200, setup);
    } catch (error) {
      return sendJson(response, error.status || 400, { error: error.message });
    }
  }
  if (request.method === "POST" && url.pathname === "/api/auth/2fa/confirm") {
    try {
      requireCsrf(request);
      const body = JSON.parse((await readBody(request)).toString("utf8"));
      return sendJson(response, 200, {
        user: auth.confirmTwoFactor(request, body.code),
      });
    } catch (error) {
      return sendJson(response, error.status || 400, { error: error.message });
    }
  }
  if (
    request.method === "POST" &&
    url.pathname === "/api/auth/forgot-password"
  ) {
    const body = JSON.parse((await readBody(request)).toString("utf8"));
    const token = auth.requestReset(body.email);
    return sendJson(response, 200, {
      message: "Se a conta existir, as instruções serão enviadas.",
      developmentResetToken: config.exposeDevelopmentResetToken
        ? token
        : undefined,
    });
  }
  if (
    request.method === "POST" &&
    url.pathname === "/api/auth/reset-password"
  ) {
    try {
      const body = JSON.parse((await readBody(request)).toString("utf8"));
      auth.resetPassword(body.token, body.password);
      return sendJson(response, 200, { ok: true });
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
  }
  if (url.pathname === "/api/admin/users") {
    try {
      const current = auth.authorize(
        request,
        ["admin"],
        request.method !== "GET",
      );
      if (request.method === "GET")
        return sendJson(response, 200, auth.listUsers());
      if (request.method === "POST") {
        const body = JSON.parse((await readBody(request)).toString("utf8"));
        return sendJson(response, 201, auth.createUser(body, current.safeUser));
      }
    } catch (error) {
      return sendJson(response, error.status || 400, {
        error: error.message,
        code: error.code,
      });
    }
  }
  if (request.method === "GET" && url.pathname === "/api/admin/audit") {
    try {
      auth.authorize(request, ["admin"]);
      return sendJson(response, 200, auth.listAudit());
    } catch (error) {
      return sendJson(response, error.status || 400, { error: error.message });
    }
  }
  if (
    request.method === "OPTIONS" &&
    url.pathname.startsWith("/api/inventory")
  ) {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token",
      "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    });
    return response.end();
  }
  if (url.pathname === "/api/inventory/snapshot") {
    let current = null;
    try {
      current = auth.authorize(
        request,
        request.method === "GET"
          ? ["admin", "stock", "support"]
          : ["admin", "stock"],
        request.method !== "GET",
      );
    } catch (error) {
      if (!isAdmin(request))
        return sendJson(response, error.status || 401, {
          error: error.message,
          code: error.code,
        });
    }
    if (request.method === "GET") {
      try {
        return sendJson(response, 200, inventory.snapshot());
      } catch (error) {
        return sendJson(response, error.status || 503, {
          error: "O estoque está temporariamente indisponível.",
          code: error.code || "INVENTORY_UNAVAILABLE",
        });
      }
    }
    if (request.method === "PUT") {
      try {
        const body = JSON.parse((await readBody(request)).toString("utf8"));
        const result = inventory.replace(body);
        auth.audit(current?.safeUser || null, "inventory.update", {
          fromRevision: body.revision,
          toRevision: result.revision,
        });
        return sendJson(response, 200, result);
      } catch (error) {
        return sendJson(
          response,
          error.status || (error.code === "REVISION_CONFLICT" ? 409 : 400),
          {
            error:
              error.status >= 500
                ? "O estoque está temporariamente indisponível."
                : error.message,
            code: error.code,
            currentRevision: error.currentRevision,
          },
        );
      }
    }
  }
  if (request.method === "GET" && url.pathname === "/api/catalog") {
    try {
      return sendJson(response, 200, catalog.available());
    } catch (error) {
      return sendStoreError(response, error);
    }
  }
  if (request.method === "GET" && publicFiles[url.pathname]) {
    const [file, type, scope] = publicFiles[url.pathname];
    if (scope === "simulator" && !config.simulatorEnabled)
      return sendJson(response, 404, { error: "Não encontrado" });
    const cache = scope === "asset"
      ? "public, max-age=86400"
      : /\.(?:css|js)$/.test(file)
        ? "public, max-age=300"
        : "no-store";
    return sendStaticFile(
      response,
      path.join(config.root, "public", file),
      type,
      cache,
      request,
    );
  }
  if (
    request.method === "GET" &&
    url.pathname === "/api/customer-auth/google/start"
  ) {
    if (!customerAuth)
      return sendJson(response, 503, {
        error: "Acesso com Google temporariamente indisponível.",
      });
    const rate = authRateLimiter.consume(
      `google:${request.socket.remoteAddress || "unknown"}`,
    );
    if (!rate.allowed)
      return sendJson(
        response,
        429,
        { error: "Muitas solicitações. Tente novamente em instantes." },
        { "Retry-After": String(rate.retryAfterSeconds) },
      );
    try {
      const result = customerAuth.beginLogin({
        returnTo: url.searchParams.get("returnTo") || "/loja",
      });
      return redirect(response, 302, result.authorizationUrl, {
        "Set-Cookie": result.cookie,
      });
    } catch (error) {
      return sendJson(response, error.status || 400, {
        error: "Não foi possível iniciar o acesso com Google.",
      });
    }
  }
  if (
    request.method === "GET" &&
    url.pathname === "/api/customer-auth/google/callback"
  ) {
    if (!customerAuth) return redirect(response, 303, "/loja?login=erro");
    const rate = authRateLimiter.consume(
      `google:${request.socket.remoteAddress || "unknown"}`,
    );
    if (!rate.allowed)
      return redirect(response, 303, "/loja?login=erro", {
        "Retry-After": String(rate.retryAfterSeconds),
        "Set-Cookie": customerAuth.clearTransientCookie(),
      });
    let returnTo = "/loja";
    try {
      if (url.searchParams.has("error")) {
        const transaction = customerAuth.consumeTransaction(
          request.headers.cookie || "",
          url.searchParams.get("state"),
        );
        returnTo = transaction.returnTo;
        return redirect(response, 303, loginErrorLocation(returnTo), {
          "Set-Cookie": customerAuth.clearTransientCookie(),
        });
      }
      const result = await customerAuth.completeLogin(
        {
          code: url.searchParams.get("code"),
          state: url.searchParams.get("state"),
          cookieHeader: request.headers.cookie || "",
        },
        requestContext(request),
      );
      return redirect(response, 303, result.returnTo, {
        "Set-Cookie": result.setCookies,
      });
    } catch {
      return redirect(response, 303, loginErrorLocation(returnTo), {
        "Set-Cookie": customerAuth.clearTransientCookie(),
      });
    }
  }
  if (request.method === "POST" && ["/api/customer-auth/register", "/api/customer-auth/login"].includes(url.pathname)) {
    try {
      const body = JSON.parse((await readBody(request, 16_384)).toString("utf8"));
      const registering = url.pathname.endsWith("register");
      const result = registering ? localCustomerAuth.register(body) : localCustomerAuth.login(body);
      return sendJson(response, registering ? 201 : 200, { user: result.user, csrf: result.csrf }, { "Set-Cookie": localCustomerAuth.cookie(result.token) });
    } catch (error) {
      return sendJson(response, error.status || 400, { error: error.message });
    }
  }
  if (request.method === "GET" && url.pathname === "/api/customer-auth/me") {
    if (!customerAuth)
      return sendJson(response, 503, {
        error: "Acesso com Google temporariamente indisponível.",
      });
    try {
      return sendJson(response, 200, customerAuth.me(request));
    } catch (error) {
      return sendJson(response, error.status || 401, {
        error: "Autenticação necessária.",
      });
    }
  }
  if (
    request.method === "POST" &&
    url.pathname === "/api/customer-auth/logout"
  ) {
    if (!customerAuth)
      return sendJson(response, 503, {
        error: "Acesso com Google temporariamente indisponível.",
      });
    try {
      const result = customerAuth.logout(request);
      return sendJson(
        response,
        200,
        { ok: true },
        { "Set-Cookie": result.cookie },
      );
    } catch (error) {
      return sendJson(response, error.status || 400, {
        error:
          error.status === 403
            ? "Proteção CSRF inválida."
            : "Autenticação necessária.",
      });
    }
  }
  if (request.method === "GET" && url.pathname === "/api/store/config") {
    return sendJson(response, 200, commerce.publicConfig());
  }
  if (url.pathname === "/api/store/assistant") {
    if (request.method !== "POST") {
      return sendJson(
        response,
        405,
        {
          error: {
            code: "METHOD_NOT_ALLOWED",
            message: "Use POST para conversar com o assistente.",
          },
        },
        { Allow: "POST" },
      );
    }
    try {
      if (!hasJsonContentType(request)) {
        throw Object.assign(
          new Error("Content-Type deve ser application/json."),
          {
            status: 400,
            code: "INVALID_CONTENT_TYPE",
          },
        );
      }
      const context = requestContext(request);
      const principal = hashPrincipal(
        "guest",
        `${context.ip}\n${String(context.userAgent).slice(0, 300)}`,
      );
      const ipKey = crypto
        .createHash("sha256")
        .update(context.ip || "unknown")
        .digest("hex");
      const ipRate = assistantIpRateLimiter.consume(ipKey);
      if (!ipRate.allowed) {
        return sendJson(
          response,
          429,
          {
            error: {
              code: "ASSISTANT_RATE_LIMITED",
              message:
                "Muitas mensagens em pouco tempo. Aguarde alguns minutos.",
            },
          },
          { "Retry-After": String(ipRate.retryAfterSeconds) },
        );
      }
      const payload = JSON.parse(
        (await readBody(request, 12_288)).toString("utf8"),
      );
      const validated = parseAssistantPayload(payload);
      const conversationKey = `${principal}:${validated.conversationId || "new"}`;
      const conversationRate =
        assistantConversationRateLimiter.consume(conversationKey);
      if (!conversationRate.allowed) {
        return sendJson(
          response,
          429,
          {
            error: {
              code: "ASSISTANT_RATE_LIMITED",
              message:
                "Esta conversa atingiu o limite temporário. Aguarde alguns minutos.",
            },
          },
          { "Retry-After": String(conversationRate.retryAfterSeconds) },
        );
      }
      return sendJson(
        response,
        200,
        storeAssistant.answer(validated, { principal }),
      );
    } catch (error) {
      return sendAssistantError(response, error);
    }
  }
  if (request.method === "POST" && url.pathname === "/api/store/orders") {
    try {
      if (
        !String(request.headers["content-type"] || "")
          .toLowerCase()
          .startsWith("application/json")
      ) {
        throw Object.assign(
          new Error("Content-Type deve ser application/json."),
          { status: 400, code: "INVALID_ORDER" },
        );
      }
      const principal = orderPrincipal(request);
      const rate = orderRateLimiter.consume(principal);
      if (!rate.allowed) {
        return sendJson(
          response,
          429,
          {
            error: {
              code: "ORDER_RATE_LIMITED",
              message: "Muitas tentativas de pedido. Aguarde alguns minutos.",
            },
          },
          { "Retry-After": String(rate.retryAfterSeconds) },
        );
      }
      const payload = JSON.parse(
        (await readBody(request, 32_768)).toString("utf8"),
      );
      const result = commerce.placeOrder({
        principal,
        idempotencyKey: request.headers["idempotency-key"],
        payload,
        source: "storefront",
      });
      return sendJson(
        response,
        result.replayed ? 200 : 201,
        {
          order: result.publicOrder,
          whatsappUrl: result.whatsappUrl,
        },
        result.replayed ? { "Idempotency-Replayed": "true" } : {},
      );
    } catch (error) {
      return sendStoreError(response, error);
    }
  }

  // ==================== PREMIUM FEATURES V2 - Surgery For Life ====================
  if (request.method === "POST" && url.pathname === "/api/size-recommend") {
    try {
      const body = JSON.parse((await readBody(request, 8192)).toString("utf8"));
      const result = recommendSize({
        heightCm: body.heightCm || body.altura,
        weightKg: body.weightKg || body.peso,
        bodyType: body.bodyType || body.corpo || "medio",
        preferencia: body.preferencia || body.preferenciaTamanho || "confortavel",
      });
      return sendJson(response, 200, result);
    } catch (error) {
      return sendJson(response, 400, { error: "Medidas inválidas", details: error.message });
    }
  }
  if (request.method === "POST" && url.pathname === "/api/embroidery-preview") {
    try {
      const body = JSON.parse((await readBody(request, 8192)).toString("utf8"));
      const result = generateEmbroideryPreview({
        name: body.name,
        crm: body.crm,
        color: body.color || "#D6BE9D",
        font: body.font || "serif",
      });
      return sendJson(response, 200, result);
    } catch (error) {
      return sendJson(response, 400, { error: "Dados bordado inválidos" });
    }
  }
  if (request.method === "POST" && url.pathname === "/api/waitlist") {
    try {
      const body = JSON.parse((await readBody(request, 8192)).toString("utf8"));
      const sku = String(body.sku||"").slice(0,100);
      const customerName = String(body.customerName||body.nome||"").slice(0,80);
      const whatsapp = String(body.whatsapp||"").replace(/\D/g,"");
      if (!sku || !whatsapp) throw new Error("SKU e WhatsApp obrigatórios");
      const result = waitlistService.add({ sku, productName: body.productName||sku, color: body.color, size: body.size, customerName, whatsapp, email: body.email });
      const pending = waitlistService.getBySku(sku).length;
      return sendJson(response, result.already?200:201, { ...result, position: pending, totalPending: pending });
    } catch (error) {
      return sendJson(response, 400, { error: error.message || "Falha ao entrar na lista" });
    }
  }
  if (request.method === "GET" && url.pathname === "/api/waitlist") {
    const sku = url.searchParams.get("sku");
    if (sku) {
      return sendJson(response, 200, { sku, pending: waitlistService.getBySku(sku), count: waitlistService.getBySku(sku).length });
    }
    return sendJson(response, 200, waitlistService.stats());
  }
  if (request.method === "GET" && url.pathname === "/api/collection-dates") {
    const dates = getAvailableCollectionDates({});
    // Enrich with delivery estimate for Recife as example
    const enriched = dates.map(d => ({ ...d, estimate: estimateDelivery(d.date, "50000000") }));
    return sendJson(response, 200, enriched);
  }
  if (request.method === "GET" && url.pathname === "/api/social-proof") {
    const product = url.searchParams.get("product") || "Scrub Noir";
    return sendJson(response, 200, { message: generateSocialProof(product), product });
  }
  if (request.method === "POST" && url.pathname === "/api/kit-builder") {
    try {
      const body = JSON.parse((await readBody(request, 8192)).toString("utf8"));
      const items = Array.isArray(body.items) ? body.items : [];
      if (items.length < 1) throw new Error("Kit precisa de pelo menos 1 item");
      const kit = buildKit(items);
      return sendJson(response, 200, kit);
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
  }
  if (request.method === "GET" && url.pathname === "/api/qr/reorder") {
    try {
      const sku = url.searchParams.get("sku");
      if (!sku) throw new Error("SKU obrigatório");
      const data = generateReorderQrData({ sku, customerId: url.searchParams.get("customerId"), orderCode: url.searchParams.get("order") });
      const qrDataUrl = await QRCode.toDataURL(data, { width: 240, margin: 1 });
      return sendJson(response, 200, { sku, reorderUrl: data, qrDataUrl });
    } catch (error) {
      return sendJson(response, 400, { error: "Falha ao gerar QR" });
    }
  }
  if (request.method === "POST" && url.pathname === "/api/referral") {
    try {
      const body = JSON.parse((await readBody(request, 8192)).toString("utf8"));
      const result = referralService.createLink({ doctorName: body.doctorName, whatsapp: body.whatsapp, customCode: body.customCode });
      if (result.error) return sendJson(response, 400, result);
      return sendJson(response, 201, result);
    } catch (error) {
      return sendJson(response, 400, { error: "Falha ao criar link indicação" });
    }
  }
  if (request.method === "GET" && url.pathname === "/api/referral") {
    const code = url.searchParams.get("code");
    return sendJson(response, 200, referralService.getStats(code));
  }
  if (request.method === "POST" && url.pathname === "/api/referral/sale") {
    try {
      const body = JSON.parse((await readBody(request, 8192)).toString("utf8"));
      const tracked = referralService.trackSale(body.refCode, Number(body.orderValue)||0);
      return sendJson(response, tracked?200:404, tracked?{ ok:true, referral: tracked }:{ error:"Ref não encontrado" });
    } catch (error) {
      return sendJson(response, 400, { error: "Falha ao rastrear venda" });
    }
  }
  if (request.method === "POST" && url.pathname === "/api/reverse") {
    try {
      const body = JSON.parse((await readBody(request, 8192)).toString("utf8"));
      const reverse = createReverseLabel({ originalOrder: body.originalOrder, reason: body.reason, sku: body.sku, quantity: body.quantity||1 });
      return sendJson(response, 201, reverse);
    } catch (error) {
      return sendJson(response, 400, { error: "Falha ao criar devolução" });
    }
  }
  if (request.method === "GET" && url.pathname === "/api/plantao-mode") {
    return sendJson(response, 200, getPlantaoMode());
  }
  // ==================== FIM PREMIUM FEATURES ====================

  if (
    request.method === "POST" &&
    url.pathname === "/api/chat" &&
    config.simulatorEnabled
  ) {
    try {
      const body = JSON.parse((await readBody(request)).toString("utf8"));
      if (
        typeof body.message !== "string" ||
        !body.message.trim() ||
        body.message.length > 1000
      )
        return sendJson(response, 400, { error: "Mensagem inválida" });
      const sessionId = String(body.sessionId || "simulador")
        .replace(/[^a-zA-Z0-9_-]/g, "")
        .slice(0, 80);
      const result = await bot.handle(
        `sim-${sessionId}`,
        body.message,
        String(body.name || "Cliente").slice(0, 80),
      );
      return sendJson(response, 200, {
        messages: result.messages,
        orderId: result.order?.id,
        handoff: Boolean(result.handoff),
      });
    } catch (error) {
      return sendJson(response, error.status || 400, {
        error:
          error.status === 413
            ? error.message
            : "Não foi possível processar a mensagem",
      });
    }
  }
  if (
    request.method === "POST" &&
    url.pathname === "/api/reset" &&
    config.simulatorEnabled
  ) {
    try {
      const body = JSON.parse((await readBody(request)).toString("utf8"));
      const key = `sim-${String(body.sessionId || "simulador")
        .replace(/[^a-zA-Z0-9_-]/g, "")
        .slice(0, 80)}`;
      const all = sessions.read();
      delete all[key];
      sessions.write(all);
      return sendJson(response, 200, { ok: true });
    } catch {
      return sendJson(response, 400, { error: "Falha ao reiniciar" });
    }
  }
  if (request.method === "GET" && url.pathname === "/health") {
    const assistant = storeAssistant.status();
    return sendJson(response, 200, {
      ok: true,
      whatsappConfigured: whatsapp.configured(),
      assistantAvailable: assistant.available,
      assistantCatalogAvailable: assistant.catalogAvailable,
      assistantMode: assistant.mode,
    });
  }
  if (request.method === "GET" && url.pathname === "/webhook") {
    const valid =
      url.searchParams.get("hub.mode") === "subscribe" &&
      url.searchParams.get("hub.verify_token") === config.verifyToken;
    response.writeHead(valid ? 200 : 403);
    return response.end(
      valid ? (url.searchParams.get("hub.challenge") ?? "") : "Token inválido",
    );
  }
  if (request.method === "POST" && url.pathname === "/webhook") {
    try {
      const raw = await readBody(request);
      if (
        !verifySignature(
          raw,
          request.headers["x-hub-signature-256"],
          config.appSecret,
        )
      ) {
        response.writeHead(401);
        return response.end("Assinatura inválida");
      }
      const messages = extractMessages(JSON.parse(raw.toString("utf8")));
      response.writeHead(200);
      response.end("EVENT_RECEIVED"); // Responde rápido para a Meta não repetir o evento.
      for (const message of messages) {
        if (!webhookDeduplicator.claim(message.id)) continue;
        try {
          await whatsapp.markRead(message.id);
          const result = await bot.handle(
            message.from,
            message.text,
            message.name,
          );
          for (const text of result.messages)
            await whatsapp.sendText(message.from, text);
          if (result.order && config.storeNumber)
            await whatsapp.sendText(
              config.storeNumber,
              orderForStore(result.order),
            );
          if (result.handoff && config.storeNumber)
            await whatsapp.sendText(
              config.storeNumber,
              `🙋 Cliente ${message.name} (${message.from}) solicitou atendimento humano.`,
            );
        } catch (error) {
          webhookDeduplicator.release(message.id);
          throw error;
        }
      }
      return;
    } catch (error) {
      console.error(error);
      if (!response.headersSent) {
        const status = error?.status || (error instanceof SyntaxError ? 400 : 500);
        response.writeHead(status, {
          "Content-Type": "text/plain; charset=utf-8",
          ...(status === 413 ? { Connection: "close" } : {}),
        });
        response.end(
          status === 413
            ? "Payload excede o limite permitido."
            : status < 500
              ? "Solicitação inválida."
              : "Erro interno",
        );
      }
      return;
    }
  }
  response.writeHead(404);
  response.end("Não encontrado");
}

const server = http.createServer((request, response) => {
  void handleRequest(request, response).catch((error) => {
    console.error("Falha não tratada na requisição", {
      name: error?.name || "Error",
      code: error?.code || "UNHANDLED_REQUEST",
    });
    if (response.headersSent || response.destroyed) return response.destroy();
    const status = error?.status || (error instanceof SyntaxError ? 400 : 500);
    return sendJson(
      response,
      status,
      {
        error:
          status === 413
            ? "Payload excede o limite permitido."
            : status < 500
              ? "Solicitação inválida."
              : "Erro interno.",
      },
      status === 413 ? { Connection: "close" } : {},
    );
  });
});

server.on("clientError", (_error, socket) => {
  if (socket.writable)
    socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
});
server.requestTimeout = 15_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;
server.maxHeadersCount = 100;
server.maxRequestsPerSocket = 1_000;

server.listen(config.port, config.host, () =>
  console.log(
    `Bot da ${config.storeName} ativo em http://${config.host}:${config.port}`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));
