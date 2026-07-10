import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { StoreBot } from "../src/bot.js";
import { Catalog } from "../src/catalog.js";

class MemoryStore { constructor(value) { this.value = value; } read() { return structuredClone(this.value); } write(value) { this.value = structuredClone(value); } }
function setup(config = {}) {
  const root = path.resolve("."); const sessions = new MemoryStore({}); const orders = new MemoryStore([]);
  const bot = new StoreBot({ catalog: new Catalog(path.join(root, "data/catalog.json")), sessions, orders, faqFile: path.join(root, "data/faqs.json"), config: { storeName: "Teste", deliveryFee: 10, freeShippingFrom: 200, ...config } });
  return { bot, sessions, orders };
}
async function add(bot, user, code, variant, qty) {
  await bot.handle(user, `adicionar ${code}`); await bot.handle(user, variant); return bot.handle(user, String(qty));
}

test("valida produto, variação e quantidades inválidas", async () => {
  const { bot } = setup();
  assert.match((await bot.handle("1", "adicionar XXX")).messages[0], /indisponível/);
  await bot.handle("1", "adicionar CAM-001");
  assert.match((await bot.handle("1", "XG")).messages[0], /Opção inválida/);
  await bot.handle("1", "M");
  assert.match((await bot.handle("1", "zero")).messages[0], /entre 1 e 20/);
  assert.match((await bot.handle("1", "21")).messages[0], /entre 1 e 20/);
});

test("impede estoque acumulado acima do disponível", async () => {
  const { bot } = setup();
  await add(bot, "2", "CAM-001", "M", 20);
  await bot.handle("2", "adicionar CAM-001"); await bot.handle("2", "M");
  assert.match((await bot.handle("2", "1")).messages[0], /já possui 20/);
});

test("considera todas as variações no limite total de estoque", async () => {
  const { bot } = setup();
  await add(bot, "2b", "CAM-001", "M", 15);
  await bot.handle("2b", "adicionar CAM-001"); await bot.handle("2b", "G");
  assert.match((await bot.handle("2b", "6")).messages[0], /já possui 15.*máximo 20/);
  await bot.handle("2b", "5");
  assert.match((await bot.handle("2b", "alterar 1 16")).messages[0], /entre 1 e 15/);
});

test("altera, remove e limpa itens do carrinho", async () => {
  const { bot, sessions } = setup();
  await add(bot, "3", "CAM-001", "G", 2);
  assert.match((await bot.handle("3", "alterar 1 4")).messages[0], /alterada para 4/);
  assert.match((await bot.handle("3", "alterar 9 2")).messages[0], /não existe/);
  assert.match((await bot.handle("3", "alterar 1 99")).messages[0], /entre 1 e 20/);
  assert.match((await bot.handle("3", "remover 1")).messages[0], /foi removido/);
  await add(bot, "3", "CAM-001", "P", 1);
  assert.match((await bot.handle("3", "limpar carrinho")).messages[0], /esvaziado/);
  assert.equal(sessions.read()["3"].cart.length, 0);
});

test("salva, lista e remove favoritos sem duplicar", async () => {
  const { bot, sessions } = setup();
  await bot.handle("4", "favoritar CAM-001"); await bot.handle("4", "favoritar CAM-001");
  assert.equal(sessions.read()["4"].favorites.length, 1);
  assert.match((await bot.handle("4", "favoritos")).messages[0], /Camiseta Básica/);
  assert.match((await bot.handle("4", "desfavoritar CAM-001")).messages[0], /removido/);
  assert.match((await bot.handle("4", "favoritos")).messages[0], /ainda não tem/);
});

test("anexa observação ao pedido e limpa após confirmação", async () => {
  const { bot, orders, sessions } = setup(); const user = "5";
  assert.match((await bot.handle(user, "observação presente")).messages[0], /Adicione um produto/);
  await add(bot, user, "CAM-001", "M", 1);
  await bot.handle(user, "observação embrulhar para presente");
  for (const input of ["finalizar", "João Silva", "retirada"]) await bot.handle(user, input);
  assert.match((await bot.handle(user, "confirmar")).messages[0], /registrado/);
  assert.equal(orders.read()[0].note, "embrulhar para presente");
  assert.equal(sessions.read()[user].orderNote, null);
});

test("aplica frete e frete grátis no limite configurado", async () => {
  const first = setup(); await add(first.bot, "6", "CAM-001", "M", 1);
  for (const input of ["finalizar", "Maria Silva", "entrega"]) await first.bot.handle("6", input);
  assert.match((await first.bot.handle("6", "Rua A, 10, Centro, São Paulo, 01000-000")).messages[0], /Frete: R\$\s*10,00/);

  const second = setup(); await add(second.bot, "7", "TEN-001", "40", 2);
  for (const input of ["finalizar", "Maria Silva", "entrega"]) await second.bot.handle("7", input);
  assert.match((await second.bot.handle("7", "Rua A, 10, Centro, São Paulo, 01000-000")).messages[0], /Frete: R\$\s*0,00/);
});

test("valida checkout, permite correção e evita pedido duplicado", async () => {
  const { bot, orders } = setup(); const user = "8";
  assert.match((await bot.handle(user, "finalizar")).messages[0], /vazio/);
  await add(bot, user, "CAM-001", "M", 1); await bot.handle(user, "finalizar");
  assert.match((await bot.handle(user, "A")).messages[0], /nome completo/);
  await bot.handle(user, "Ana Silva");
  assert.match((await bot.handle(user, "motoboy")).messages[0], /entrega.*retirada/);
  await bot.handle(user, "entrega");
  assert.match((await bot.handle(user, "Rua 1")).messages[0], /incompleto/);
  await bot.handle(user, "Rua A, 10, Centro, São Paulo, 01000-000");
  assert.match((await bot.handle(user, "talvez")).messages[0], /confirmar/);
  await bot.handle(user, "confirmar"); await bot.handle(user, "confirmar");
  assert.equal(orders.read().length, 1);
});

test("cancelamento preserva carrinho e status respeita o dono", async () => {
  const { bot, orders } = setup(); const user = "9";
  await add(bot, user, "CAM-001", "M", 1); await bot.handle(user, "finalizar");
  await bot.handle(user, "cancelar");
  assert.match((await bot.handle(user, "carrinho")).messages[0], /Camiseta Básica/);
  orders.write([{ id: "PED-20260101-ABC123", user, status: "Separando" }]);
  assert.match((await bot.handle(user, "PED-20260101-ABC123")).messages[0], /Separando/);
  assert.match((await bot.handle("outro", "PED-20260101-ABC123")).messages[0], /Não encontrei/);
});
