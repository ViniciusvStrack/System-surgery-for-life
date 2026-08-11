# ASL Foundation and Hybrid Intelligence Design

## Objective

Transform the existing local ASL assistant into a safe, consistent, observable conversational foundation shared by the storefront and WhatsApp, while fixing the production blockers found in the repository audit. The release remains compatible with a single Node.js process and JSON persistence, but its interfaces must permit a later PostgreSQL migration.

## Scope

This delivery includes:

- one shared conversation engine for web and WhatsApp;
- deterministic grounding for catalog, inventory, policy, handoff, and commerce facts;
- an optional LLM intent-normalization provider that is disabled by default;
- production configuration hardening and removal/protection of unsafe public premium APIs;
- reliable single-instance webhook inbox/outbox processing with retry states;
- structured, redacted assistant and webhook events;
- frontend safety, inventory polling, accessibility, and duplicate-submit improvements;
- HTTP, browser smoke, accessibility, and regression coverage;
- documentation aligned with actual behavior.

This delivery does not include PostgreSQL, horizontal scaling, Kafka, Kubernetes, autonomous agents, vector search, fine-tuning, permanent semantic memory, voice, vision, or multilingual support.

## Architecture

Both channel adapters call a shared `ConversationEngine`:

```text
Storefront adapter ----+
                       +--> ConversationEngine
WhatsApp adapter ------+       |-- IntentRouter
                               |-- SafetyPolicy
                               |-- PolicyRegistry
                               |-- CatalogReadModel
                               |-- HandoffService
                               |-- AssistantEventSink
                               `-- optional IntentProvider
```

The engine owns intent interpretation, structured context, policy responses, safe fallback behavior, and handoff actions. Channel adapters only translate channel input/output. The web channel remains read-only. WhatsApp mutations remain behind its explicit state machine and confirmation flow.

Authoritative facts always come from deterministic services:

- product, price, stock, and variants from `CatalogReadModel`;
- hours, delivery, exchange, payment, address, and support rules from `PolicyRegistry`;
- official contact destinations from `HandoffService`;
- order and reservation mutations from `CommerceService`.

## Conversation and Context

The engine represents interpretation as a closed object containing `intent`, `entities`, `confidence`, and `source`. Initial supported intents cover greeting, product search, comparison, availability, size, fabric, personalization, policy, checkout guidance, human handoff, and unknown.

Conversation state stores structured values rather than generated prose:

- `activeProductId`;
- `candidateProductIds`;
- `lastIntent`;
- channel-safe timestamps.

Ambiguous references after multiple products trigger clarification instead of silently selecting the first product. Compound messages may produce multiple read-only intents, but any write action remains singular and explicitly confirmed.

## Optional Hybrid Intelligence

The default mode remains local and deterministic. When explicitly enabled, an `IntentProvider` may call an OpenAI-compatible endpoint using built-in `fetch`. Its only responsibility is to normalize intent and entities into the closed schema.

The provider:

- receives redacted, size-limited text and a minimal list of allowed intents;
- has no tools and no access to mutable inventory, orders, files, secrets, or admin APIs;
- uses a strict timeout and circuit breaker;
- rejects unknown fields, invented actions, URLs, prices, stock, or policies;
- falls back to the local router on timeout, transport failure, malformed JSON, low confidence, or schema violation;
- is disabled unless all required configuration is present.

The final response remains deterministic and grounded. The provider may improve classification and phrasing but never supplies commercial facts.

## Policy and Handoff Consistency

`PolicyRegistry` becomes the only source for hours, delivery, exchanges, payments, address, care, and support limitations. Existing FAQ and channel responses consume this registry, eliminating conflicting statements.

`HandoffService` returns a typed `human_request` action and an official WhatsApp URL containing a recognized, non-PII handoff marker. The WhatsApp bot must interpret that marker as `handoff: true`, and notification must be idempotent.

Frontend fallback responses are neutral: they may report temporary unavailability, retain navigation, and offer official handoff, but may not assert product technology, care, policy, delivery, or stock facts.

## Security and Privacy

- Production startup requires `VERIFY_TOKEN`, `META_APP_SECRET`, `WHATSAPP_TOKEN`, `PHONE_NUMBER_ID`, and a distinct handoff signing secret.
- Production never logs message bodies, complete phone numbers, tokens, names, addresses, or credentials.
- Demo inventory seeding is forbidden in production; startup requires provisioned, valid inventory.
- Waitlist/referral reads and sale mutations require explicit admin authorization or are disabled when not needed.
- Public responses never expose waitlist/referral records containing PII.
- PII redaction occurs before provider calls, event recording, and diagnostic logging.
- Abandoned WhatsApp checkout sessions expire and remove temporary personal data according to a documented retention constant.
- Privacy documentation describes actual data categories, purposes, retention, deletion/contact flow, and vendors that must be configured before launch.

## Reliable Meta Webhook Processing

A repository-backed inbox/outbox abstraction provides single-instance durability without pretending to support horizontal scaling.

Inbox states are `received`, `processing`, `completed`, `retry`, and `dead_letter`. The server validates the raw-body signature, event type, subscribed field, and configured `phone_number_id`, then durably records each message ID before returning success. Batch messages are claimed and processed independently.

Outbox effects use idempotency keys. Meta sends use bounded response reads, timeout, exponential backoff with jitter, `Retry-After` support, and classification of transient versus permanent failures. The application exposes retry/dead-letter status through redacted operational data, not customer-facing records.

Delivery semantics are at-least-once with idempotent effects. PostgreSQL inbox/outbox can replace the JSON repository later through the same interface.

## Observability and Health

Structured JSON events include request ID, hashed message/principal identifier, channel, intent, result, latency, catalog revision, policy version, handoff state, provider state, and retry outcome. They never include raw messages or PII.

`/live` reports process liveness. `/ready` fails when mandatory production configuration, durable stores, catalog, or Meta readiness is unavailable. Existing `/health` remains compatible while delegating to the new health model.

## Frontend and Admin Improvements

- Remove the dormant premium browser script from publication until rewritten safely; no reachable `innerHTML` sinks or inline handlers remain.
- Add an inventory request timeout, a single in-flight refresh, cancellation, visibility-aware polling, revision-aware rendering, and failure backoff.
- Prevent duplicate async form submissions and expose `aria-busy` consistently.
- Neutralize spreadsheet formula prefixes in CSV exports.
- Add accessible dialog names, live error regions, named close controls, reduced-motion support, and usable compact navigation.
- Add a neutral `noscript` message and keep optional components from aborting core initialization.
- Keep native ES modules and CSS; do not introduce a framework or bundler.

## Testing Strategy

All behavior changes follow red-green-refactor cycles.

Unit and integration coverage includes:

- shared policy parity across web and WhatsApp;
- typed and idempotent human handoff;
- available-variant parity and strictly read-only informational queries;
- compound intent and product disambiguation;
- provider schema rejection, PII redaction, timeout, circuit breaking, and local fallback;
- production configuration and seed prohibition;
- waitlist/referral authorization and redaction;
- durable webhook claim, crash recovery, duplicate delivery, batch isolation, retry, and dead-letter behavior;
- Meta client timeout, 429/5xx retry, permanent 4xx handling, and correlation IDs;
- liveness/readiness and structured redacted events;
- inventory polling, duplicate submit, CSV injection, and accessibility helpers.

Browser smoke tests cover storefront, assistant, simulator, and inventory on desktop/mobile; local resources must return 200 with correct MIME, console errors must be empty, and axe must report no critical or serious violations in the tested surfaces.

The existing 95 tests remain green throughout.

## Delivery Sequence

1. Establish shared policy, catalog read model, and safe handoff contracts.
2. Introduce the shared conversation engine and migrate both channel adapters.
3. Add the optional, isolated intent provider and security tests.
4. Close configuration, premium-route, seed, PII, and retention blockers.
5. Implement durable webhook inbox/outbox and resilient Meta client behavior.
6. Harden the frontend/admin surfaces and add browser coverage.
7. Add health, observability, documentation, and final cross-channel acceptance tests.

Each stage must be independently testable and reviewed before the next begins.

