import assert from "node:assert/strict";
import test from "node:test";
import {
  recommendSize,
  generateEmbroideryPreview,
  WaitlistService,
  calculateKitDiscount,
  buildKit,
  generateSocialProof,
  getAvailableCollectionDates,
  estimateDelivery,
  ReferralService,
  createReverseLabel,
  getPlantaoMode,
} from "../src/premium-features.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("recomenda tamanho com IA baseado em altura peso", () => {
  const r1 = recommendSize({ heightCm: 165, weightKg: 65, bodyType: "medio" });
  assert.ok(["PP","P","M","G","GG"].includes(r1.size));
  assert.ok(r1.confidence >= 83 && r1.confidence <= 95);
  assert.ok(r1.reason.includes("cm"));

  const r2 = recommendSize({ heightCm: 180, weightKg: 90 });
  assert.equal(r2.size, "GG");

  const invalid = recommendSize({ heightCm: 10, weightKg: 5 });
  assert.equal(invalid.size, null);
});

test("gera preview bordado ao vivo sem XSS", () => {
  const p = generateEmbroideryPreview({ name: "Dra. Ana", crm: "CRM 1234", color: "#D6BE9D" });
  assert.equal(p.valid, true);
  assert.ok(p.previewHtml.includes("Dra. Ana"));
  assert.ok(p.previewHtml.includes("CRM 1234"));

  const xss = generateEmbroideryPreview({ name: "<script>alert(1)</script>", crm: "" });
  assert.equal(xss.previewHtml.includes("<script>"), false);
  assert.equal(xss.valid, true); // nome sanitizado ainda válido
});

test("waitlist adiciona e evita duplicado mesmo SKU WhatsApp", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sfl-waitlist-"));
  const file = path.join(dir, "waitlist.json");
  const service = new WaitlistService(file);
  
  const r1 = service.add({ sku: "SFL-NAVY-M-NOIR", productName: "Scrub Noir", customerName: "Ana", whatsapp: "81999999999" });
  assert.equal(r1.already, false);
  assert.equal(service.getBySku("SFL-NAVY-M-NOIR").length, 1);

  const r2 = service.add({ sku: "SFL-NAVY-M-NOIR", productName: "Scrub Noir", customerName: "Ana", whatsapp: "81999999999" });
  assert.equal(r2.already, true);
  assert.equal(service.getBySku("SFL-NAVY-M-NOIR").length, 1);

  const notified = service.notifyRestocked("SFL-NAVY-M-NOIR", 10);
  assert.equal(notified, 1);
  assert.equal(service.getBySku("SFL-NAVY-M-NOIR").length, 0);
  assert.equal(service.stats().pending, 0);
  assert.equal(service.stats().notified, 1);
});

test("kit builder calcula desconto progressivo", () => {
  assert.equal(calculateKitDiscount([{price:100}]).percent, 0);
  assert.equal(calculateKitDiscount([{price:100},{price:100}]).percent, 10);
  assert.equal(calculateKitDiscount([{price:100},{price:100},{price:100}]).percent, 15);
  assert.equal(calculateKitDiscount(new Array(4).fill({price:100})).percent, 18);
  assert.equal(calculateKitDiscount(new Array(5).fill({price:100})).percent, 20);

  const kit = buildKit([{price:100,qty:1},{price:200,qty:1}]);
  assert.equal(kit.subtotal, 300);
  assert.equal(kit.percent, 10);
  assert.equal(kit.discount, 30);
  assert.equal(kit.total, 270);
});

test("prova social gera mensagem aleatória mas válida", () => {
  const msg = generateSocialProof("Scrub Noir");
  assert.ok(typeof msg === "string" && msg.length > 10);
  assert.ok(msg.includes("Scrub Noir") || msg.includes("Scrub") || msg.includes("comprou") || msg.includes("🔥"));
});

test("coleta agendada retorna datas sem domingo e com slots", () => {
  const dates = getAvailableCollectionDates({ daysAhead: 7 });
  assert.ok(dates.length >= 4 && dates.length <= 6);
  assert.ok(dates.every(d => !d.fullLabel.toLowerCase().includes("domingo")));
  assert.ok(dates[0].slots.length > 0);
  
  const est = estimateDelivery(dates[0].date, "50000000");
  assert.ok(est.days >= 1 && est.days <= 4);
  assert.ok(est.cost >= 18);
  assert.equal(est.carrier, "Jadlog via Melhor Envio");
});

test("indicação médica rastreável cria link e rastreia venda", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sfl-ref-"));
  const file = path.join(dir, "refs.json");
  const service = new ReferralService(file);
  
  const created = service.createLink({ doctorName: "Ana Clara", whatsapp: "81999999999" });
  assert.ok(created.link.includes("?ref="));
  assert.ok(created.code.length >= 3);

  const tracked = service.trackSale(created.code, 397);
  assert.equal(tracked.sales, 1);
  assert.equal(tracked.earnings, 50);

  const stats = service.getStats();
  assert.equal(stats.totalRefs, 1);
  assert.equal(stats.totalSales, 1);
});

test("devolução logística reversa cria estrutura correta", () => {
  const rev = createReverseLabel({ originalOrder: "PED-123", reason: "Troca tamanho M para G", sku: "SFL-NAVY-M-NOIR", quantity: 1 });
  assert.ok(rev.id.startsWith("REV-"));
  assert.equal(rev.originalOrder, "PED-123");
  assert.equal(rev.status, "aguardando_coleta");
  assert.equal(rev.steps.length, 5);
  assert.equal(rev.steps[0].done, true);
});

test("plantão noturno detecta horário", () => {
  const mode = getPlantaoMode();
  assert.ok(typeof mode.isNightShift === "boolean");
  assert.ok(["dark","light"].includes(mode.theme));
  assert.ok(typeof mode.message === "string");
});
