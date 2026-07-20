import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { StoreBot } from "../src/bot.js";
import { Catalog } from "../src/catalog.js";

class MemoryStore { constructor(value) { this.value = value; } read() { return structuredClone(this.value); } write(value) { this.value = structuredClone(value); } }
function setup() {
  const root = path.resolve("."); const sessions = new MemoryStore({}); const orders = new MemoryStore([]);
  return { bot: new StoreBot({ catalog: new Catalog(path.join(root, "data/catalog.json")), sessions, orders, faqFile: path.join(root, "data/faqs.json"), config: { storeName: "Teste", deliveryFee: 10, freeShippingFrom: 200 } }), orders };
}

test("fluxo completo cria pedido sem coletar pagamento", async () => {
  const { bot, orders } = setup(); const user = "5511000000000";
  for (const input of ["adicionar JAL-001", "M", "2", "finalizar", "Ana Maria", "entrega", "Rua A, 10, Centro, São Paulo, 01000-000"]) await bot.handle(user, input);
  const result = await bot.handle(user, "confirmar");
  assert.equal(result.order.total, 1178);
  assert.equal(orders.read().length, 1);
  assert.match(result.messages[0], /não solicita dados de cartão/i);
});

test("encaminha para humano e não inventa resposta", async () => {
  const { bot } = setup();
  assert.equal((await bot.handle("1", "atendente")).handoff, true);
  const unknown = await bot.handle("2", "astrofísica quântica");
  assert.match(unknown.messages[0], /não consegui entender/i);
});

test("entende saudações completas, opções e conversa informal", async () => {
  const { bot } = setup();
  const greeting = await bot.handle("3", "Oi, boa tarde! Tudo bom?", "Vinicius");
  assert.match(greeting.messages[0], /Vinicius/);
  assert.match(greeting.messages[0], /Menu da loja/);

  const options = await bot.handle("3", "Quais as opções que vocês têm?");
  assert.match(options.messages[0], /Claro! Estas são as opções disponíveis/);

  const thanks = await bot.handle("3", "Muito obrigado pela ajuda");
  assert.match(thanks.messages[0], /Por nada/);
});

test("responde horário de atendimento escrito naturalmente", async () => {
  const { bot } = setup();
  const response = await bot.handle("4", "Por favor, qual é o horário de atendimento hoje?");
  assert.match(response.messages[0], /segunda a sexta, das 9h às 18h/i);
});

test("permite escolher produto por número sem copiar código", async () => {
  const { bot } = setup();
  const list = await bot.handle("5", "jaleco axis");
  assert.match(list.messages[0], /1\. Jaleco Axis/);
  assert.match(list.messages[0], /número do produto/);
  const selected = await bot.handle("5", "1");
  assert.match(selected.messages[0], /Qual opção deseja/);
  assert.match(selected.messages[0], /PP \| P \| M \| G \| GG/);
});
