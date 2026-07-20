import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Lê .env sem biblioteca externa. Variáveis já existentes no sistema têm prioridade.
export async function loadEnv() {
  const fs = await import("node:fs");
  const file = path.join(root, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].trim();
  }
}

export function getConfig() {
  const appEnv = String(process.env.APP_ENV || process.env.NODE_ENV || "").trim();
  return {
    root,
    host: String(process.env.HOST || (appEnv === "production" ? "0.0.0.0" : "127.0.0.1")).trim(),
    port: Number(process.env.PORT || 3000),
    simulatorEnabled: process.env.ENABLE_SIMULATOR !== "false",
    adminToken: process.env.ADMIN_TOKEN || "",
    authEncryptionKey: process.env.AUTH_ENCRYPTION_KEY || "development-only-change-me",
    bootstrapAdminEmail: process.env.BOOTSTRAP_ADMIN_EMAIL || "",
    bootstrapAdminPassword: process.env.BOOTSTRAP_ADMIN_PASSWORD || "",
    googleOauthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
    googleOauthClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
    googleOauthCallbackUrl: process.env.GOOGLE_OAUTH_CALLBACK_URL || "",
    customerSessionTtlDays: Number(process.env.CUSTOMER_SESSION_TTL_DAYS || 30),
    exposeDevelopmentResetToken: process.env.EXPOSE_DEVELOPMENT_RESET_TOKEN === "true",
    appEnv,
    verifyToken: process.env.VERIFY_TOKEN || "",
    whatsappToken: process.env.WHATSAPP_TOKEN || "",
    phoneNumberId: process.env.PHONE_NUMBER_ID || "",
    appSecret: process.env.META_APP_SECRET || "",
    graphVersion: process.env.GRAPH_API_VERSION || "v23.0",
    storeNumber: process.env.STORE_WHATSAPP_NUMBER || "",
    storeName: process.env.STORE_NAME || "Minha Loja",
    reservationTtlMinutes: Number(process.env.RESERVATION_TTL_MINUTES || 30),
    storeTimezone: process.env.STORE_TIMEZONE || "America/Sao_Paulo",
    businessHours: process.env.BUSINESS_HOURS || "seg-sex 09:00-18:00",
    deliveryFee: Number(process.env.DELIVERY_FEE || 0),
    freeShippingFrom: Number(process.env.FREE_SHIPPING_FROM || 0),
  };
}

export function validateConfig(config) {
  if (!["development", "test", "production"].includes(config.appEnv)) throw new Error("APP_ENV deve ser development, test ou production.");
  if (typeof config.host !== "string" || !config.host || config.host.length > 253 || !/^[A-Za-z0-9.:-]+$/.test(config.host)) throw new Error("HOST inválido.");
  if (config.exposeDevelopmentResetToken && (config.appEnv !== "development" || !["127.0.0.1", "::1", "localhost"].includes(config.host))) throw new Error("EXPOSE_DEVELOPMENT_RESET_TOKEN só pode ser usado localmente em desenvolvimento.");
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error("PORT deve estar entre 1 e 65535.");
  if (config.customerSessionTtlDays !== undefined && (!Number.isInteger(config.customerSessionTtlDays) || config.customerSessionTtlDays < 1 || config.customerSessionTtlDays > 90)) throw new Error("CUSTOMER_SESSION_TTL_DAYS deve estar entre 1 e 90.");
  if (config.reservationTtlMinutes !== undefined && (!Number.isInteger(config.reservationTtlMinutes) || config.reservationTtlMinutes < 5 || config.reservationTtlMinutes > 1440)) throw new Error("RESERVATION_TTL_MINUTES deve estar entre 5 e 1440.");
  if (config.storeNumber && !/^\d{8,15}$/.test(config.storeNumber)) throw new Error("STORE_WHATSAPP_NUMBER deve conter somente 8 a 15 dígitos, incluindo o código do país.");
  const googleOauthValues = [config.googleOauthClientId, config.googleOauthClientSecret, config.googleOauthCallbackUrl];
  if (googleOauthValues.some(Boolean) && !googleOauthValues.every(Boolean)) throw new Error("GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET e GOOGLE_OAUTH_CALLBACK_URL devem ser configurados juntos.");
  if (googleOauthValues.every(Boolean)) {
    let callback;
    try { callback = new URL(config.googleOauthCallbackUrl); }
    catch { throw new Error("GOOGLE_OAUTH_CALLBACK_URL deve ser uma URL absoluta."); }
    if (!["http:", "https:"].includes(callback.protocol) || callback.username || callback.password || callback.hash) throw new Error("GOOGLE_OAUTH_CALLBACK_URL invalida.");
    if (config.appEnv === "production" && callback.protocol !== "https:") throw new Error("GOOGLE_OAUTH_CALLBACK_URL deve usar HTTPS em producao.");
  }
  if (![config.deliveryFee, config.freeShippingFrom].every((value) => Number.isFinite(value) && value >= 0 && value <= 10_000_000)) throw new Error("Valores de frete devem ser números válidos e não negativos.");
  if (config.appEnv === "production") {
    if (config.simulatorEnabled) throw new Error("ENABLE_SIMULATOR deve ser false em produção.");
    const looksLikePlaceholder = (value) => /^(?:crie|gere|troque|use|seu|segredo|token|development|exemplo)[-_ ]/i.test(String(value || ""));
    if (!config.authEncryptionKey || config.authEncryptionKey.length < 32 || looksLikePlaceholder(config.authEncryptionKey)) throw new Error("AUTH_ENCRYPTION_KEY forte é obrigatória em produção.");
    if (!config.verifyToken || config.verifyToken.length < 24 || looksLikePlaceholder(config.verifyToken) || !config.appSecret || config.appSecret.length < 24 || looksLikePlaceholder(config.appSecret)) throw new Error("VERIFY_TOKEN e META_APP_SECRET fortes são obrigatórios em produção.");
    if (googleOauthValues.every(Boolean) && (!/\.apps\.googleusercontent\.com$/i.test(config.googleOauthClientId) || config.googleOauthClientSecret.length < 16 || looksLikePlaceholder(config.googleOauthClientSecret))) throw new Error("As credenciais Google OAuth de produção são inválidas.");
    if (!config.storeNumber) throw new Error("STORE_WHATSAPP_NUMBER é obrigatório em produção para concluir pedidos.");
  }
  return config;
}
