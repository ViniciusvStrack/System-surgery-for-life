# ASL Foundation and Hybrid Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one safe conversational foundation for storefront and WhatsApp, close audited production blockers, and add an optional intent-only LLM provider with deterministic fallback.

**Architecture:** Channel adapters call a shared conversation engine backed by authoritative policy, catalog-read, handoff, safety, and event interfaces. Webhook delivery uses a durable JSON inbox/outbox suitable for one process; every boundary is replaceable so PostgreSQL can be introduced later without changing conversation behavior.

**Tech Stack:** Node.js 20+ ESM, built-in `node:test`, native `fetch`, JSON persistence, HTML/CSS/ES modules, Playwright, axe-core.

## Global Constraints

- Preserve all existing 95 tests and public response contracts unless a task explicitly changes a documented unsafe behavior.
- The web assistant remains read-only; WhatsApp writes remain behind explicit state-machine confirmation.
- Price, stock, variants, policy, and contact destinations always come from deterministic services.
- The optional intent provider is disabled by default and never receives unredacted PII or tools.
- Production is single-instance while persistence is JSON; no claim of horizontal-scaling safety.
- Do not add PostgreSQL, Redis, Kafka, Kubernetes, a frontend framework, vector search, autonomous tools, or permanent conversation memory.
- Logs and operational events never contain raw messages, full phone numbers, names, addresses, credentials, or tokens.
- All new behavior uses test-first red-green-refactor and narrowly scoped commits.

---

### Task 1: Shared policy, catalog read model, and handoff contracts

**Files:**
- Create: `src/assistant/policy-registry.js`
- Create: `src/assistant/catalog-read-model.js`
- Create: `src/assistant/handoff-service.js`
- Modify: `src/config.js`
- Modify: `src/store-assistant.js`
- Modify: `src/bot.js`
- Modify: `data/faqs.json`
- Test: `tests/assistant-foundation.test.js`

**Interfaces:**
- Produces: `PolicyRegistry.get(topic)`, `PolicyRegistry.answer(topic)`, `CatalogReadModel.snapshot()`, `CatalogReadModel.availableSizes(productId)`, `HandoffService.createHumanRequest({ channel })`, and `HandoffService.isHumanRequest(text)`.
- Consumes: existing `Catalog.availableReadOnly()` and `CommerceService.publicConfig()`.

- [ ] **Step 1: Write failing parity and handoff tests**

```js
test("web and WhatsApp use identical operational policy facts", () => {
  const policies = new PolicyRegistry({ hours: "Segunda a sexta, 09:00-18:00" });
  assert.equal(policies.answer("hours"), "Segunda a sexta, 09:00-18:00");
  assert.equal(policies.answer("unknown"), null);
});

test("typed handoff marker is recognized without PII", () => {
  const handoff = new HandoffService({ whatsappUrl: "https://wa.me/558199877324" });
  const action = handoff.createHumanRequest({ channel: "web" });
  assert.equal(action.type, "human_request");
  assert.match(action.url, /ASL-HUMAN/);
  assert.equal(handoff.isHumanRequest("ASL-HUMAN"), true);
  assert.doesNotMatch(action.url, /nome|email|cpf/i);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test tests/assistant-foundation.test.js`
Expected: FAIL because `src/assistant/*` does not exist.

- [ ] **Step 3: Implement the shared deterministic services**

```js
export class PolicyRegistry {
  constructor(values) { this.values = Object.freeze({ ...values }); this.version = "2026-08-11"; }
  get(topic) { return this.values[String(topic)] ?? null; }
  answer(topic) { return this.get(topic); }
}

export class CatalogReadModel {
  constructor(catalog) { this.catalog = catalog; }
  snapshot() {
    const products = this.catalog.availableReadOnly();
    return { revision: String(this.catalog.revision?.() ?? "unknown"), products };
  }
  availableSizes(productId) {
    const product = this.snapshot().products.find((item) => item.id === productId);
    return product ? product.variants.filter((size) => Number(product.variantStock?.[size]) > 0) : [];
  }
}
```

Implement `HandoffService` with the literal marker `ASL-HUMAN`, official-host URL validation, and typed actions. Replace duplicated FAQ facts with config-backed policy values. Make both assistant engines consume these services.

- [ ] **Step 4: Verify shared facts, available variants, and handoff GREEN**

Run: `node --test tests/assistant-foundation.test.js tests/store-assistant.test.js tests/bot.test.js tests/bot-edge.test.js`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/assistant src/config.js src/store-assistant.js src/bot.js data/faqs.json tests/assistant-foundation.test.js
git commit -m "feat: unify assistant policies catalog reads and handoff"
```

### Task 2: Shared conversation engine and structured context

**Files:**
- Create: `src/assistant/intent-router.js`
- Create: `src/assistant/conversation-engine.js`
- Create: `src/assistant/safety-policy.js`
- Modify: `src/store-assistant.js`
- Modify: `src/bot.js`
- Modify: `src/server.js`
- Test: `tests/conversation-engine.test.js`
- Test: `tests/assistant-channel-parity.test.js`

**Interfaces:**
- Consumes: Task 1 services.
- Produces: `IntentRouter.route({ text, context })`, `SafetyPolicy.redact(text)`, and `ConversationEngine.respond({ channel, text, principal, conversationId })` returning `{ reply, intent, entities, actions, suggestions, context, facts }`.

- [ ] **Step 1: Write failing structured-context and channel-parity tests**

```js
test("ambiguous follow-up asks for clarification", async () => {
  const first = await engine.respond({ channel: "web", text: "mostre jalecos", principal: "p", conversationId: "abcdefgh" });
  assert.ok(first.context.candidateProductIds.length > 1);
  const second = await engine.respond({ channel: "web", text: "qual tem M?", principal: "p", conversationId: "abcdefgh" });
  assert.equal(second.intent, "clarify_product");
});

test("policy facts are identical across channels", async () => {
  const web = await engine.respond({ channel: "web", text: "qual o horario?", principal: "p", conversationId: "abcdefgh" });
  const whatsapp = await engine.respond({ channel: "whatsapp", text: "qual o horario?", principal: "5511999999999", conversationId: "whatsapp1" });
  assert.deepEqual(web.facts, whatsapp.facts);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/conversation-engine.test.js tests/assistant-channel-parity.test.js`
Expected: FAIL because the engine does not exist.

- [ ] **Step 3: Implement the engine and adapt existing channels**

The router supports the closed intents `greeting`, `product_search`, `comparison`, `availability`, `size`, `fabric`, `personalization`, `policy`, `checkout_guidance`, `human_handoff`, `clarify_product`, and `unknown`. Store only `activeProductId`, `candidateProductIds`, `lastIntent`, and timestamps. Preserve `StoreAssistant.answer()` and `StoreBot.handle()` as compatibility adapters delegating read-only interpretation to the engine.

- [ ] **Step 4: Verify GREEN and existing regressions**

Run: `node --test tests/conversation-engine.test.js tests/assistant-channel-parity.test.js tests/store-assistant.test.js tests/bot*.test.js`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/assistant src/store-assistant.js src/bot.js src/server.js tests/conversation-engine.test.js tests/assistant-channel-parity.test.js
git commit -m "feat: add shared ASL conversation engine"
```

### Task 3: Optional isolated intent provider

**Files:**
- Create: `src/assistant/intent-provider.js`
- Create: `src/assistant/provider-circuit-breaker.js`
- Modify: `src/assistant/intent-router.js`
- Modify: `src/config.js`
- Modify: `.env.example`
- Test: `tests/intent-provider.test.js`

**Interfaces:**
- Produces: `OpenAICompatibleIntentProvider.classify({ text, allowedIntents })` and `ProviderCircuitBreaker.execute(operation)`.
- Consumes: redacted text from `SafetyPolicy`; never consumes product facts, mutable services, or tools.

- [ ] **Step 1: Write failing provider safety tests**

```js
test("malformed provider output falls back locally", async () => {
  const provider = new OpenAICompatibleIntentProvider({ fetchImpl: async () => new Response("not-json") });
  await assert.rejects(() => provider.classify({ text: "jaleco", allowedIntents: ["product_search"] }), /INVALID_PROVIDER_RESPONSE/);
});

test("provider receives redacted text and rejects invented fields", async () => {
  let body;
  const provider = new OpenAICompatibleIntentProvider({ fetchImpl: async (_url, init) => { body = init.body; return Response.json({ intent: "product_search", entities: {}, confidence: 0.9, price: 1 }); } });
  await assert.rejects(() => provider.classify({ text: "email [e-mail removido]", allowedIntents: ["product_search"] }), /INVALID_PROVIDER_SCHEMA/);
  assert.doesNotMatch(body, /@/);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/intent-provider.test.js`
Expected: FAIL because provider modules do not exist.

- [ ] **Step 3: Implement strict schema, timeout, breaker, and fallback wiring**

Configuration keys are `ASSISTANT_LLM_ENABLED=false`, `ASSISTANT_LLM_BASE_URL`, `ASSISTANT_LLM_API_KEY`, `ASSISTANT_LLM_MODEL`, and `ASSISTANT_LLM_TIMEOUT_MS=2500`. Accept exactly `intent`, `entities`, and `confidence`; reject every extra key and confidence outside `[0,1]`. Open the breaker after three consecutive failures for 30 seconds.

- [ ] **Step 4: Verify provider and fallback GREEN**

Run: `node --test tests/intent-provider.test.js tests/conversation-engine.test.js tests/store-assistant.test.js`
Expected: all tests PASS with the provider disabled and with fake-provider failures.

- [ ] **Step 5: Commit**

```bash
git add src/assistant src/config.js .env.example tests/intent-provider.test.js
git commit -m "feat: add optional safe intent provider"
```

### Task 4: Production configuration, privacy, and premium-route containment

**Files:**
- Modify: `src/config.js`
- Modify: `src/server.js`
- Modify: `src/inventory.js`
- Modify: `src/premium-features.js`
- Modify: `public/loja/index.html`
- Modify: `public/loja/privacidade.html`
- Modify: `docs/variaveis-ambiente.md`
- Test: `tests/production-hardening.test.js`
- Test: `tests/server-routes.test.js`

**Interfaces:**
- Produces: production startup validation, `requireAdminApi(request)`, and `purgeExpiredBotSessions(now)`.
- Consumes: existing admin-session authorization and JSON stores.

- [ ] **Step 1: Write failing production and authorization tests**

```js
test("production refuses incomplete Meta configuration and demo seed", () => {
  assert.throws(() => getConfig({ NODE_ENV: "production", META_APP_SECRET: "x".repeat(32) }), /WHATSAPP_TOKEN/);
});

test("anonymous premium reads never expose records", async () => {
  const response = await request("/api/waitlist?sku=SFL", { method: "GET" });
  assert.equal(response.status, 401);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/production-hardening.test.js tests/server-routes.test.js`
Expected: FAIL on missing validation and public data exposure.

- [ ] **Step 3: Implement containment and documented retention**

Require all Meta credentials plus `HANDOFF_SIGNING_SECRET` in production. Refuse seed initialization when `NODE_ENV=production`. Require admin authorization for record reads and referral sale mutations; public creates return only opaque confirmation. Remove the dormant `premium-features.js` script reference. Add `BOT_SESSION_RETENTION_MS=86400000` and purge abandoned temporary checkout PII.

- [ ] **Step 4: Verify GREEN and security regression suite**

Run: `node --test tests/production-hardening.test.js tests/server-routes.test.js tests/security-hardening.test.js tests/auth.test.js`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config.js src/server.js src/inventory.js src/premium-features.js public/loja/index.html public/loja/privacidade.html docs/variaveis-ambiente.md tests/production-hardening.test.js tests/server-routes.test.js
git commit -m "fix: close production privacy and configuration blockers"
```

### Task 5: Durable webhook inbox/outbox and resilient Meta client

**Files:**
- Create: `src/meta/webhook-repository.js`
- Create: `src/meta/webhook-worker.js`
- Create: `src/meta/meta-client.js`
- Modify: `src/whatsapp.js`
- Modify: `src/server.js`
- Modify: `src/json-store.js`
- Test: `tests/webhook-reliability.test.js`
- Test: `tests/meta-client.test.js`

**Interfaces:**
- Produces: `WebhookRepository.receive(message)`, `claim(id)`, `complete(id)`, `retry(id, error)`, `deadLetter(id, error)`; `WebhookWorker.drain()`; and `MetaClient.sendText()`/`markRead()` returning correlation metadata.
- Consumes: existing `JsonStore`, `StoreBot`, and configuration.

- [ ] **Step 1: Write failing durability and retry tests**

```js
test("duplicate wamid is durably received once", async () => {
  assert.equal(await repository.receive({ id: "wamid.1", payload: { text: "oi" } }), true);
  assert.equal(await repository.receive({ id: "wamid.1", payload: { text: "oi" } }), false);
});

test("429 honors Retry-After and does not become permanent failure", async () => {
  const client = makeClient([new Response("limited", { status: 429, headers: { "Retry-After": "1" } }), Response.json({ messages: [{ id: "out.1" }] })]);
  const result = await client.sendText("5511999999999", "ok");
  assert.equal(result.messageId, "out.1");
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/webhook-reliability.test.js tests/meta-client.test.js`
Expected: FAIL because repository, worker, and client do not exist.

- [ ] **Step 3: Implement durable receive-before-ack and at-least-once effects**

Store only the minimum normalized payload required for processing. Use the literal states `received`, `processing`, `completed`, `retry`, `dead_letter`; limit attempts to five; apply exponential delays capped at 60 seconds. Validate webhook object, field, and configured `phone_number_id`. Process every batch member independently. Never log full payloads or phone numbers.

- [ ] **Step 4: Verify crash recovery, batch isolation, and Meta failures GREEN**

Run: `node --test tests/webhook-reliability.test.js tests/meta-client.test.js tests/whatsapp.test.js tests/bot-commerce.test.js`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/meta src/whatsapp.js src/server.js src/json-store.js tests/webhook-reliability.test.js tests/meta-client.test.js
git commit -m "feat: add durable webhook processing and Meta retries"
```

### Task 6: Health and redacted structured observability

**Files:**
- Create: `src/observability/event-sink.js`
- Create: `src/health.js`
- Modify: `src/server.js`
- Modify: `src/assistant/conversation-engine.js`
- Modify: `src/meta/webhook-worker.js`
- Test: `tests/observability.test.js`
- Test: `tests/health.test.js`

**Interfaces:**
- Produces: `JsonEventSink.emit(type, fields)`, `health.live()`, and `health.ready()`.
- Consumes: readiness probes from catalog, webhook repository, and Meta configuration.

- [ ] **Step 1: Write failing redaction and readiness tests**

```js
test("events contain operational fields but no raw PII", () => {
  sink.emit("assistant.response", { principal: "5511999999999", rawMessage: "meu email a@b.com", intent: "policy" });
  assert.match(output, /assistant.response/);
  assert.doesNotMatch(output, /5511999999999|a@b\.com|rawMessage/);
});

test("readiness fails when production Meta is unavailable", async () => {
  assert.equal((await health.ready()).ready, false);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/observability.test.js tests/health.test.js`
Expected: FAIL because modules and endpoints do not exist.

- [ ] **Step 3: Implement JSON events and `/live`, `/ready`, `/health` compatibility**

Hash principals with SHA-256 and a process secret; allowlist event keys. Record channel, intent, result, latency, catalog revision, policy version, provider state, handoff, attempts, and status only.

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests/observability.test.js tests/health.test.js tests/server-routes.test.js`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/observability src/health.js src/server.js src/assistant/conversation-engine.js src/meta/webhook-worker.js tests/observability.test.js tests/health.test.js
git commit -m "feat: add readiness and redacted assistant telemetry"
```

### Task 7: Frontend/admin hardening and browser coverage

**Files:**
- Modify: `public/loja/app.js`
- Modify: `public/loja/index.html`
- Modify: `public/estoque/api.js`
- Modify: `public/estoque/app.js`
- Modify: `public/estoque/index.html`
- Modify: `public/estoque/styles.css`
- Modify: `public/app.js`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `playwright.config.js`
- Create: `tests/browser/storefront.spec.js`
- Create: `tests/browser/inventory.spec.js`
- Test: `tests/frontend-helpers.test.js`

**Interfaces:**
- Produces: neutral assistant fallback, abortable `InventoryApi.request()`, revision-aware poller, duplicate-submit guard, and `csvCell(value)`.
- Consumes: existing HTTP routes and response contracts.

- [ ] **Step 1: Write failing helper and browser smoke tests**

```js
test("CSV cells neutralize formula prefixes", () => {
  assert.equal(csvCell("=HYPERLINK(\"x\")"), "'=HYPERLINK(\"x\")");
  assert.equal(csvCell("-12"), "'-12");
});

test("storefront has no missing local resources or critical axe findings", async ({ page }) => {
  const failures = [];
  page.on("response", (response) => { if (response.url().startsWith(baseURL) && response.status() >= 400) failures.push(response.url()); });
  await page.goto("/loja");
  expect(failures).toEqual([]);
});
```

- [ ] **Step 2: Install browser test dependencies and verify RED**

Run: `npm install --save-dev @playwright/test @axe-core/playwright && npx playwright install chromium`
Run: `node --test tests/frontend-helpers.test.js && npx playwright test`
Expected: helper import or browser assertions FAIL on current behavior.

- [ ] **Step 3: Implement bounded fallback, polling, submit, CSV, and accessibility fixes**

Use a 12-second request timeout, one in-flight refresh, pause while `document.hidden`, render only changed revisions, and capped failure backoff. Every async admin form uses a shared in-flight guard and `aria-busy`. Fallback text may only state temporary unavailability and offer retry/handoff. Add dialog labels, live regions, accessible close names, reduced motion, forced colors, and `noscript` guidance.

- [ ] **Step 4: Verify unit, browser, and accessibility GREEN**

Run: `node --test tests/frontend-helpers.test.js && npx playwright test`
Expected: all tests PASS with zero missing local resources and zero critical/serious axe violations on covered screens.

- [ ] **Step 5: Commit**

```bash
git add public package.json package-lock.json playwright.config.js tests/browser tests/frontend-helpers.test.js
git commit -m "fix: harden frontend reliability accessibility and browser coverage"
```

### Task 8: Documentation, cross-channel acceptance, and complete verification

**Files:**
- Modify: `README.md`
- Modify: `SECURITY.md`
- Modify: `docs/assistente-virtual.md`
- Modify: `docs/integracao-whatsapp.md`
- Modify: `docs/implantacao-producao.md`
- Modify: `docs/deploy-profissional.md`
- Modify: `docs/checklist-apresentacao-cliente.md`
- Test: `tests/assistant-acceptance.test.js`

**Interfaces:**
- Consumes: all prior task interfaces.
- Produces: an executable go-live checklist and at least 50 cross-channel utterance cases with fact/action parity.

- [ ] **Step 1: Write the acceptance matrix test**

```js
for (const sample of cases) {
  test(`cross-channel parity: ${sample.name}`, async () => {
    const web = await ask("web", sample.text);
    const whatsapp = await ask("whatsapp", sample.text);
    assert.deepEqual(web.facts, whatsapp.facts);
    assert.deepEqual(web.actions.map(({ type }) => type), whatsapp.actions.map(({ type }) => type));
  });
}
```

- [ ] **Step 2: Run acceptance and full suites before documentation changes**

Run: `node --test tests/assistant-acceptance.test.js`
Expected: FAIL until all 50 cases and channel fixtures are complete.

- [ ] **Step 3: Complete the 50-case matrix and align documentation**

Document local versus hybrid modes, provider isolation, actual Meta flow, inbox/outbox recovery, privacy/retention, live/ready semantics, browser tests, production credentials, single-instance limitation, and exact commands. Remove React/Vite/Vercel claims and stale test counts.

- [ ] **Step 4: Run complete verification**

Run: `npm test`
Expected: all Node tests PASS.

Run: `npx playwright test`
Expected: all browser tests PASS.

Run: `npm run format:css:check`
Expected: Prettier reports all matched files formatted.

Run: `docker build -t system-surgery-for-life:verify .`
Expected: image builds successfully.

- [ ] **Step 5: Commit**

```bash
git add README.md SECURITY.md docs tests/assistant-acceptance.test.js
git commit -m "docs: finalize ASL production and acceptance guidance"
```

