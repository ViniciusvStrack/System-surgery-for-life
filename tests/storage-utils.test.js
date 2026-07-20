import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { JsonStore } from "../src/json-store.js";
import { makeOrderId, money, normalize, tokens } from "../src/utils.js";

test("JsonStore persiste dados e cria diretórios", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "loja-")), "sub", "data.json");
  const store = new JsonStore(file, []);
  assert.deepEqual(store.read(), []);
  store.write([{ ok: true }]);
  assert.deepEqual(store.read(), [{ ok: true }]);
  assert.equal(fs.existsSync(`${file}.tmp`), false);
  if (process.platform !== "win32") assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

test("JsonStore recupera fallback quando JSON está corrompido", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "loja-")), "data.json");
  fs.writeFileSync(file, "{quebrado", "utf8");
  assert.deepEqual(new JsonStore(file, { safe: true }).read(), { safe: true });
});

test("utilitários normalizam texto, moeda, tokens e ids", () => {
  assert.equal(normalize("  Olá, AÇÃO  "), "ola, acao");
  assert.ok(tokens("Tênis casual").has("tenis"));
  assert.match(money(59.9), /59,90/);
  assert.match(makeOrderId(), /^PED-\d{8}-[A-F0-9]{6}$/);
});
