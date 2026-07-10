import path from "node:path";
import { Catalog } from "../src/catalog.js";
import { StoreBot } from "../src/bot.js";

class MemoryStore { constructor(value) { this.value = value; } read() { return structuredClone(this.value); } write(value) { this.value = structuredClone(value); } }
const root = path.resolve(".");
const bot = new StoreBot({ catalog: new Catalog(path.join(root, "data/catalog.json")), sessions: new MemoryStore({}), orders: new MemoryStore([]), faqFile: path.join(root, "data/faqs.json"), config: { storeName: "Loja Demonstração", deliveryFee: 10, freeShippingFrom: 200 } });
const phone = "5511999999999";
for (const input of ["oi", "camiseta", "adicionar CAM-001", "M", "2", "finalizar", "Maria Silva", "retirada", "confirmar"]) {
  const output = await bot.handle(phone, input, "Maria");
  console.log(`\nCLIENTE: ${input}\nBOT: ${output.messages.join("\n")}`);
}
