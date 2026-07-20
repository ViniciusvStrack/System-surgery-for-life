import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { StoreBot } from "../src/bot.js";
import { Catalog } from "../src/catalog.js";
import { CommerceService, hashPrincipal } from "../src/commerce.js";
import { InventoryService } from "../src/inventory.js";

class MemoryStore {
  constructor(value) { this.value = value; }
  read() { return structuredClone(this.value); }
  write(value) { this.value = structuredClone(value); }
}

test("bot reconhece handoff do site e não cria uma segunda baixa", async () => {
  const root = path.resolve(".");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sfl-bot-commerce-"));
  const inventory = new InventoryService(path.join(directory, "inventory.json"), { seedFile: path.join(root, "data/inventory.seed.json") });
  const catalog = new Catalog(path.join(root, "data/catalog.json"), inventory);
  const commerce = new CommerceService({
    inventory,
    catalog,
    storeNumber: "5511999999999",
    storeName: "Surgery For Life",
    handoffSecret: "segredo-de-handoff-para-testes-123456",
  });
  const placed = commerce.placeOrder({
    principal: hashPrincipal("guest", "visitante"),
    idempotencyKey: crypto.randomUUID(),
    payload: { items: [{ variantId: "JAL-001-M", color: "Branco óptico", model: "Essencial", quantity: 1 }] },
  });
  const handoffMessage = new URL(placed.whatsappUrl).searchParams.get("text");
  const movementsBefore = inventory.aggregate().movements.length;
  const bot = new StoreBot({
    catalog,
    commerce,
    sessions: new MemoryStore({}),
    orders: new MemoryStore([]),
    faqFile: path.join(root, "data/faqs.json"),
    config: { storeName: "Surgery For Life", deliveryFee: 0, freeShippingFrom: 0 },
  });

  const first = await bot.handle("5511988887777", handoffMessage, "Ana");
  assert.equal(first.handoff, true);
  assert.match(first.messages[0], new RegExp(placed.order.code));
  const repeated = await bot.handle("5511988887777", handoffMessage, "Ana");
  assert.equal(repeated.handoff, false);
  const attacker = await bot.handle("5511977776666", handoffMessage, "Outra pessoa");
  assert.equal(attacker.handoff, undefined);
  assert.match(attacker.messages[0], /não consegui validar/i);
  assert.equal(inventory.aggregate().movements.length, movementsBefore);
  assert.equal(inventory.aggregate().products.find((product) => product.variantId === "JAL-001-M").qtd, 5);
});
