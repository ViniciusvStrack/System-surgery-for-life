import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Catalog } from "../src/catalog.js";
import { CommerceService, hashPrincipal } from "../src/commerce.js";
import { InventoryService } from "../src/inventory.js";

const root = path.resolve(".");

function setup({ timestamp = Date.parse("2026-07-20T12:00:00.000Z") } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sfl-commerce-"));
  const file = path.join(directory, "inventory.json");
  const clock = { value: timestamp };
  const inventory = new InventoryService(file, {
    seedFile: path.join(root, "data/inventory.seed.json"),
    now: () => clock.value,
  });
  const catalog = new Catalog(path.join(root, "data/catalog.json"), inventory);
  let sequence = 0;
  const commerce = new CommerceService({
    inventory,
    catalog,
    storeNumber: "5511999999999",
    storeName: "Surgery For Life",
    handoffSecret: "segredo-de-handoff-para-testes-123456",
    reservationTtlMinutes: 30,
    now: () => clock.value,
    makeCode: () => `PED-20260720-${String(++sequence).padStart(6, "0")}`,
    makeInternalId: () => `order-${sequence}`,
  });
  return { file, clock, inventory, catalog, commerce, principal: hashPrincipal("guest", "browser-anonimo") };
}

function payload(overrides = {}) {
  return {
    items: [{
      variantId: "JAL-001-M",
      productId: "JAL-001",
      size: "M",
      color: "Branco óptico",
      model: "Essencial",
      quantity: 1,
      personalization: { name: "Dra. Ana", profession: "Cardiologia" },
      ...overrides,
    }],
  };
}

test("estoque ausente é inicializado uma vez pelo seed e catálogo recebe variantes reais", () => {
  const { file, inventory, catalog } = setup();
  const snapshot = inventory.snapshot();
  assert.equal(fs.existsSync(file), true);
  assert.equal(snapshot.products.length, 32);
  const axis = catalog.byId("JAL-001");
  assert.equal(axis.stock, 20);
  assert.equal(axis.variantStock.M, 6);
  assert.equal(axis.variantSku.M, "SFL-JAL-001-M");
  assert.equal(axis.variantIds.M, "JAL-001-M");
  assert.deepEqual(axis.colors.map((color) => color.name), ["Branco óptico", "Azul profundo"]);
});

test("pedido e reserva são idempotentes no mesmo commit", () => {
  const { commerce, inventory, principal } = setup();
  const key = crypto.randomUUID();
  const first = commerce.placeOrder({ principal, idempotencyKey: key, payload: payload() });
  const replay = commerce.placeOrder({ principal, idempotencyKey: key, payload: payload() });
  const data = inventory.aggregate();
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(replay.order.internalId, first.order.internalId);
  assert.equal(data.orders.length, 1);
  assert.equal(data.idempotency.length, 1);
  assert.equal(data.products.find((product) => product.variantId === "JAL-001-M").qtd, 5);
  assert.equal(data.movements.filter((movement) => movement.orderCode === first.order.code).length, 1);
  assert.throws(
    () => commerce.placeOrder({ principal, idempotencyKey: key, payload: payload({ quantity: 2 }) }),
    (error) => error.code === "IDEMPOTENCY_CONFLICT" && error.status === 409,
  );
});

test("preço e SKU adulterados são ignorados e URL do WhatsApp não contém PII", () => {
  const { commerce, principal } = setup();
  const result = commerce.placeOrder({
    principal,
    idempotencyKey: crypto.randomUUID(),
    payload: payload({ price: 0.01, unitPrice: 0.01, sku: "SKU-FALSO", total: 0.01 }),
  });
  assert.equal(result.publicOrder.subtotalCents, 58_900);
  assert.equal(result.publicOrder.items[0].unitPriceCents, 58_900);
  const url = new URL(result.whatsappUrl);
  assert.equal(url.protocol, "https:");
  assert.equal(url.hostname, "wa.me");
  assert.equal(url.pathname, "/5511999999999");
  const message = url.searchParams.get("text");
  assert.match(message, new RegExp(result.order.code));
  assert.doesNotMatch(message, /Ana|Cardiologia|browser-anonimo|SKU-FALSO/i);
});

test("handoff assinado vincula somente o mesmo WhatsApp e mantém a baixa após o TTL", () => {
  const { commerce, inventory, principal, clock } = setup();
  const placed = commerce.placeOrder({ principal, idempotencyKey: crypto.randomUUID(), payload: payload() });
  const message = new URL(placed.whatsappUrl).searchParams.get("text");
  const token = message.match(/SFLH_([A-Za-z0-9_-]{43})/)[1];
  const before = inventory.aggregate();
  const claimed = commerce.claimWebOrder(placed.order.code, token, "5511988887777");
  assert.equal(claimed.replayed, false);
  assert.equal(claimed.order.status, "whatsapp_connected");
  const replay = commerce.claimWebOrder(placed.order.code, token, "5511988887777");
  assert.equal(replay.replayed, true);
  assert.throws(
    () => commerce.claimWebOrder(placed.order.code, token, "5511977776666"),
    (error) => error.code === "HANDOFF_ALREADY_CLAIMED" && error.status === 409,
  );
  const replacement = token.endsWith("A") ? "B" : "A";
  const tampered = `${token.slice(0, -1)}${replacement}`;
  assert.throws(
    () => commerce.claimWebOrder(placed.order.code, tampered, "5511988887777"),
    (error) => error.code === "INVALID_HANDOFF" && error.status === 403,
  );
  const after = inventory.aggregate();
  assert.deepEqual(after.products, before.products);
  assert.equal(after.movements.length, before.movements.length);
  assert.equal(after.orders.length, 1);
  assert.equal(after.orders[0].user, "5511988887777");
  clock.value += 31 * 60_000;
  assert.equal(commerce.expireReservations(), 0);
  const connected = inventory.aggregate();
  assert.equal(connected.orders[0].status, "whatsapp_connected");
  assert.equal(connected.products.find((product) => product.variantId === "JAL-001-M").qtd, 5);
  assert.equal(commerce.claimWebOrder(placed.order.code, token, "5511988887777").replayed, true);
});

test("última unidade só pode ser reservada por um pedido", () => {
  const { commerce, inventory, principal } = setup();
  const snapshot = inventory.snapshot();
  snapshot.products.find((product) => product.variantId === "JAL-001-M").qtd = 1;
  inventory.replace(snapshot);
  commerce.placeOrder({ principal, idempotencyKey: crypto.randomUUID(), payload: payload() });
  assert.throws(
    () => commerce.placeOrder({ principal, idempotencyKey: crypto.randomUUID(), payload: payload() }),
    (error) => error.code === "OUT_OF_STOCK" && error.details.available === 0,
  );
  assert.equal(inventory.aggregate().products.find((product) => product.variantId === "JAL-001-M").qtd, 0);
});

test("pedido com vários itens não baixa parcialmente quando um deles está sem saldo", () => {
  const { commerce, inventory, principal } = setup();
  const snapshot = inventory.snapshot();
  snapshot.products.find((product) => product.variantId === "JAL-001-PP").qtd = 0;
  inventory.replace(snapshot);
  const before = inventory.aggregate();
  const multi = {
    items: [
      payload().items[0],
      { ...payload().items[0], variantId: "JAL-001-PP", size: "PP" },
    ],
  };
  assert.throws(() => commerce.placeOrder({ principal, idempotencyKey: crypto.randomUUID(), payload: multi }), (error) => error.code === "OUT_OF_STOCK");
  const after = inventory.aggregate();
  assert.deepEqual(after.products, before.products);
  assert.deepEqual(after.orders, before.orders);
  assert.deepEqual(after.movements, before.movements);
});

test("quantidades inválidas e combinações inexistentes nunca alteram o estoque", () => {
  const { commerce, inventory, principal } = setup();
  const before = inventory.aggregate();
  for (const quantity of [0, -1, 1.5, 11, "duas"]) {
    assert.throws(
      () => commerce.placeOrder({ principal, idempotencyKey: crypto.randomUUID(), payload: payload({ quantity }) }),
      (error) => error.code === "INVALID_QUANTITY" && error.status === 400,
    );
  }
  assert.throws(
    () => commerce.placeOrder({ principal, idempotencyKey: crypto.randomUUID(), payload: payload({ variantId: "INEXISTENTE" }) }),
    (error) => error.code === "VARIANT_NOT_AVAILABLE" && error.status === 409,
  );
  assert.throws(
    () => commerce.placeOrder({ principal, idempotencyKey: crypto.randomUUID(), payload: payload({ color: "Cor inventada" }) }),
    (error) => error.code === "VARIANT_NOT_AVAILABLE" && error.status === 409,
  );
  assert.deepEqual(inventory.aggregate(), before);
});

test("estoque corrompido falha fechado em vez de usar catálogo de demonstração", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sfl-corrupt-"));
  const file = path.join(directory, "inventory.json");
  fs.writeFileSync(file, "{invalido", "utf8");
  const inventory = new InventoryService(file, { seedFile: path.join(root, "data/inventory.seed.json") });
  assert.throws(() => inventory.snapshot(), (error) => error.code === "INVENTORY_CORRUPTED" && error.status === 503);
  const seed = JSON.parse(fs.readFileSync(path.join(root, "data/inventory.seed.json"), "utf8"));
  seed.products[0].qtd = -1;
  fs.writeFileSync(file, JSON.stringify(seed), "utf8");
  assert.throws(() => inventory.snapshot(), (error) => error.code === "INVENTORY_CORRUPTED" && error.status === 503);
});

test("expiração libera o saldo uma única vez e preserva histórico sanitizado", () => {
  const { commerce, inventory, principal, clock } = setup();
  const placed = commerce.placeOrder({ principal, idempotencyKey: crypto.randomUUID(), payload: payload() });
  assert.equal(inventory.aggregate().products.find((product) => product.variantId === "JAL-001-M").qtd, 5);
  clock.value += 31 * 60_000;
  assert.equal(commerce.expireReservations(), 1);
  const after = inventory.aggregate();
  assert.equal(after.products.find((product) => product.variantId === "JAL-001-M").qtd, 6);
  assert.equal(after.orders[0].status, "expired");
  const revision = after.revision;
  assert.equal(commerce.expireReservations(), 0);
  assert.equal(inventory.aggregate().revision, revision);
  const exposed = inventory.snapshot().orders[0];
  assert.equal(exposed.code, placed.order.code);
  assert.equal(exposed.items[0].personalized, true);
  assert.equal("personalization" in exposed.items[0], false);
  assert.equal("principal" in exposed, false);
});

test("handoff expirado é recusado e a reserva é liberada", () => {
  const { commerce, inventory, principal, clock } = setup();
  const placed = commerce.placeOrder({ principal, idempotencyKey: crypto.randomUUID(), payload: payload() });
  const token = new URL(placed.whatsappUrl).searchParams.get("text").match(/SFLH_([A-Za-z0-9_-]{43})/)[1];
  clock.value += 31 * 60_000;
  assert.throws(
    () => commerce.claimWebOrder(placed.order.code, token, "5511988887777"),
    (error) => error.code === "RESERVATION_EXPIRED" && error.status === 409,
  );
  const state = inventory.aggregate();
  assert.equal(state.orders[0].status, "expired");
  assert.equal(state.products.find((product) => product.variantId === "JAL-001-M").qtd, 6);
});

test("PUT do painel preserva pedidos/idempotência e detecta revision conflict", () => {
  const { commerce, inventory, principal } = setup();
  commerce.placeOrder({ principal, idempotencyKey: crypto.randomUUID(), payload: payload() });
  const stale = inventory.snapshot();
  commerce.placeOrder({ principal, idempotencyKey: crypto.randomUUID(), payload: payload({ quantity: 1, personalization: {} }) });
  assert.throws(() => inventory.replace(stale), (error) => error.code === "REVISION_CONFLICT" && error.currentRevision > stale.revision);
  const current = inventory.snapshot();
  assert.throws(
    () => inventory.replace({ ...current, products: current.products.filter((product) => product.variantId !== "JAL-001-M") }),
    (error) => error.code === "ACTIVE_RESERVATION_CONFLICT" && error.status === 409,
  );
  const saved = inventory.replace({ ...current, orders: [], idempotency: [] });
  assert.equal(saved.orders.length, 2);
  assert.equal(inventory.aggregate().idempotency.length, 2);
});

test("reserva legada rejeita quantidade negativa", () => {
  const { inventory } = setup();
  const before = inventory.aggregate();
  assert.throws(
    () => inventory.reserve({ id: "PED-X", customer: "Cliente", items: [{ sku: "SFL-JAL-001-M", qty: -2, name: "Axis" }] }),
    (error) => error.code === "INVENTORY_INVALID",
  );
  assert.deepEqual(inventory.aggregate(), before);
});
