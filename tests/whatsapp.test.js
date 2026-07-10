import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { extractMessages, verifySignature } from "../src/whatsapp.js";

test("aceita assinatura HMAC legítima e rejeita adulterações", () => {
  const body = Buffer.from('{"object":"whatsapp_business_account"}');
  const secret = "segredo-de-teste";
  const signature = "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(verifySignature(body, signature, secret), true);
  assert.equal(verifySignature(Buffer.from("adulterado"), signature, secret), false);
  assert.equal(verifySignature(body, "sha256=invalida", secret), false);
  assert.equal(verifySignature(body, signature, ""), false);
});

test("extrai texto, nome e id de payload oficial", () => {
  const payload = { entry: [{ changes: [{ value: {
    contacts: [{ wa_id: "551199", profile: { name: "Ana" } }],
    messages: [{ id: "wamid.1", from: "551199", text: { body: "Olá" } }],
  } }] }] };
  assert.deepEqual(extractMessages(payload), [{ id: "wamid.1", from: "551199", text: "Olá", name: "Ana" }]);
});

test("extrai botões e ignora eventos de status sem mensagem", () => {
  const payload = { entry: [{ changes: [{ value: { messages: [
    { id: "1", from: "a", button: { text: "Catálogo" } },
    { id: "2", from: "b", interactive: { button_reply: { title: "Carrinho" } } },
    { id: "3", from: "c", interactive: { list_reply: { title: "Camisetas" } } },
    { id: "4", from: "d", image: { id: "imagem" } },
  ] } }] }] };
  assert.deepEqual(extractMessages(payload).map((x) => x.text), ["Catálogo", "Carrinho", "Camisetas"]);
  assert.deepEqual(extractMessages({ entry: [{ changes: [{ value: { statuses: [{}] } }] }] }), []);
  assert.deepEqual(extractMessages({}), []);
});
