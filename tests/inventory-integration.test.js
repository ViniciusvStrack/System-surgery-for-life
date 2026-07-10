import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Catalog } from "../src/catalog.js";
import { InventoryService } from "../src/inventory.js";
import { StoreBot } from "../src/bot.js";

class MemoryStore { constructor(value) { this.value = value; } read() { return structuredClone(this.value); } write(value) { this.value = structuredClone(value); } }
function createInventory() {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sfl-inventory-")), "inventory.json");
  const inventory = new InventoryService(file);
  inventory.replace({ revision: 0, products: [
    { id: 1, nome: "Scrub Noir", cor: "Preto", tam: "P", colecao: "Atelier 2026", sku: "SFL-NOIR-P", min: 2, qtd: 3, custo: 100, preco: 397 },
    { id: 2, nome: "Scrub Noir", cor: "Preto", tam: "M", colecao: "Atelier 2026", sku: "SFL-NOIR-M", min: 2, qtd: 5, custo: 100, preco: 397 },
    { id: 3, nome: "Scrub Lumi", cor: "Off-White", tam: "G", colecao: "Atelier 2026", sku: "SFL-LUMI-G", min: 1, qtd: 2, custo: 110, preco: 420 },
  ], movements: [] });
  return inventory;
}

test("controle de versão impede sobrescrever estoque mais novo", () => {
  const inventory = createInventory();
  const snapshot = inventory.snapshot();
  inventory.replace(snapshot);
  assert.throws(() => inventory.replace(snapshot), (error) => error.code === "REVISION_CONFLICT");
});

test("valida SKU duplicado e valores inválidos", () => {
  const inventory = new InventoryService(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sfl-")), "i.json"));
  const product = { id: 1, nome: "Scrub", cor: "Preto", tam: "M", sku: "DUP", min: 1, qtd: 1, custo: 1, preco: 2 };
  assert.throws(() => inventory.replace({ revision: 0, products: [product, { ...product, id: 2 }], movements: [] }), /SKU duplicado/);
  assert.throws(() => inventory.replace({ revision: 0, products: [{ ...product, qtd: -1 }], movements: [] }), /qtd inválido/);
  assert.throws(() => inventory.replace({ revision: 0, products: [{ ...product, nome: "<script>" }], movements: [] }), /marcação HTML/);
});

test("catálogo agrupa tamanhos e expõe apenas o saldo real", () => {
  const inventory = createInventory();
  const catalog = new Catalog(path.resolve("data/catalog.json"), inventory);
  const product = catalog.search("Scrub Noir")[0];
  assert.deepEqual(product.variants, ["P", "M"]);
  assert.equal(product.stock, 8);
  assert.equal(product.variantStock.P, 3);
  assert.equal(product.variantSku.M, "SFL-NOIR-M");
  assert.equal(catalog.search("quais scrubs voces tem")[0].name, "Scrub Noir — Preto");
});

test("pedido do chatbot baixa estoque e cria saída auditável", async () => {
  const inventory = createInventory();
  const catalog = new Catalog(path.resolve("data/catalog.json"), inventory);
  const orders = new MemoryStore([]);
  const bot = new StoreBot({ catalog, sessions: new MemoryStore({}), orders, faqFile: path.resolve("data/faqs.json"), config: { storeName: "Surgery For Life", deliveryFee: 0, freeShippingFrom: 0 } });
  const product = catalog.search("Scrub Noir")[0]; const user = "551199";
  for (const input of [`adicionar ${product.id}`, "P", "2", "finalizar", "Ana Silva", "retirada", "confirmar"]) await bot.handle(user, input);
  const snapshot = inventory.snapshot();
  assert.equal(snapshot.products.find((p) => p.sku === "SFL-NOIR-P").qtd, 1);
  assert.equal(snapshot.movements.at(-1).motivo, "Venda WhatsApp");
  assert.match(snapshot.movements.at(-1).cliente, /Ana Silva - PED-/);
  assert.equal(orders.read().length, 1);
});

test("seleção numérica pula tamanho quando produto tem uma única opção", async () => {
  const inventory = createInventory();
  const catalog = new Catalog(path.resolve("data/catalog.json"), inventory);
  const bot = new StoreBot({ catalog, sessions: new MemoryStore({}), orders: new MemoryStore([]), faqFile: path.resolve("data/faqs.json"), config: { storeName: "Surgery For Life", deliveryFee: 0, freeShippingFrom: 0 } });
  await bot.handle("numeric", "Scrub Lumi");
  const selected = await bot.handle("numeric", "1");
  assert.match(selected.messages[0], /Quantas unidades deseja/);
});

test("reserva é atômica e não baixa parcialmente quando falta um item", () => {
  const inventory = createInventory(); const before = inventory.snapshot();
  assert.throws(() => inventory.reserve({ id: "PED-X", customer: "Ana", note: "", items: [
    { sku: "SFL-NOIR-P", name: "P", qty: 1 }, { sku: "SFL-NOIR-M", name: "M", qty: 99 },
  ] }), /Estoque insuficiente/);
  assert.deepEqual(inventory.snapshot(), before);
});
