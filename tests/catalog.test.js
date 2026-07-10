import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { Catalog } from "../src/catalog.js";

const catalog = new Catalog(path.resolve("data/catalog.json"));

test("localiza produto por código ignorando maiúsculas", () => {
  assert.equal(catalog.byId("cam-001").name, "Camiseta Básica Premium");
  assert.equal(catalog.byId("inexistente"), undefined);
});

test("busca por nome, palavra-chave e categoria", () => {
  assert.equal(catalog.search("camiseta")[0].id, "CAM-001");
  assert.equal(catalog.search("algodão")[0].id, "CAM-001");
  assert.equal(catalog.search("Calçados")[0].id, "TEN-001");
  assert.deepEqual(catalog.search("telescópio"), []);
});

test("lista categorias únicas e produtos disponíveis", () => {
  assert.deepEqual(catalog.categories(), ["Calçados", "Calças", "Camisetas"]);
  assert.ok(catalog.available().every((product) => product.stock > 0));
});
