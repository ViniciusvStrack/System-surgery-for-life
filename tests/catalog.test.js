import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { Catalog } from "../src/catalog.js";

const catalog = new Catalog(path.resolve("data/catalog.json"));

test("localiza produto por código ignorando maiúsculas", () => {
  assert.equal(catalog.byId("jal-001").name, "Jaleco Axis");
  assert.equal(catalog.byId("inexistente"), undefined);
});

test("busca por nome, palavra-chave e categoria", () => {
  assert.equal(catalog.search("jaleco")[0].id, "JAL-001");
  assert.equal(catalog.search("alfaiataria")[0].id, "JAL-001");
  assert.equal(catalog.search("Scrubs")[0].id, "SCR-001");
  assert.deepEqual(catalog.search("telescópio"), []);
});

test("lista categorias únicas e produtos disponíveis", () => {
  assert.deepEqual(catalog.categories(), ["Jalecos", "Scrubs"]);
  assert.ok(catalog.available().every((product) => product.stock > 0));
});
