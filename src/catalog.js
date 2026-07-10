import fs from "node:fs";
import { normalize, tokens } from "./utils.js";

function slug(value) {
  return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").toUpperCase();
}

export class Catalog {
  constructor(file, inventory = null) {
    this.fallbackProducts = JSON.parse(fs.readFileSync(file, "utf8"));
    this.inventory = inventory;
  }

  get products() {
    const stockProducts = this.inventory?.snapshot().products ?? [];
    if (!stockProducts.length) return this.fallbackProducts;

    const groups = new Map();
    for (const row of stockProducts) {
      const key = `${normalize(row.nome)}|${normalize(row.cor)}|${Number(row.preco)}`;
      if (!groups.has(key)) groups.set(key, {
        id: `SFL-${slug(row.nome)}-${slug(row.cor)}`,
        name: `${row.nome} — ${row.cor}`,
        description: `${row.colecao || "Surgery For Life"}. Cor ${row.cor}.`,
        category: row.colecao || "Surgery For Life",
        price: Number(row.preco),
        stock: 0,
        keywords: [row.nome, row.cor, row.colecao || "", "scrub", "surgery"],
        variants: [], variantStock: {}, variantSku: {},
      });
      const product = groups.get(key);
      product.stock += Math.max(0, Number(row.qtd));
      product.variants.push(String(row.tam));
      product.variantStock[String(row.tam)] = Math.max(0, Number(row.qtd));
      product.variantSku[String(row.tam)] = row.sku;
    }
    return [...groups.values()];
  }

  available() { return this.products.filter((p) => p.stock > 0); }
  byId(id) { return this.products.find((p) => normalize(p.id) === normalize(id)); }
  categories() { return [...new Set(this.available().map((p) => p.category))].sort(); }
  stockFor(product, variant) { return product.variantStock ? Number(product.variantStock[variant] || 0) : product.stock; }
  reserveOrder(order) { return this.inventory?.reserve(order) ?? null; }

  search(query) {
    const wanted = tokens(query);
    return this.available().map((product) => {
      const searchable = tokens([product.id, product.name, product.description, product.category, ...product.keywords].join(" "));
      let score = 0;
      for (const word of wanted) {
        const similar = [...searchable].some((candidate) => candidate === word || (candidate.length >= 4 && word.length >= 4 && (candidate.startsWith(word) || word.startsWith(candidate))));
        if (similar) score += 1;
      }
      if (normalize(product.category) === normalize(query)) score += 3;
      return { product, score };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).map((x) => x.product).slice(0, 8);
  }
}
