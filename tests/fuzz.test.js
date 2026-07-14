import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { StoreBot } from "../src/bot.js";
import { Catalog } from "../src/catalog.js";

class MemoryStore { constructor(value) { this.value = value; } read() { return structuredClone(this.value); } write(value) { this.value = structuredClone(value); } }
function randomText(length) { const chars = "abcXYZ0123 áéç<>\\/!?@#$%\u0000\n\t😀"; return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join(""); }

test("chatbot não quebra com 500 entradas aleatórias", async () => {
  const bot = new StoreBot({ catalog: new Catalog(path.resolve("data/catalog.json")), sessions: new MemoryStore({}), orders: new MemoryStore([]), faqFile: path.resolve("data/faqs.json"), config: { storeName: "Teste", deliveryFee: 0, freeShippingFrom: 0 } });
  for (let index = 0; index < 500; index += 1) { const result = await bot.handle(`fuzz-${index}`, randomText(index % 250) || " "); assert.ok(Array.isArray(result.messages)); assert.ok(result.messages.every((message) => typeof message === "string")); }
});

test("observação enorme é limitada", async () => {
  const sessions = new MemoryStore({ user: { stage: "idle", cart: [{ productId: "CAM-001", name: "Camiseta", variant: "M", price: 1, qty: 1 }], favorites: [] } }); const bot = new StoreBot({ catalog: new Catalog(path.resolve("data/catalog.json")), sessions, orders: new MemoryStore([]), faqFile: path.resolve("data/faqs.json"), config: { storeName: "Teste", deliveryFee: 0, freeShippingFrom: 0 } });
  await bot.handle("user", `observação ${"x".repeat(10000)}`); assert.equal(sessions.read().user.orderNote.length, 300);
});
