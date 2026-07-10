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
