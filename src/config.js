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
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
  }
}

export function getConfig() {
  return {
    root,
    port: Number(process.env.PORT || 3000),
    simulatorEnabled: process.env.ENABLE_SIMULATOR !== "false",
    adminToken: process.env.ADMIN_TOKEN || "",
    authEncryptionKey: process.env.AUTH_ENCRYPTION_KEY || "development-only-change-me",
    bootstrapAdminEmail: process.env.BOOTSTRAP_ADMIN_EMAIL || "",
    bootstrapAdminPassword: process.env.BOOTSTRAP_ADMIN_PASSWORD || "",
    appEnv: process.env.APP_ENV || "development",
    verifyToken: process.env.VERIFY_TOKEN || "",
    whatsappToken: process.env.WHATSAPP_TOKEN || "",
    phoneNumberId: process.env.PHONE_NUMBER_ID || "",
    appSecret: process.env.META_APP_SECRET || "",
    graphVersion: process.env.GRAPH_API_VERSION || "v23.0",
    storeNumber: process.env.STORE_WHATSAPP_NUMBER || "",
    storeName: process.env.STORE_NAME || "Minha Loja",
    businessHours: process.env.BUSINESS_HOURS || "seg-sex 09:00-18:00",
    deliveryFee: Number(process.env.DELIVERY_FEE || 0),
    freeShippingFrom: Number(process.env.FREE_SHIPPING_FROM || 0),
  };
}

export function validateConfig(config) {
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error("PORT deve estar entre 1 e 65535.");
  if (config.deliveryFee < 0 || config.freeShippingFrom < 0) throw new Error("Valores de frete não podem ser negativos.");
  if (config.appEnv === "production") {
    if (config.simulatorEnabled) throw new Error("ENABLE_SIMULATOR deve ser false em produção.");
    if (!config.authEncryptionKey || config.authEncryptionKey.length < 32 || config.authEncryptionKey === "development-only-change-me") throw new Error("AUTH_ENCRYPTION_KEY forte é obrigatória em produção.");
    if (!config.verifyToken || !config.appSecret) throw new Error("VERIFY_TOKEN e META_APP_SECRET são obrigatórios em produção.");
  }
  return config;
}
