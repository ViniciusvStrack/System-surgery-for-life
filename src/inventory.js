import crypto from "node:crypto";
import fs from "node:fs";
import { JsonStore } from "./json-store.js";

const EMPTY_AGGREGATE = Object.freeze({ revision: 0, products: [], movements: [], orders: [], idempotency: [] });

function inventoryError(message, code = "INVENTORY_INVALID", status = 400, extra = {}) {
  return Object.assign(new Error(message), { code, status, ...extra });
}

function normalizeAggregate(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw inventoryError("O armazenamento do estoque possui formato inválido.", "INVENTORY_CORRUPTED", 503);
  }
  const revision = Number(value.revision || 0);
  if (!Number.isInteger(revision) || revision < 0) {
    throw inventoryError("A revisão do estoque está corrompida.", "INVENTORY_CORRUPTED", 503);
  }
  for (const field of ["products", "movements", "orders", "idempotency"]) {
    if (value[field] !== undefined && !Array.isArray(value[field])) {
      throw inventoryError("O armazenamento do estoque possui formato inválido.", "INVENTORY_CORRUPTED", 503);
    }
  }
  return {
    revision,
    products: structuredClone(value.products || []),
    movements: structuredClone(value.movements || []),
    orders: structuredClone(value.orders || []),
    idempotency: structuredClone(value.idempotency || []),
  };
}

function cents(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0;
}

function publicOrder(order) {
  return {
    code: String(order.code || order.id || "").slice(0, 80),
    status: String(order.status || "unknown").slice(0, 50),
    subtotalCents: Number.isInteger(order.subtotalCents) ? order.subtotalCents : cents(order.subtotal),
    totalCents: Number.isInteger(order.totalCents) ? order.totalCents : cents(order.total),
    items: Array.isArray(order.items) ? order.items.slice(0, 50).map((item) => ({
      productId: String(item.productId || "").slice(0, 64),
      variantId: String(item.variantId || "").slice(0, 100),
      name: String(item.name || "Produto").slice(0, 100),
      size: String(item.size || item.variant || "").slice(0, 20),
      color: String(item.color || "").slice(0, 60),
      model: String(item.model || "").slice(0, 60),
      quantity: Number(item.quantity || item.qty || 0),
      unitPriceCents: Number.isInteger(item.unitPriceCents) ? item.unitPriceCents : cents(item.price),
      lineTotalCents: Number.isInteger(item.lineTotalCents)
        ? item.lineTotalCents
        : cents(Number(item.price || 0) * Number(item.qty || item.quantity || 0)),
      personalized: Boolean(item.personalization?.name || item.personalization?.profession),
    })) : [],
    reservationExpiresAt: order.reservationExpiresAt || null,
    createdAt: order.createdAt || null,
  };
}

export class InventoryService {
  constructor(file, { seedFile = "", now = () => Date.now() } = {}) {
    this.store = new JsonStore(file, EMPTY_AGGREGATE);
    this.seedFile = seedFile;
    this.now = now;
  }

  #readAggregate() {
    const existed = fs.existsSync(this.store.file);
    let data;
    try {
      data = normalizeAggregate(this.store.readStrict({ code: "INVENTORY_CORRUPTED" }));
    } catch (error) {
      if (!error.code) error.code = "INVENTORY_CORRUPTED";
      if (!error.status) error.status = 503;
      throw error;
    }

    if (data.products.length) {
      try { this.#validate(data.products, data.movements); }
      catch (cause) { throw inventoryError("O conteúdo do estoque está inconsistente.", "INVENTORY_CORRUPTED", 503, { cause }); }
    }

    if (!data.products.length && this.seedFile) {
      let seed;
      try {
        seed = JSON.parse(fs.readFileSync(this.seedFile, "utf8"));
      } catch (cause) {
        throw inventoryError("O estoque inicial não pôde ser carregado.", "INVENTORY_SEED_INVALID", 503, { cause });
      }
      const products = Array.isArray(seed) ? seed : seed?.products;
      if (!Array.isArray(products) || !products.length) {
        throw inventoryError("O estoque inicial está vazio ou inválido.", "INVENTORY_SEED_INVALID", 503);
      }
      this.#validate(products, data.movements);
      data.products = structuredClone(products);
      if (existed) data.revision += 1;
      this.store.write(data);
    }
    return data;
  }

  #releaseExpiredInPlace(data, timestamp) {
    let released = 0;
    for (const order of data.orders) {
      if (order.status !== "reserved_whatsapp" || order.stockReleasedAt) continue;
      const expiresAt = Date.parse(order.reservationExpiresAt || "");
      if (!Number.isFinite(expiresAt) || expiresAt > timestamp) continue;

      const quantities = new Map();
      for (const item of order.items || []) {
        const sku = String(item.sku || "");
        const qty = Number(item.quantity || item.qty);
        if (!sku || !Number.isInteger(qty) || qty < 1) {
          throw inventoryError("Um pedido reservado possui itens inválidos.", "INVENTORY_INTEGRITY_ERROR", 503);
        }
        quantities.set(sku, (quantities.get(sku) || 0) + qty);
      }

      for (const [sku, qty] of quantities) {
        const product = data.products.find((entry) => entry.sku === sku);
        if (!product) {
          throw inventoryError("Uma reserva aponta para um SKU inexistente.", "INVENTORY_INTEGRITY_ERROR", 503);
        }
        product.qtd = Number(product.qtd) + qty;
        data.movements.push({
          id: crypto.randomUUID(),
          date: new Date(timestamp).toISOString(),
          tipo: "entrada",
          prodId: product.id,
          qtd: qty,
          forn: "Sistema",
          motivo: "Liberação de reserva expirada",
          obs: `Reserva ${order.code || order.id} expirada`,
          orderCode: order.code || order.id,
          source: "storefront",
          saldoDepois: product.qtd,
        });
      }
      order.status = "expired";
      order.expiredAt = new Date(timestamp).toISOString();
      order.stockReleasedAt = order.expiredAt;
      released += 1;
    }
    return released;
  }

  transaction(mutator, { releaseExpired = true, timestamp = this.now() } = {}) {
    const current = this.#readAggregate();
    const draft = structuredClone(current);
    const released = releaseExpired ? this.#releaseExpiredInPlace(draft, timestamp) : 0;
    const outcome = mutator ? mutator(draft) : { changed: false, value: undefined };
    const changed = released > 0 || outcome?.changed === true;
    if (changed) {
      this.#validate(draft.products, draft.movements);
      draft.revision = current.revision + 1;
      this.store.write(draft);
    }
    return {
      value: outcome?.value,
      changed,
      released,
      revision: changed ? draft.revision : current.revision,
    };
  }

  snapshot() {
    this.releaseExpiredReservations();
    const data = this.#readAggregate();
    return {
      revision: data.revision,
      products: data.products,
      movements: data.movements,
      orders: data.orders.map(publicOrder),
    };
  }

  aggregate() {
    this.releaseExpiredReservations();
    return this.#readAggregate();
  }

  replace({ revision, products, movements }) {
    this.releaseExpiredReservations();
    const result = this.transaction((data) => {
      if (Number(revision) !== data.revision) {
        throw inventoryError(
          "O estoque foi atualizado em outra tela. Recarregue antes de salvar.",
          "REVISION_CONFLICT",
          409,
          { currentRevision: data.revision },
        );
      }
      this.#validate(products, movements);
      const protectedSkus = new Set(
        data.orders
          .filter((order) => ["reserved_whatsapp", "whatsapp_connected"].includes(order.status) && !order.stockReleasedAt)
          .flatMap((order) => (order.items || []).map((item) => item.sku)),
      );
      for (const sku of protectedSkus) {
        if (!products.some((product) => product.sku === sku)) {
          throw inventoryError("Não é possível excluir uma variante vinculada a uma reserva ativa.", "ACTIVE_RESERVATION_CONFLICT", 409);
        }
      }
      data.products = structuredClone(products);
      data.movements = structuredClone(movements);
      // orders e idempotency pertencem ao servidor e nunca são aceitos do painel.
      return { changed: true };
    }, { releaseExpired: false });
    const data = this.#readAggregate();
    return {
      revision: result.revision,
      products: data.products,
      movements: data.movements,
      orders: data.orders.map(publicOrder),
    };
  }

  reserve(order) {
    if (!order || !Array.isArray(order.items) || !order.items.length || order.items.length > 50) {
      throw inventoryError("O pedido precisa conter entre 1 e 50 itens.");
    }
    return this.transaction((data) => {
      if (!data.products.length) {
        throw inventoryError("O estoque ainda não foi inicializado.", "INVENTORY_UNAVAILABLE", 503);
      }
      const requested = new Map();
      for (const item of order.items) {
        const sku = typeof item?.sku === "string" ? item.sku.trim() : "";
        const qty = Number(item?.qty ?? item?.quantity);
        if (!sku || sku.length > 100) throw inventoryError(`Produto ${item?.name || "sem identificação"} não está vinculado ao estoque.`);
        if (!Number.isInteger(qty) || qty < 1 || qty > 1_000) throw inventoryError("A quantidade de cada item deve ser um inteiro positivo.");
        requested.set(sku, (requested.get(sku) || 0) + qty);
      }
      for (const [sku, qty] of requested) {
        const product = data.products.find((entry) => entry.sku === sku);
        if (!product) throw inventoryError(`O produto ${sku} não existe mais no estoque.`, "VARIANT_NOT_AVAILABLE", 409);
        if (Number(product.qtd) < qty) {
          throw inventoryError(
            `Estoque insuficiente para ${product.nome} ${product.cor} ${product.tam}. Disponível: ${product.qtd}.`,
            "OUT_OF_STOCK",
            409,
          );
        }
      }
      for (const [sku, qty] of requested) {
        const product = data.products.find((entry) => entry.sku === sku);
        product.qtd = Number(product.qtd) - qty;
        data.movements.push({
          id: crypto.randomUUID(),
          date: new Date(this.now()).toISOString(),
          tipo: "saida",
          prodId: product.id,
          qtd: qty,
          motivo: "Venda WhatsApp",
          cliente: `${order.customer || "Cliente"} - ${order.id || "Pedido"}`,
          obs: order.note || "Pedido criado pelo chatbot",
          orderCode: order.id || "",
          source: "whatsapp",
          saldoDepois: product.qtd,
        });
      }
      return { changed: true };
    }).revision;
  }

  releaseExpiredReservations(timestamp = this.now()) {
    return this.transaction(null, { releaseExpired: true, timestamp }).released;
  }

  findOrderByCode(code) {
    const wanted = String(code || "").toUpperCase();
    return this.aggregate().orders.find((order) => String(order.code || order.id || "").toUpperCase() === wanted) || null;
  }

  #validate(products, movements) {
    if (!Array.isArray(products) || !Array.isArray(movements)) throw inventoryError("Produtos e movimentações devem ser listas.");
    const rejectMarkup = (value) => {
      if (typeof value === "string" && /[<>]/.test(value)) throw inventoryError("Os campos não podem conter marcação HTML.");
      if (Array.isArray(value)) value.forEach(rejectMarkup);
      else if (value && typeof value === "object") Object.values(value).forEach(rejectMarkup);
    };
    rejectMarkup(products);
    rejectMarkup(movements);
    const skus = new Set();
    const variantIds = new Set();
    for (const product of products) {
      if (!product || !product.id || typeof product.nome !== "string" || !product.nome.trim()) throw inventoryError("Produto inválido: id e nome são obrigatórios.");
      if (typeof product.sku !== "string" || !product.sku.trim()) throw inventoryError("Todo produto precisa de SKU.");
      if (skus.has(product.sku)) throw inventoryError(`SKU duplicado: ${product.sku}`);
      skus.add(product.sku);
      if (product.variantId !== undefined) {
        if (typeof product.variantId !== "string" || !product.variantId.trim() || variantIds.has(product.variantId)) throw inventoryError(`variantId inválido ou duplicado: ${product.variantId}`);
        variantIds.add(product.variantId);
      }
      for (const field of ["qtd", "min", "custo", "preco"]) {
        if (!Number.isFinite(Number(product[field])) || Number(product[field]) < 0) throw inventoryError(`Campo ${field} inválido no SKU ${product.sku}.`);
      }
      if (!Number.isInteger(Number(product.qtd)) || !Number.isInteger(Number(product.min))) throw inventoryError(`Saldo e mínimo devem ser inteiros no SKU ${product.sku}.`);
    }
  }
}
