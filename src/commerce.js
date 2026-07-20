import crypto from "node:crypto";
import { makeOrderId, money, normalize } from "./utils.js";

const IDEMPOTENCY_KEY = /^[A-Za-z0-9._~-]{16,128}$/;
const PRINCIPAL = /^(?:customer|guest|whatsapp):[a-f0-9]{64}$/;

function commerceError(message, code, status, details) {
  return Object.assign(new Error(message), { code, status, ...(details ? { details } : {}) });
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function cleanText(value, maxLength, { required = false } = {}) {
  if (value === undefined || value === null) value = "";
  if (typeof value !== "string") throw commerceError("Um dos campos de texto é inválido.", "INVALID_ORDER", 400);
  const text = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (/[<>]/.test(text) || text.length > maxLength || (required && !text)) {
    throw commerceError("Um dos campos de texto é inválido.", "INVALID_ORDER", 400);
  }
  return text;
}

function positiveInteger(value, maximum = 10) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > maximum) {
    throw commerceError(`A quantidade deve ser um inteiro entre 1 e ${maximum}.`, "INVALID_QUANTITY", 400);
  }
  return number;
}

function normalizeItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw commerceError("Um item do pedido é inválido.", "INVALID_ORDER", 400);
  }
  const colorValue = typeof item.color === "object" ? item.color?.name : item.color;
  return {
    variantId: cleanText(item.variantId, 100),
    productId: cleanText(item.productId, 64),
    size: cleanText(item.size || item.variant, 20),
    color: cleanText(colorValue, 60),
    model: cleanText(item.model || item.fit, 60),
    quantity: positiveInteger(item.quantity ?? item.qty, 10),
    personalization: {
      name: cleanText(item.personalization?.name, 28),
      profession: cleanText(item.personalization?.profession, 34),
    },
  };
}

function normalizePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || !Array.isArray(payload.items)) {
    throw commerceError("O pedido possui formato inválido.", "INVALID_ORDER", 400);
  }
  if (!payload.items.length || payload.items.length > 20) {
    throw commerceError("O pedido deve conter entre 1 e 20 itens.", "INVALID_ORDER", 400);
  }
  const items = payload.items.map(normalizeItem);
  if (items.reduce((sum, item) => sum + item.quantity, 0) > 50) {
    throw commerceError("O pedido ultrapassa o limite de 50 unidades.", "INVALID_ORDER", 400);
  }
  return { items, note: cleanText(payload.note, 300) };
}

function canonicalChoice(options, requested, label) {
  if (!Array.isArray(options) || !options.length) return requested;
  if (!requested) return typeof options[0] === "string" ? options[0] : options[0]?.name || "";
  const found = options.find((option) => normalize(typeof option === "string" ? option : option?.name) === normalize(requested));
  if (!found) throw commerceError(`${label} não está disponível para este produto.`, "VARIANT_NOT_AVAILABLE", 409);
  return typeof found === "string" ? found : found.name;
}

function publicOrder(order) {
  return {
    id: order.internalId,
    code: order.code,
    status: order.status,
    currency: "BRL",
    items: order.items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId,
      name: item.name,
      size: item.size,
      color: item.color,
      model: item.model,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      lineTotalCents: item.lineTotalCents,
      personalized: Boolean(item.personalization?.name || item.personalization?.profession),
    })),
    subtotalCents: order.subtotalCents,
    totalCents: order.totalCents,
    reservationExpiresAt: order.reservationExpiresAt,
    createdAt: order.createdAt,
  };
}

export function hashPrincipal(kind, value) {
  if (!["customer", "guest", "whatsapp"].includes(kind) || !String(value || "")) {
    throw new Error("Principal inválida.");
  }
  return `${kind}:${sha256(value)}`;
}

export function buildWhatsAppUrl(number, message) {
  const digits = String(number || "").trim();
  if (!/^\d{8,15}$/.test(digits)) {
    throw commerceError("O WhatsApp da loja ainda não foi configurado.", "STORE_NOT_READY", 503);
  }
  const url = new URL(`https://wa.me/${digits}`);
  url.searchParams.set("text", cleanText(message, 500, { required: true }));
  return url.toString();
}

export class CommerceService {
  constructor({
    inventory,
    catalog,
    storeNumber = "",
    storeName = "Surgery For Life",
    handoffSecret,
    reservationTtlMinutes = 30,
    now = () => Date.now(),
    makeCode = makeOrderId,
    makeInternalId = () => crypto.randomUUID(),
  }) {
    if (!inventory || !catalog) throw new Error("CommerceService requer inventário e catálogo.");
    this.inventory = inventory;
    this.catalog = catalog;
    this.storeNumber = String(storeNumber || "").trim();
    this.storeName = cleanText(storeName, 80, { required: true });
    if (typeof handoffSecret !== "string" || handoffSecret.length < 16) throw new Error("handoffSecret forte é obrigatório.");
    this.handoffSecret = handoffSecret;
    this.reservationTtlMinutes = Number(reservationTtlMinutes);
    if (!Number.isInteger(this.reservationTtlMinutes) || this.reservationTtlMinutes < 5 || this.reservationTtlMinutes > 1_440) {
      throw new Error("reservationTtlMinutes deve ficar entre 5 e 1440.");
    }
    this.now = now;
    this.makeCode = makeCode;
    this.makeInternalId = makeInternalId;
  }

  publicConfig() {
    const whatsappAvailable = /^\d{8,15}$/.test(this.storeNumber);
    return {
      whatsappAvailable,
      whatsappUrl: whatsappAvailable
        ? buildWhatsAppUrl(this.storeNumber, `Olá! Gostaria de falar com a ${this.storeName}.`)
        : null,
      reservationTtlMinutes: this.reservationTtlMinutes,
      guestCheckout: true,
    };
  }

  #whatsappUrl(order) {
    const handoffToken = this.#handoffToken(order);
    return buildWhatsAppUrl(
      this.storeNumber,
      `Olá! Quero continuar o pedido ${order.code} da ${this.storeName}. Total reservado: ${money(order.totalCents / 100)}. Conexão: SFLH_${handoffToken}`,
    );
  }

  #handoffToken(order) {
    return crypto
      .createHmac("sha256", this.handoffSecret)
      .update(`${order.internalId}\n${order.code}\n${order.reservationExpiresAt}`)
      .digest("base64url");
  }

  #resolveItems(data, intent) {
    const canonical = [];
    for (const requested of intent.items) {
      let row;
      if (requested.variantId) row = data.products.find((product) => product.variantId === requested.variantId);
      else if (requested.productId && requested.size) {
        const matches = data.products.filter(
          (product) => normalize(product.productId) === normalize(requested.productId) && normalize(product.tam) === normalize(requested.size),
        );
        if (matches.length === 1) row = matches[0];
      }
      if (!row) {
        throw commerceError("Uma combinação selecionada não está disponível.", "VARIANT_NOT_AVAILABLE", 409, {
          variantId: requested.variantId || undefined,
          productId: requested.productId || undefined,
          size: requested.size || undefined,
        });
      }

      const productId = row.productId || requested.productId;
      const metadata = this.catalog.metadataById(productId);
      if (!metadata) throw commerceError("O produto não faz parte do catálogo atual.", "VARIANT_NOT_AVAILABLE", 409);
      if (requested.productId && normalize(requested.productId) !== normalize(productId)) {
        throw commerceError("A variante não pertence ao produto informado.", "VARIANT_NOT_AVAILABLE", 409);
      }
      if (requested.size && normalize(requested.size) !== normalize(row.tam)) {
        throw commerceError("O tamanho não corresponde à variante informada.", "VARIANT_NOT_AVAILABLE", 409);
      }
      const color = canonicalChoice(metadata.colors, requested.color, "A cor");
      const model = canonicalChoice(metadata.fits, requested.model, "A modelagem");
      const unitPriceCents = Math.round(Number(row.preco) * 100);
      if (!Number.isSafeInteger(unitPriceCents) || unitPriceCents < 0) {
        throw commerceError("O preço desta variante está indisponível.", "INVENTORY_INTEGRITY_ERROR", 503);
      }
      canonical.push({
        productId,
        variantId: row.variantId || row.sku,
        sku: row.sku,
        name: metadata.name,
        size: String(row.tam),
        variant: String(row.tam),
        color,
        model,
        quantity: requested.quantity,
        qty: requested.quantity,
        unitPriceCents,
        price: unitPriceCents / 100,
        lineTotalCents: unitPriceCents * requested.quantity,
        personalization: requested.personalization,
      });
    }
    return canonical;
  }

  placeOrder({
    principal,
    idempotencyKey,
    payload,
    source = "storefront",
    requireWhatsAppLink = source === "storefront",
    trusted = {},
  }) {
    if (!PRINCIPAL.test(String(principal || ""))) throw commerceError("Identidade da solicitação inválida.", "INVALID_ORDER", 400);
    if (!IDEMPOTENCY_KEY.test(String(idempotencyKey || ""))) {
      throw commerceError("Idempotency-Key ausente ou inválida.", "INVALID_IDEMPOTENCY_KEY", 400);
    }
    if (requireWhatsAppLink && !/^\d{8,15}$/.test(this.storeNumber)) {
      throw commerceError("O WhatsApp da loja ainda não foi configurado.", "STORE_NOT_READY", 503);
    }
    if (!['storefront', 'whatsapp'].includes(source)) throw commerceError("Origem do pedido inválida.", "INVALID_ORDER", 400);

    const intent = normalizePayload(payload);
    const requestHash = sha256(JSON.stringify(intent));
    const timestamp = this.now();
    this.inventory.releaseExpiredReservations(timestamp);
    const result = this.inventory.transaction((data) => {
      const previous = data.idempotency.find((entry) => entry.key === idempotencyKey);
      if (previous) {
        if (previous.principal !== principal || previous.requestHash !== requestHash) {
          throw commerceError("Esta chave de idempotência já foi usada em outro pedido.", "IDEMPOTENCY_CONFLICT", 409);
        }
        const order = data.orders.find((entry) => entry.internalId === previous.orderId);
        if (!order) throw commerceError("O registro idempotente está inconsistente.", "INVENTORY_INTEGRITY_ERROR", 503);
        return { changed: false, value: { order: structuredClone(order), replayed: true } };
      }

      if (!data.products.length) throw commerceError("O estoque ainda não foi inicializado.", "INVENTORY_UNAVAILABLE", 503);
      const items = this.#resolveItems(data, intent);
      const requestedBySku = new Map();
      for (const item of items) requestedBySku.set(item.sku, (requestedBySku.get(item.sku) || 0) + item.quantity);
      for (const [sku, quantity] of requestedBySku) {
        const product = data.products.find((entry) => entry.sku === sku);
        if (!product) throw commerceError("Uma variante não existe mais no estoque.", "VARIANT_NOT_AVAILABLE", 409);
        if (Number(product.qtd) < quantity) {
          throw commerceError("O estoque mudou. Revise a quantidade selecionada.", "OUT_OF_STOCK", 409, {
            variantId: product.variantId || product.sku,
            available: Math.max(0, Number(product.qtd)),
          });
        }
      }

      let code = "";
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const candidate = String(this.makeCode()).toUpperCase();
        if (!data.orders.some((order) => String(order.code || order.id).toUpperCase() === candidate)) {
          code = candidate;
          break;
        }
      }
      if (!code) throw commerceError("Não foi possível gerar o código do pedido.", "ORDER_ID_UNAVAILABLE", 503);

      const subtotalCents = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
      const deliveryFeeCents = Number.isInteger(trusted.deliveryFeeCents) && trusted.deliveryFeeCents >= 0 ? trusted.deliveryFeeCents : 0;
      const createdAt = new Date(timestamp).toISOString();
      const order = {
        internalId: this.makeInternalId(),
        id: code,
        code,
        principal,
        source,
        status: "reserved_whatsapp",
        items,
        note: intent.note || cleanText(trusted.note, 300),
        subtotalCents,
        subtotal: subtotalCents / 100,
        deliveryFeeCents,
        deliveryFee: deliveryFeeCents / 100,
        totalCents: subtotalCents + deliveryFeeCents,
        total: (subtotalCents + deliveryFeeCents) / 100,
        customer: cleanText(trusted.customer, 100),
        user: cleanText(trusted.user, 40),
        delivery: cleanText(trusted.delivery, 30),
        address: cleanText(trusted.address, 300),
        createdAt,
        reservationExpiresAt: new Date(timestamp + this.reservationTtlMinutes * 60_000).toISOString(),
      };

      for (const [sku, quantity] of requestedBySku) {
        const product = data.products.find((entry) => entry.sku === sku);
        product.qtd = Number(product.qtd) - quantity;
        data.movements.push({
          id: crypto.randomUUID(),
          date: createdAt,
          tipo: "saida",
          prodId: product.id,
          qtd: quantity,
          motivo: source === "whatsapp" ? "Venda WhatsApp" : "Reserva loja online",
          cliente: source === "whatsapp" && order.customer ? `${order.customer} - ${code}` : `Pedido ${code}`,
          obs: source === "whatsapp" ? order.note || "Pedido criado pelo chatbot" : "Pedido reservado no site e encaminhado ao WhatsApp",
          orderCode: code,
          source,
          saldoDepois: product.qtd,
        });
      }
      data.orders.push(order);
      data.idempotency.push({ key: idempotencyKey, principal, requestHash, orderId: order.internalId, createdAt });
      return { changed: true, value: { order: structuredClone(order), replayed: false } };
    }, { releaseExpired: false, timestamp });

    const placed = result.value;
    return {
      order: placed.order,
      publicOrder: publicOrder(placed.order),
      replayed: placed.replayed,
      whatsappUrl: requireWhatsAppLink ? this.#whatsappUrl(placed.order) : null,
      revision: result.revision,
    };
  }

  findOrderByCode(code) {
    return this.inventory.findOrderByCode(code);
  }

  claimWebOrder(code, token, whatsappUser) {
    const normalizedCode = String(code || "").trim().toUpperCase();
    const supplied = String(token || "").trim();
    const user = String(whatsappUser || "").trim();
    if (!/^PED-\d{8}-[A-Z0-9]{6,20}$/.test(normalizedCode) || !/^[A-Za-z0-9_-]{43}$/.test(supplied) || !/^\d{8,20}$/.test(user)) {
      throw commerceError("O código de conexão é inválido.", "INVALID_HANDOFF", 403);
    }
    const timestamp = this.now();
    this.inventory.releaseExpiredReservations(timestamp);
    return this.inventory.transaction((data) => {
      const order = data.orders.find((entry) => String(entry.code || entry.id || "").toUpperCase() === normalizedCode);
      if (!order || order.source !== "storefront") throw commerceError("O código de conexão é inválido.", "INVALID_HANDOFF", 403);
      const expected = this.#handoffToken(order);
      const left = Buffer.from(supplied, "base64url");
      const right = Buffer.from(expected, "base64url");
      if (left.length !== right.length || supplied !== left.toString("base64url") || !crypto.timingSafeEqual(left, right)) {
        throw commerceError("O código de conexão é inválido.", "INVALID_HANDOFF", 403);
      }
      if (order.status === "whatsapp_connected") {
        if (order.user !== user) throw commerceError("Esta reserva já foi vinculada a outro número.", "HANDOFF_ALREADY_CLAIMED", 409);
        return { changed: false, value: { order: structuredClone(order), replayed: true } };
      }
      if (order.status !== "reserved_whatsapp" || Date.parse(order.reservationExpiresAt) <= timestamp) {
        throw commerceError("Esta reserva expirou. Atualize a disponibilidade no site.", "RESERVATION_EXPIRED", 409);
      }
      if (order.user && order.user !== user) {
        throw commerceError("Esta reserva já foi vinculada a outro número.", "HANDOFF_ALREADY_CLAIMED", 409);
      }
      order.user = user;
      order.status = "whatsapp_connected";
      order.whatsappConnectedAt = new Date(timestamp).toISOString();
      return { changed: true, value: { order: structuredClone(order), replayed: false } };
    }, { releaseExpired: false, timestamp }).value;
  }

  expireReservations(timestamp = this.now()) {
    return this.inventory.releaseExpiredReservations(timestamp);
  }
}
