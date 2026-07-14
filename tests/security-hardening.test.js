import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validateConfig } from "../src/config.js";
import { JsonStore } from "../src/json-store.js";
import { SlidingWindowRateLimiter, WebhookDeduplicator } from "../src/security.js";

test("rate limiter bloqueia excesso e libera após a janela", () => {
  const limiter = new SlidingWindowRateLimiter({ limit: 3, windowMs: 1000 });
  assert.equal(limiter.consume("ip", 1000).allowed, true); assert.equal(limiter.consume("ip", 1100).allowed, true); assert.equal(limiter.consume("ip", 1200).allowed, true);
  const blocked = limiter.consume("ip", 1300); assert.equal(blocked.allowed, false); assert.ok(blocked.retryAfterSeconds >= 1); assert.equal(limiter.consume("ip", 2101).allowed, true);
});

test("deduplicador persiste, bloqueia repetição e permite retry", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sfl-webhook-")), "events.json"); const store = new JsonStore(file, []); const first = new WebhookDeduplicator(store);
  assert.equal(first.claim("wamid.1", 1000), true); assert.equal(first.claim("wamid.1", 1001), false); const restarted = new WebhookDeduplicator(store); assert.equal(restarted.claim("wamid.1", 1002), false); restarted.release("wamid.1"); assert.equal(restarted.claim("wamid.1", 1003), true);
});

test("deduplicador expira eventos antigos", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sfl-webhook-")), "events.json"); const dedup = new WebhookDeduplicator(new JsonStore(file, []), 1000);
  assert.equal(dedup.claim("event", 1000), true); assert.equal(dedup.claim("event", 2501), true);
});

test("produção recusa segredos fracos, simulador e valores inválidos", () => {
  const base = { port: 3000, deliveryFee: 0, freeShippingFrom: 0, appEnv: "production", simulatorEnabled: false, authEncryptionKey: "x".repeat(40), verifyToken: "verify", appSecret: "secret" };
  assert.equal(validateConfig(base), base); assert.throws(() => validateConfig({ ...base, simulatorEnabled: true }), /ENABLE_SIMULATOR/); assert.throws(() => validateConfig({ ...base, authEncryptionKey: "fraca" }), /AUTH_ENCRYPTION_KEY/); assert.throws(() => validateConfig({ ...base, verifyToken: "" }), /VERIFY_TOKEN/); assert.throws(() => validateConfig({ ...base, port: 99999 }), /PORT/); assert.throws(() => validateConfig({ ...base, deliveryFee: -1 }), /frete/);
});
