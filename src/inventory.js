import { JsonStore } from "./json-store.js";

export class InventoryService {
  constructor(file) {
    this.store = new JsonStore(file, { revision: 0, products: [], movements: [] });
  }

  snapshot() {
    const data = this.store.read();
    return {
      revision: Number(data.revision || 0),
      products: Array.isArray(data.products) ? data.products : [],
      movements: Array.isArray(data.movements) ? data.movements : [],
    };
  }

  replace({ revision, products, movements }) {
    const current = this.snapshot();
    if (Number(revision) !== current.revision) {
      const error = new Error("O estoque foi atualizado em outra tela. Recarregue antes de salvar.");
      error.code = "REVISION_CONFLICT";
      error.currentRevision = current.revision;
      throw error;
    }
    this.#validate(products, movements);
    const next = { revision: current.revision + 1, products: structuredClone(products), movements: structuredClone(movements) };
    this.store.write(next);
    return next;
  }

  reserve(order) {
    const data = this.snapshot();
    if (!data.products.length) return null; // Catálogo de demonstração ainda não migrado.

    const requested = new Map();
    for (const item of order.items) {
      const sku = item.sku;
      if (!sku) throw new Error(`Produto ${item.name} não está vinculado ao estoque.`);
      requested.set(sku, (requested.get(sku) || 0) + item.qty);
    }
    for (const [sku, qty] of requested) {
      const product = data.products.find((p) => p.sku === sku);
      if (!product) throw new Error(`O produto ${sku} não existe mais no estoque.`);
      if (product.qtd < qty) throw new Error(`Estoque insuficiente para ${product.nome} ${product.cor} ${product.tam}. Disponível: ${product.qtd}.`);
    }

    for (const [sku, qty] of requested) {
      const product = data.products.find((p) => p.sku === sku);
      product.qtd -= qty;
      data.movements.push({
        id: Date.now() + data.movements.length,
        date: new Date().toISOString(),
        tipo: "saida",
        prodId: product.id,
        qtd: qty,
        motivo: "Venda WhatsApp",
        cliente: `${order.customer} - ${order.id}`,
        obs: order.note || "Pedido criado pelo chatbot",
        saldoDepois: product.qtd,
      });
    }
    data.revision += 1;
    this.store.write(data);
    return data.revision;
  }

  #validate(products, movements) {
    if (!Array.isArray(products) || !Array.isArray(movements)) throw new Error("Produtos e movimentações devem ser listas.");
    const rejectMarkup = (value) => {
      if (typeof value === "string" && /[<>]/.test(value)) throw new Error("Os campos não podem conter marcação HTML.");
      if (Array.isArray(value)) value.forEach(rejectMarkup);
      else if (value && typeof value === "object") Object.values(value).forEach(rejectMarkup);
    };
    rejectMarkup(products); rejectMarkup(movements);
    const skus = new Set();
    for (const product of products) {
      if (!product || !product.id || typeof product.nome !== "string" || !product.nome.trim()) throw new Error("Produto inválido: id e nome são obrigatórios.");
      if (typeof product.sku !== "string" || !product.sku.trim()) throw new Error("Todo produto precisa de SKU.");
      if (skus.has(product.sku)) throw new Error(`SKU duplicado: ${product.sku}`);
      skus.add(product.sku);
      for (const field of ["qtd", "min", "custo", "preco"]) if (!Number.isFinite(Number(product[field])) || Number(product[field]) < 0) throw new Error(`Campo ${field} inválido no SKU ${product.sku}.`);
    }
  }
}
