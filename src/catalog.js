import fs from "node:fs";
import { normalize, tokens } from "./utils.js";

function slug(value) {
  return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").toUpperCase();
}

function unique(values) {
  return [...new Set(values)];
}

export class Catalog {
  constructor(file, inventory = null) {
    this.fallbackProducts = JSON.parse(fs.readFileSync(file, "utf8"));
    this.fallbackById = new Map(this.fallbackProducts.map((product) => [normalize(product.id), product]));
    this.inventory = inventory;
  }

  metadataById(id) {
    const product = this.fallbackById.get(normalize(id));
    return product ? structuredClone(product) : null;
  }

  get products() {
    const stockProducts = this.inventory?.snapshot().products ?? [];
    if (!stockProducts.length) return structuredClone(this.fallbackProducts);

    const groups = new Map();
    for (const row of stockProducts) {
      const base = row.productId ? this.fallbackById.get(normalize(row.productId)) : null;
      const key = base
        ? `product:${normalize(base.id)}`
        : `legacy:${normalize(row.nome)}|${normalize(row.cor)}|${Number(row.preco)}`;
      const isScrub = normalize(row.nome).includes("scrub");
      if (!groups.has(key)) {
        const generated = {
          id: `SFL-${slug(row.nome)}-${slug(row.cor)}`,
          slug: `${normalize(row.nome).replace(/[^a-z0-9]+/g, "-")}-${normalize(row.cor).replace(/[^a-z0-9]+/g, "-")}`.replace(/^-|-$/g, ""),
          name: `${row.nome} — ${row.cor}`,
          description: `${row.colecao || "Surgery For Life"}. Cor ${row.cor}.`,
          category: row.colecao || (isScrub ? "Scrubs" : "Jalecos"),
          price: Number(row.preco),
          stock: 0,
          badge: row.colecao || "Surgery For Life",
          image: isScrub ? "/assets/sfl-scrub.jpg" : "/assets/sfl-coat.jpg",
          keywords: [row.nome, row.cor, row.colecao || "", "scrub", "surgery"],
          colors: [{ name: String(row.cor), value: "#334155" }],
          fits: ["Essencial"],
          features: ["Modelagem funcional", "Acabamento preciso", "Conforto para a rotina"],
          laserCut: true,
          personalizable: true,
        };
        groups.set(key, {
          ...(base ? structuredClone(base) : generated),
          price: Number(row.preco),
          stock: 0,
          variants: [],
          variantStock: {},
          variantSku: {},
          variantIds: {},
          stockVariants: [],
        });
      }
      const product = groups.get(key);
      const size = String(row.tam);
      const quantity = Math.max(0, Number(row.qtd));
      product.stock += quantity;
      product.variants.push(size);
      product.variantStock[size] = Number(product.variantStock[size] || 0) + quantity;
      product.variantSku[size] ||= row.sku;
      product.variantIds[size] ||= row.variantId || row.sku;
      product.stockVariants.push({
        id: row.variantId || row.sku,
        variantId: row.variantId || row.sku,
        sku: row.sku,
        size,
        stock: quantity,
      });
    }
    return [...groups.values()].map((product) => ({ ...product, variants: unique(product.variants) }));
  }

  available() { return this.products.filter((product) => product.stock > 0); }
  byId(id) { return this.products.find((product) => normalize(product.id) === normalize(id)); }
  categories() { return [...new Set(this.available().map((product) => product.category))].sort(); }
  stockFor(product, variant) { return product.variantStock ? Number(product.variantStock[variant] || 0) : product.stock; }
  reserveOrder(order) { return this.inventory?.reserve(order) ?? null; }

  search(query) {
    const wanted = tokens(query);
    return this.available().map((product) => {
      const searchable = tokens([product.id, product.name, product.description, product.category, ...(product.keywords || [])].join(" "));
      let score = 0;
      for (const word of wanted) {
        const similar = [...searchable].some((candidate) => candidate === word || (candidate.length >= 4 && word.length >= 4 && (candidate.startsWith(word) || word.startsWith(candidate))));
        if (similar) score += 1;
      }
      if (normalize(product.category) === normalize(query)) score += 3;
      return { product, score };
    }).filter((entry) => entry.score > 0).sort((left, right) => right.score - left.score).map((entry) => entry.product).slice(0, 8);
  }
}
