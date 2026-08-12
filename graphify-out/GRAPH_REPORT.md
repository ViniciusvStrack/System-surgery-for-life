# Graph Report - .  (2026-08-11)

## Corpus Check
- 77 files · ~97,801 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 689 nodes · 1504 edges · 48 communities (40 shown, 8 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 80 edges (avg confidence: 0.76)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Inventory Admin API
- Customer OAuth Authentication
- Admin Authentication
- Commerce Reservations
- Storefront Application
- Product Configuration UI
- Product and Operations Docs
- Inventory Aggregation
- Store Assistant Answers
- Cart Checkout UI
- Node Project Metadata
- HTTP Server Routing
- Assistant Text Safety
- Product Catalog
- Storefront Data Loading
- WhatsApp Store Bot
- Assistant Chat UI
- Local Customer Auth
- Configuration and Security
- Premium Product Features
- Referrals and Waitlist
- HTTP Request Security
- Premium Storefront UI
- WhatsApp Simulator UI
- Cart Session State
- PWA Manifest
- WhatsApp API Integration
- Demo Memory Store
- Low Stock Alerts
- Scrub Product Photography
- Medical Coat Photography
- Fabric Product Detail
- Clinical Hero Imagery
- Scrub Catalog Views
- Runtime Backup
- JSON Persistence
- Brand Monogram Design
- Brand Icon Design
- Coat Rear Detail
- White Fabric Detail
- Bot Memory Store
- Demo Persistence Store
- Test Memory Store
- Deployment Configuration
- Horizontal Brand Logo
- Stacked Brand Logo
- CI and Contribution
- Inventory UI Evolution

## God Nodes (most connected - your core abstractions)
1. `handleRequest()` - 56 edges
2. `cleanText()` - 25 edges
3. `AuthService` - 23 edges
4. `element()` - 22 edges
5. `Catalog` - 22 edges
6. `normalize()` - 22 edges
7. `StoreAssistant` - 21 edges
8. `CustomerAuthService` - 19 edges
9. `InventoryService` - 18 edges
10. `openConfigurator()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `Security policy` --semantically_similar_to--> `Brazil production rollout`  [INFERRED] [semantically similar]
  SECURITY.md → docs/implantacao-producao.md
- `Server-validated reservation flow` --semantically_similar_to--> `Website checkout and WhatsApp continuity`  [INFERRED] [semantically similar]
  public/loja/termos.html → docs/checkout-whatsapp.md
- `Legacy standalone inventory panel` --semantically_similar_to--> `Professional inventory panel page`  [INFERRED] [semantically similar]
  legacy/estoque-v2-standalone.html → public/estoque/index.html
- `WhatsApp conversation simulator page` --implements--> `WhatsApp store chatbot`  [INFERRED]
  public/index.html → README.md
- `setup()` --calls--> `hashPrincipal()`  [EXTRACTED]
  tests/commerce.test.js → src/commerce.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **WhatsApp commerce flow** — readme_whatsapp_store_chatbot, docs_checkout_whatsapp_checkout_handoff, docs_integracao_whatsapp_official_whatsapp_integration, public_index_whatsapp_simulator_page, public_loja_index_storefront_page [INFERRED 0.95]
- **Identity and data protection model** — security_security_policy, docs_autenticacao_admin_authentication, docs_login_google_google_customer_login, public_loja_privacidade_privacy_policy [INFERRED 0.85]
- **Camaragibe operating model** — docs_custos_operacao_operational_costs, docs_logistica_camaragibe_camaragibe_logistics, docs_rotina_operacao_junior_junior_operations_routine [INFERRED 0.85]

## Communities (48 total, 8 thin omitted)

### Community 0 - "Inventory Admin API"
Cohesion: 0.08
Nodes (42): InventoryApi, normalizeSnapshot(), safeCount(), safeText(), sanitizeOrder(), api, applySnapshot(), beginTwoFactorSetup() (+34 more)

### Community 1 - "Customer OAuth Authentication"
Cohesion: 0.10
Nodes (23): abortable(), absoluteUrl(), base64url(), boundedInteger(), cacheMaxAge(), CustomerAuthService, decodeJwtPart(), fetchJson() (+15 more)

### Community 2 - "Admin Authentication"
Cohesion: 0.14
Nodes (10): AuthService, base32Decode(), base32Encode(), hashPassword(), now(), ROLES, sha256(), totp() (+2 more)

### Community 3 - "Commerce Reservations"
Cohesion: 0.14
Nodes (14): buildWhatsAppUrl(), canonicalChoice(), cleanText(), commerceError(), CommerceService, hashPrincipal(), normalizeItem(), normalizePayload() (+6 more)

### Community 4 - "Storefront Application"
Cohesion: 0.10
Nodes (24): ASSISTANT_DEFAULT_SUGGESTIONS, assistantFallback(), COLOR_TONE_CLASSES, COLOR_TONES, CONFIG_STEPS, defaultProductImage(), dialogFocus, dom (+16 more)

### Community 5 - "Product Configuration UI"
Cohesion: 0.14
Nodes (27): applyColorTone(), availableQuantity(), colorTone(), configStepValid(), createProductCard(), createQuantityStepper(), createTextField(), element() (+19 more)

### Community 6 - "Product and Operations Docs"
Cohesion: 0.09
Nodes (25): Bounded assistant knowledge, Local read-only virtual store assistant, Administrative panel authentication, Admin stock and support roles, Client presentation checklist, Website checkout and WhatsApp continuity, Signed WhatsApp handoff, Camaragibe operational costs (+17 more)

### Community 7 - "Inventory Aggregation"
Cohesion: 0.18
Nodes (8): cents(), EMPTY_AGGREGATE, inventoryError(), InventoryService, normalizeAggregate(), publicOrder(), createInventory(), MemoryStore

### Community 8 - "Store Assistant Answers"
Cohesion: 0.21
Nodes (7): availableSizes(), publicProduct(), redactSensitive(), requestedBudget(), requestedSize(), safeNumber(), StoreAssistant

### Community 9 - "Cart Checkout UI"
Cohesion: 0.16
Nodes (23): bumpCartCount(), cartItemCount(), closeDialog(), closeMobileMenu(), createCartItem(), editProductViewerItem(), handleCheckout(), handleLoginQuery() (+15 more)

### Community 10 - "Node Project Metadata"
Cohesion: 0.09
Nodes (21): dependencies, qrcode, description, devDependencies, prettier, engines, node, license (+13 more)

### Community 11 - "HTTP Server Routing"
Cohesion: 0.09
Nodes (21): assistantConversationRateLimiter, assistantIpRateLimiter, auth, authRateLimiter, bot, catalog, commerce, config (+13 more)

### Community 12 - "Assistant Text Safety"
Cohesion: 0.16
Nodes (14): cleanText(), compactReply(), containsSensitiveData(), editDistance(), hasAny(), INJECTION_PATTERNS, parseAssistantPayload(), SENSITIVE_PATTERNS (+6 more)

### Community 13 - "Product Catalog"
Cohesion: 0.15
Nodes (4): Catalog, slug(), unique(), catalog

### Community 14 - "Storefront Data Loading"
Cohesion: 0.20
Nodes (19): assistantResponseError(), assistantRetryDelay(), checkoutErrorMessage(), checkoutPayload(), cleanText(), firstName(), initials(), loadCatalog() (+11 more)

### Community 15 - "WhatsApp Store Bot"
Cohesion: 0.20
Nodes (8): conversationalIntent(), hasAny(), matches(), NUMBER_WORDS, requestedQuantity(), StoreBot, money(), add()

### Community 16 - "Assistant Chat UI"
Cohesion: 0.19
Nodes (18): addAssistantHistory(), appendAssistantMessage(), assistantText(), cleanMultiline(), closeAssistant(), createAssistantAction(), createAssistantConversationId(), createAssistantMessage() (+10 more)

### Community 17 - "Local Customer Auth"
Cohesion: 0.20
Nodes (4): LocalCustomerAuthService, now(), passwordHash(), verifyPassword()

### Community 18 - "Configuration and Security"
Cohesion: 0.16
Nodes (6): getConfig(), loadEnv(), root, validateConfig(), SlidingWindowRateLimiter, WebhookDeduplicator

### Community 19 - "Premium Product Features"
Cohesion: 0.21
Nodes (14): buildKit(), calculateKitDiscount(), createReverseLabel(), estimateDelivery(), generateCareQrData(), generateEmbroideryPreview(), generatePushPayload(), generateReorderQrData() (+6 more)

### Community 21 - "HTTP Request Security"
Cohesion: 0.19
Nodes (15): handleRequest(), hasJsonContentType(), isAdmin(), loginErrorLocation(), orderForStore(), orderPrincipal(), readBody(), redirect() (+7 more)

### Community 22 - "Premium Storefront UI"
Cohesion: 0.18
Nodes (4): initAdminPush(), initKitBuilder(), kitItems, showToast()

### Community 23 - "WhatsApp Simulator UI"
Cohesion: 0.31
Nodes (9): addMessage(), form, input, messages, scrollDown(), sendButton, showTyping(), talk() (+1 more)

### Community 24 - "Cart Session State"
Cohesion: 0.24
Nodes (10): cartFingerprint(), checkoutIntentKey(), createId(), inventoryLimit(), normalizeCartItem(), readCart(), readCheckoutIntent(), reconcileCartWithCatalog() (+2 more)

### Community 25 - "PWA Manifest"
Cohesion: 0.22
Nodes (8): background_color, description, display, icons, name, short_name, start_url, theme_color

### Community 26 - "WhatsApp API Integration"
Cohesion: 0.33
Nodes (3): extractMessages(), verifySignature(), WhatsAppClient

### Community 27 - "Demo Memory Store"
Cohesion: 0.29
Nodes (3): bot, MemoryStore, root

### Community 29 - "Scrub Product Photography"
Cohesion: 0.33
Nodes (6): Drawstring cargo scrub pants, Navy scrub set displayed on mannequin, Medical scrubs, Navy short-sleeved uniform, V-neck scrub top with pockets, White sneakers

### Community 30 - "Medical Coat Photography"
Cohesion: 0.40
Nodes (5): White professional coat on dress form, Garment displayed on a dress form, Medical professional uniform, Navy contrast piping, White long-sleeved coat

### Community 31 - "Fabric Product Detail"
Cohesion: 0.40
Nodes (5): Electric blue fabric edge, Folded textile layers, Close-up of dark woven fabric, Dark navy woven textile, Technical apparel material

### Community 32 - "Clinical Hero Imagery"
Cohesion: 0.50
Nodes (5): Healthcare professional, Healthcare professional wearing navy scrubs in a modern clinical interior, Modern clinical interior, Navy medical scrubs, Professional medical apparel

### Community 33 - "Scrub Catalog Views"
Cohesion: 0.50
Nodes (5): Blue medical scrub set, Front garment view, Front and rear views of blue medical scrubs on mannequins, Professional medical apparel, Rear garment view

### Community 34 - "Runtime Backup"
Cohesion: 0.40
Nodes (4): destination, root, runtime, timestamp

### Community 36 - "Brand Monogram Design"
Cohesion: 0.50
Nodes (4): SFL logo monogram, Navy, ivory, and cream color palette, High-contrast serif typography, Interlocking SFL initials

### Community 37 - "Brand Icon Design"
Cohesion: 0.50
Nodes (4): SFL monogram logo, Navy, ivory, and cream color palette, High-contrast serif typography, Interlocking SFL initials

### Community 38 - "Coat Rear Detail"
Cohesion: 0.50
Nodes (4): Dress form mannequin, Rear view of white professional coat on dress form, Tailored medical apparel, White professional coat

### Community 39 - "White Fabric Detail"
Cohesion: 0.83
Nodes (4): Macro view of white woven fabric with navy piping, Navy piping trim, Tailored garment detail, White woven textile

### Community 43 - "Deployment Configuration"
Cohesion: 0.67
Nodes (3): Production application container, Persistent surgery runtime volume, Environment variable reference

### Community 44 - "Horizontal Brand Logo"
Cohesion: 1.00
Nodes (3): Surgery for Life horizontal brand logo, SFL monogram, Surgery for Life

### Community 45 - "Stacked Brand Logo"
Cohesion: 1.00
Nodes (3): Surgery for Life stacked brand logo, SFL monogram, Surgery for Life

## Knowledge Gaps
- **121 isolated node(s):** `name`, `version`, `private`, `type`, `description` (+116 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `handleRequest()` connect `HTTP Request Security` to `Admin Authentication`, `Commerce Reservations`, `JSON Persistence`, `Inventory Aggregation`, `HTTP Server Routing`, `Assistant Text Safety`, `WhatsApp Store Bot`, `Local Customer Auth`, `Configuration and Security`, `Premium Product Features`, `WhatsApp API Integration`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Why does `Catalog` connect `Product Catalog` to `Commerce Reservations`, `Inventory Aggregation`, `HTTP Server Routing`, `Assistant Text Safety`, `WhatsApp Store Bot`, `Demo Memory Store`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `CustomerAuthService` connect `Customer OAuth Authentication` to `HTTP Server Routing`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Are the 28 inferred relationships involving `handleRequest()` (e.g. with `.audit()` and `.authorize()`) actually correct?**
  _`handleRequest()` has 28 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _121 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Inventory Admin API` be split into smaller, more focused modules?**
  _Cohesion score 0.08299240210403273 - nodes in this community are weakly interconnected._
- **Should `Customer OAuth Authentication` be split into smaller, more focused modules?**
  _Cohesion score 0.09608843537414966 - nodes in this community are weakly interconnected._