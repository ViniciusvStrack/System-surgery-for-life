const CART_STORAGE_KEY = "sfl-store-cart-v1";
const CHECKOUT_INTENT_KEY = "sfl-store-checkout-intent-v1";
const LAST_ORDER_KEY = "sfl-store-last-order-v1";
const CART_TTL_MS = 24 * 60 * 60 * 1000;
const CATALOG_PAGE_SIZE = 6;
const MAX_CART_LINES = 20;
const MAX_ORDER_UNITS = 50;
const COLOR_TONES = new Map([
  ["#10264f", "tone-navy"],
  ["#1747d1", "tone-cobalt"],
  ["#313845", "tone-graphite"],
  ["#40665d", "tone-mineral"],
  ["#673241", "tone-wine"],
  ["#b9ad9d", "tone-sand"],
  ["#d8d0c3", "tone-clinical-sand"],
  ["#f4f2eb", "tone-optical-white"],
  ["#17384d", "tone-clinical-navy"],
  ["#8aabb2", "tone-mist"],
  ["#d8d2c8", "tone-warm-sand"],
  ["#f4f3ed", "tone-soft-white"],
  ["#dbe9ed", "tone-ice"],
  ["#183c54", "tone-classic-navy"],
  ["#f5f4ef", "tone-default"],
]);
const COLOR_TONE_CLASSES = [...new Set(COLOR_TONES.values())];
const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const reduceMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;
let authRefreshSequence = 0;

const dom = {
  header: document.querySelector("[data-header]"),
  menuToggle: document.querySelector("[data-menu-toggle]"),
  mobileMenu: document.querySelector("[data-mobile-menu]"),
  productGrid: document.querySelector("[data-product-grid]"),
  catalogStatus: document.querySelector("[data-catalog-status]"),
  catalogCount: document.querySelector("[data-catalog-count]"),
  productSearch: document.querySelector("[data-product-search]"),
  productSort: document.querySelector("[data-product-sort]"),
  loadMore: document.querySelector("[data-load-more]"),
  filterButtons: [...document.querySelectorAll("[data-filter]")],
  filterLinks: [...document.querySelectorAll("[data-filter-link]")],
  configurator: document.querySelector("[data-configurator]"),
  configBack: document.querySelector("[data-config-back]"),
  configClose: document.querySelector("[data-close-config]"),
  configStepCurrent: document.querySelector("[data-config-step-current]"),
  configStepTotal: document.querySelector("[data-config-step-total]"),
  configStepName: document.querySelector("[data-config-step-name]"),
  configProgress: document.querySelector("[data-config-progress]"),
  configTitle: document.querySelector("[data-config-title]"),
  configDescription: document.querySelector("[data-config-description]"),
  configOptions: document.querySelector("[data-config-options]"),
  configPrice: document.querySelector("[data-config-price]"),
  configNext: document.querySelector("[data-config-next]"),
  configImage: document.querySelector("[data-config-image]"),
  configPreview: document.querySelector("[data-product-preview]"),
  configCode: document.querySelector("[data-config-code]"),
  configColorName: document.querySelector("[data-config-color-name]"),
  embroideryPreview: document.querySelector("[data-embroidery-preview]"),
  cartDialog: document.querySelector("[data-cart-dialog]"),
  cartContent: document.querySelector("[data-cart-content]"),
  cartFooter: document.querySelector("[data-cart-footer]"),
  cartSubtotal: document.querySelector("[data-cart-subtotal]"),
  cartHeadingCount: document.querySelector("[data-cart-heading-count]"),
  cartCounts: [...document.querySelectorAll("[data-cart-count]")],
  cartActions: [...document.querySelectorAll("[data-open-cart]")],
  cartCloseActions: [...document.querySelectorAll("[data-close-cart]")],
  cartCheckout: document.querySelector("[data-cart-checkout]"),
  cartValidation: document.querySelector("[data-cart-validation]"),
  checkoutDialog: document.querySelector("[data-checkout-dialog]"),
  checkoutClose: document.querySelector("[data-close-checkout]"),
  checkoutReview: document.querySelector("[data-checkout-review]"),
  checkoutSuccess: document.querySelector("[data-checkout-success]"),
  checkoutItems: document.querySelector("[data-checkout-items]"),
  checkoutTotal: document.querySelector("[data-checkout-total]"),
  checkoutAccount: document.querySelector("[data-checkout-account]"),
  checkoutConfirm: document.querySelector("[data-checkout-confirm]"),
  checkoutStatus: document.querySelector("[data-checkout-status]"),
  orderCode: document.querySelector("[data-order-code]"),
  orderExpiry: document.querySelector("[data-order-expiry]"),
  orderWhatsapp: document.querySelector("[data-order-whatsapp]"),
  copyOrder: document.querySelector("[data-copy-order]"),
  authDialog: document.querySelector("[data-auth-dialog]"),
  authActions: [...document.querySelectorAll("[data-open-auth]")],
  authClose: document.querySelector("[data-close-auth]"),
  authSignedOut: document.querySelector("[data-auth-signed-out]"),
  authSignedIn: document.querySelector("[data-auth-signed-in]"),
  authName: document.querySelector("[data-auth-name]"),
  authEmail: document.querySelector("[data-auth-email]"),
  authFullName: document.querySelector("[data-auth-full-name]"),
  authInitials: document.querySelector("[data-auth-initials]"),
  authStatus: document.querySelector("[data-auth-status]"),
  accountLabels: [...document.querySelectorAll("[data-account-label]")],
  logout: document.querySelector("[data-auth-logout]"),
  googleLogin: document.querySelector("[data-google-login]"),
  toastRegion: document.querySelector("[data-toast-region]"),
  sizeGuide: document.querySelector("[data-size-guide]"),
  careGuide: document.querySelector("[data-care-guide]"),
  sizeGuideActions: [...document.querySelectorAll("[data-open-size-guide]")],
  careGuideActions: [...document.querySelectorAll("[data-open-care-guide]")],
  infoCloseActions: [...document.querySelectorAll("[data-close-info]")],
  whatsappActions: [...document.querySelectorAll("[data-whatsapp-contact]")],
};

const state = {
  catalog: [],
  catalogLoading: true,
  catalogError: "",
  filter: "todos",
  search: "",
  sort: "featured",
  visibleProducts: CATALOG_PAGE_SIZE,
  cart: readCart(),
  config: null,
  auth: { checked: false, user: null, csrf: "", googleAvailable: true },
  storeConfig: {
    loaded: false,
    whatsappAvailable: false,
    whatsappUrl: "",
    reservationTtlMinutes: 30,
    guestCheckout: true,
  },
  checkout: {
    submitting: false,
    order: null,
    whatsappUrl: "",
    idempotencyKey: "",
    fingerprint: "",
  },
};

const CONFIG_STEPS = [
  {
    name: "Modelo",
    title: "Escolha seu modelo.",
    description: "Selecione o caimento que melhor acompanha a sua rotina.",
  },
  {
    name: "Cor",
    title: "Defina a sua cor.",
    description:
      "Uma paleta essencial, pensada para diferentes ambientes profissionais.",
  },
  {
    name: "Tamanho",
    title: "Encontre seu tamanho.",
    description:
      "Escolha o tamanho habitual. Consulte as medidas antes de finalizar se estiver em dúvida.",
  },
  {
    name: "Personalização",
    title: "Deixe a sua assinatura.",
    description:
      "Nome e profissão são opcionais. Você também pode manter a peça sem identificação.",
  },
  {
    name: "Resumo",
    title: "Sua peça, do seu jeito.",
    description:
      "Revise cada escolha e defina a quantidade antes de adicionar à sacola.",
  },
];

function element(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.type) node.type = options.type;
  if (options.attrs) {
    Object.entries(options.attrs).forEach(([name, value]) => {
      if (value !== undefined && value !== null)
        node.setAttribute(name, String(value));
    });
  }
  const list = Array.isArray(children) ? children : [children];
  list.filter(Boolean).forEach((child) => node.append(child));
  return node;
}

function iconPath(pathValue, viewBox = "0 0 24 24") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathValue);
  svg.append(path);
  return svg;
}

function cleanText(value, maxLength = 180) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanMultiline(value, maxLength = 180) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .slice(0, maxLength);
}

function safeNumber(value, fallback = 0, max = 1_000_000) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= max
    ? parsed
    : fallback;
}

function safeColor(value, fallback = "#f5f4ef") {
  const candidate = String(value ?? "").trim();
  return /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(candidate)
    ? candidate
    : fallback;
}

function colorTone(value) {
  return COLOR_TONES.get(safeColor(value).toLowerCase()) || "tone-default";
}

function applyColorTone(node, value) {
  node.classList.remove(...COLOR_TONE_CLASSES);
  node.classList.add("color-tone", colorTone(value));
}

function safeImage(value, category) {
  const candidate = cleanText(value, 160);
  if (
    /^\/assets\/[a-z0-9][a-z0-9._/-]*\.(?:png|jpe?g|webp|avif)$/i.test(
      candidate,
    ) &&
    !candidate.includes("..")
  )
    return candidate;
  return category === "scrub"
    ? "/assets/sfl-scrub.jpg"
    : "/assets/sfl-coat.jpg";
}

function uniqueStrings(values, maxItems = 12, maxLength = 50) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const result = [];
  values.forEach((value) => {
    const clean = cleanText(value, maxLength);
    const key = clean.toLocaleLowerCase("pt-BR");
    if (clean && !seen.has(key) && result.length < maxItems) {
      seen.add(key);
      result.push(clean);
    }
  });
  return result;
}

function searchKey(value) {
  return cleanText(value, 400)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function inferCategory(product) {
  const source = searchKey(
    [
      product.category,
      product.name,
      product.id,
      product.slug,
      ...(product.keywords || []),
    ].join(" "),
  );
  if (source.includes("scrub") || source.includes("pijama")) return "scrub";
  return "jaleco";
}

function normalizeProduct(raw, index) {
  const source = raw && typeof raw === "object" ? raw : {};
  const category = inferCategory(source);
  const id =
    cleanText(source.id || source.slug || `SFL-${index + 1}`, 64) ||
    `SFL-${index + 1}`;
  const name =
    cleanText(source.name, 100) ||
    (category === "scrub"
      ? "Scrub Surgery For Life"
      : "Jaleco Surgery For Life");
  const colors = Array.isArray(source.colors)
    ? source.colors.slice(0, 10).map((entry, colorIndex) => {
        const color = entry && typeof entry === "object" ? entry : {};
        const defaults =
          category === "scrub"
            ? ["#17384d", "#8aabb2", "#d8d2c8"]
            : ["#f4f3ed", "#dbe9ed", "#183c54"];
        return {
          name: cleanText(color.name, 40) || `Cor ${colorIndex + 1}`,
          value: safeColor(color.value, defaults[colorIndex % defaults.length]),
        };
      })
    : [];
  const defaultColors =
    category === "scrub"
      ? [
          { name: "Azul profundo", value: "#17384d" },
          { name: "Azul névoa", value: "#8aabb2" },
          { name: "Areia", value: "#d8d2c8" },
        ]
      : [
          { name: "Branco ótico", value: "#f4f3ed" },
          { name: "Azul gelo", value: "#dbe9ed" },
          { name: "Navy", value: "#183c54" },
        ];
  const variants = uniqueStrings(source.variants, 14, 12);
  const fits = uniqueStrings(source.fits, 6, 40);
  const variantStock = {};
  if (
    source.variantStock &&
    typeof source.variantStock === "object" &&
    !Array.isArray(source.variantStock)
  ) {
    Object.entries(source.variantStock).forEach(([variant, stock]) => {
      const key = cleanText(variant, 12);
      if (key) variantStock[key] = Math.floor(safeNumber(stock, 0, 100_000));
    });
  }
  const variantIds = {};
  if (
    source.variantIds &&
    typeof source.variantIds === "object" &&
    !Array.isArray(source.variantIds)
  ) {
    Object.entries(source.variantIds).forEach(([variant, identifier]) => {
      const key = cleanText(variant, 12);
      const id = cleanText(identifier, 96);
      if (key && id) variantIds[key] = id;
    });
  }
  const variantOptions = Array.isArray(source.variantOptions)
    ? source.variantOptions
        .slice(0, 30)
        .map((entry) => ({
          id: cleanText(entry?.id || entry?.variantId, 96),
          size: cleanText(entry?.size || entry?.variant, 12),
          stock: Math.floor(safeNumber(entry?.stock, 0, 100_000)),
        }))
        .filter((entry) => entry.id && entry.size)
    : [];
  variantOptions.forEach((entry) => {
    variantIds[entry.size] = entry.id;
    variantStock[entry.size] = entry.stock;
  });
  return {
    id,
    slug: cleanText(source.slug, 80),
    name,
    description:
      cleanText(source.description, 300) ||
      "Modelagem funcional, toque confortável e acabamento preciso para acompanhar sua rotina.",
    category,
    categoryLabel: category === "scrub" ? "Scrub" : "Jaleco",
    price: safeNumber(source.price, 0, 100_000),
    stock: Math.floor(safeNumber(source.stock, 0, 100_000)),
    badge: cleanText(source.badge, 28),
    image: safeImage(source.image, category),
    colors: colors.length ? colors : defaultColors,
    fits: fits.length
      ? fits
      : category === "scrub"
        ? ["Clássico", "Relaxed"]
        : ["Clássico", "Slim"],
    features: uniqueStrings(source.features, 8, 100),
    variants: variants.length ? variants : ["PP", "P", "M", "G", "GG"],
    variantStock,
    variantIds,
    variantOptions,
    hasVariantStock: Object.keys(variantStock).length > 0,
    laserCut: Boolean(source.laserCut),
    personalizable: source.personalizable !== false,
    keywords: uniqueStrings(source.keywords, 20, 60),
    sourceIndex: index,
  };
}

function safeJson(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json"))
    throw new Error("Resposta inesperada do servidor.");
  return response.json();
}

function safeWhatsappUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (
      url.protocol !== "https:" ||
      !["wa.me", "api.whatsapp.com"].includes(url.hostname)
    )
      return "";
    return url.toString();
  } catch {
    return "";
  }
}

async function loadStoreConfig() {
  try {
    const response = await fetch("/api/store/config", {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    const data = await safeJson(response);
    if (!response.ok) throw new Error("Configuração indisponível.");
    const whatsappUrl = safeWhatsappUrl(data?.whatsappUrl);
    state.storeConfig = {
      loaded: true,
      whatsappAvailable: Boolean(data?.whatsappAvailable && whatsappUrl),
      whatsappUrl,
      reservationTtlMinutes: Math.max(
        5,
        Math.min(
          240,
          Math.floor(safeNumber(data?.reservationTtlMinutes, 30, 240)),
        ),
      ),
      guestCheckout: data?.guestCheckout !== false,
    };
  } catch {
    state.storeConfig = { ...state.storeConfig, loaded: true };
  }

  dom.whatsappActions.forEach((action) => {
    if (action.matches("a")) {
      action.hidden = !state.storeConfig.whatsappAvailable;
      if (state.storeConfig.whatsappAvailable)
        action.href = state.storeConfig.whatsappUrl;
    }
    action.toggleAttribute(
      "disabled",
      action.matches("button") && !state.storeConfig.whatsappAvailable,
    );
    action.setAttribute(
      "aria-disabled",
      String(!state.storeConfig.whatsappAvailable),
    );
  });
}

async function loadCatalog() {
  state.catalogLoading = true;
  state.catalogError = "";
  renderCatalog();
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch("/api/catalog", {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    const data = await safeJson(response);
    if (!response.ok)
      throw new Error(
        cleanText(data?.error, 120) || "Não foi possível carregar a coleção.",
      );
    if (!Array.isArray(data)) throw new Error("Formato de catálogo inválido.");
    const ids = new Set();
    state.catalog = data.map(normalizeProduct).filter((product) => {
      const key = product.id.toLocaleLowerCase("pt-BR");
      if (ids.has(key)) return false;
      ids.add(key);
      return true;
    });
  } catch (error) {
    state.catalog = [];
    state.catalogError =
      error?.name === "AbortError"
        ? "A coleção demorou mais que o esperado para responder."
        : "Não conseguimos carregar a coleção agora. Verifique sua conexão e tente novamente.";
  } finally {
    window.clearTimeout(timer);
    state.catalogLoading = false;
    state.visibleProducts = CATALOG_PAGE_SIZE;
    reconcileCartWithCatalog();
    renderCatalog();
    renderCart();
  }
}

function filteredProducts() {
  const query = searchKey(state.search);
  const products = state.catalog.filter((product) => {
    if (state.filter !== "todos" && product.category !== state.filter)
      return false;
    if (!query) return true;
    return searchKey(
      [
        product.name,
        product.description,
        product.categoryLabel,
        product.id,
        ...product.keywords,
      ].join(" "),
    ).includes(query);
  });
  return products.sort((left, right) => {
    if (state.sort === "price-asc") return left.price - right.price;
    if (state.sort === "price-desc") return right.price - left.price;
    if (state.sort === "name")
      return left.name.localeCompare(right.name, "pt-BR");
    return left.sourceIndex - right.sourceIndex;
  });
}

function renderCatalog() {
  dom.productGrid.replaceChildren();
  dom.productGrid.setAttribute("aria-busy", String(state.catalogLoading));
  dom.catalogStatus.replaceChildren();

  if (state.catalogLoading) {
    dom.catalogCount.textContent = "Carregando coleção…";
    for (let index = 0; index < 3; index += 1) {
      dom.productGrid.append(
        element(
          "div",
          { className: "product-skeleton", attrs: { "aria-hidden": "true" } },
          [element("span"), element("i"), element("i")],
        ),
      );
    }
    dom.loadMore.hidden = true;
    return;
  }

  if (state.catalogError) {
    dom.catalogCount.textContent = "Coleção indisponível";
    const empty = element("div", { className: "product-empty" });
    const content = element("div");
    content.append(
      element("strong", { text: "A coleção está ajustando os detalhes." }),
      element("p", { text: state.catalogError }),
    );
    const retry = element("button", {
      className: "button button-secondary catalog-retry",
      text: "Tentar novamente",
      type: "button",
    });
    retry.addEventListener("click", loadCatalog);
    content.append(retry);
    empty.append(content);
    dom.productGrid.append(empty);
    dom.loadMore.hidden = true;
    return;
  }

  const products = filteredProducts();
  dom.catalogCount.textContent = `${products.length} ${products.length === 1 ? "peça encontrada" : "peças encontradas"}`;
  const visible = products.slice(0, state.visibleProducts);
  if (!visible.length) {
    const empty = element("div", { className: "product-empty" });
    empty.append(
      element("strong", { text: "Nenhuma peça por aqui." }),
      element("p", {
        text: "Experimente outro termo ou escolha uma categoria diferente.",
      }),
    );
    dom.productGrid.append(empty);
  } else {
    visible.forEach((product) =>
      dom.productGrid.append(createProductCard(product)),
    );
  }
  dom.loadMore.hidden = visible.length >= products.length;
}

function createProductCard(product) {
  const card = element("article", { className: "product-card" });
  const button = element("button", {
    className: "product-card-button",
    type: "button",
    attrs: {
      "aria-label": `${product.name}, ${money.format(product.price)}. Personalizar produto.`,
    },
  });
  if (product.stock <= 0) {
    button.disabled = true;
    button.setAttribute(
      "aria-label",
      `${product.name}, indisponível no momento.`,
    );
  }

  const imageShell = element("div", {
    className: `product-image image-fallback${product.category === "scrub" ? " is-dark" : ""}`,
    attrs: {
      "data-fallback": `${product.categoryLabel.toUpperCase()} / ${product.id}`,
    },
  });
  const image = element("img", {
    attrs: {
      src: product.image,
      alt: product.name,
      loading: "lazy",
      decoding: "async",
    },
  });
  image.addEventListener(
    "error",
    () => imageShell.classList.add("has-image-error"),
    { once: true },
  );
  imageShell.append(image);
  const badgeText =
    product.stock <= 0
      ? "Indisponível"
      : product.badge ||
        (product.laserCut ? "Corte de precisão" : "SFL Essential");
  imageShell.append(
    element("span", { className: "product-badge", text: badgeText }),
  );
  if (product.stock > 0) {
    imageShell.append(
      element("span", { className: "product-quick-view" }, [
        element("span", { text: "Personalizar" }),
        element("span", { text: "↗", attrs: { "aria-hidden": "true" } }),
      ]),
    );
  }

  const info = element("div", { className: "product-info" });
  const titleWrap = element("div");
  titleWrap.append(
    element("p", {
      className: "product-meta",
      text: `${product.categoryLabel} · ${product.id}`,
    }),
    element("h3", { text: product.name }),
  );
  const topline = element("div", { className: "product-topline" }, [
    titleWrap,
    element("span", {
      className: "product-price",
      text: money.format(product.price),
    }),
  ]);
  const colors = element("div", {
    className: "product-colors",
    attrs: { "aria-label": `${product.colors.length} cores disponíveis` },
  });
  product.colors.slice(0, 5).forEach((color) => {
    const dot = element("i", {
      className: `color-tone ${colorTone(color.value)}`,
      attrs: { title: color.name, "aria-hidden": "true" },
    });
    colors.append(dot);
  });
  info.append(
    topline,
    element("p", {
      className: "product-description",
      text: product.description,
    }),
    element("p", {
      className: "product-availability",
      text:
        product.stock > 0
          ? `${product.variants.filter((variant) => !product.hasVariantStock || safeNumber(product.variantStock[variant], 0) > 0).length} tamanhos disponíveis · estoque conectado`
          : "Temporariamente indisponível",
    }),
    colors,
  );
  button.append(imageShell, info);
  button.addEventListener("click", () => openConfigurator(product));
  card.append(button);
  return card;
}

function setFilter(filter) {
  const allowed = new Set(["todos", "jaleco", "scrub"]);
  state.filter = allowed.has(filter) ? filter : "todos";
  state.visibleProducts = CATALOG_PAGE_SIZE;
  dom.filterButtons.forEach((button) => {
    const active = button.dataset.filter === state.filter;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  renderCatalog();
}

function inventoryLimit(product, variant) {
  const total = product.hasVariantStock
    ? safeNumber(product.variantStock[variant], 0, 100_000)
    : product.stock;
  return Math.max(0, Math.min(10, Math.floor(total || 0)));
}

function reservedQuantity(product, variant, excludeKey = "") {
  return state.cart.reduce((sum, item) => {
    if (
      item.key === excludeKey ||
      item.productId !== product.id ||
      item.unavailableReason
    )
      return sum;
    if (product.hasVariantStock && item.size !== variant) return sum;
    return sum + item.qty;
  }, 0);
}

function availableQuantity(product, variant, excludeKey = "") {
  return Math.max(
    0,
    inventoryLimit(product, variant) -
      reservedQuantity(product, variant, excludeKey),
  );
}

function sizeAvailable(product, variant, excludeKey = "") {
  return (
    product.stock > 0 && availableQuantity(product, variant, excludeKey) > 0
  );
}

function firstAvailableSize(product, excludeKey = "") {
  return (
    product.variants.find((variant) =>
      sizeAvailable(product, variant, excludeKey),
    ) || ""
  );
}

function openConfigurator(product, cartItem = null) {
  if (!product || product.stock <= 0) return;
  if (!cartItem && cartItemCount() >= MAX_ORDER_UNITS) {
    showToast(
      "Esta reserva já possui 50 unidades. Finalize o pedido atual antes de adicionar mais peças.",
    );
    return;
  }
  const availableSize =
    cartItem?.size &&
    product.variants.includes(cartItem.size) &&
    sizeAvailable(product, cartItem.size, cartItem.key)
      ? cartItem.size
      : firstAvailableSize(product, cartItem?.key || "");
  if (!availableSize) {
    showToast("O estoque disponível desta peça já está na sua sacola.");
    return;
  }
  const selectedColor = cartItem
    ? product.colors.find((color) => color.name === cartItem.color?.name) ||
      product.colors[0]
    : product.colors[0];
  state.config = {
    product,
    step: 0,
    model:
      cartItem?.model && product.fits.includes(cartItem.model)
        ? cartItem.model
        : product.fits[0],
    color: {
      name: cleanText(selectedColor.name, 40),
      value: safeColor(selectedColor.value),
    },
    size: availableSize,
    name: cleanText(cartItem?.personalization?.name, 28),
    profession: cleanText(cartItem?.personalization?.profession, 34),
    qty: Math.max(
      1,
      Math.min(
        availableQuantity(product, availableSize, cartItem?.key || ""),
        Math.floor(safeNumber(cartItem?.qty, 1, 10)),
      ),
    ),
    editKey: cartItem?.key || "",
  };
  updateConfigPreview();
  renderConfigStep();
  openDialog(dom.configurator, dom.configTitle);
}

function renderConfigStep() {
  const config = state.config;
  if (!config) return;
  const step = CONFIG_STEPS[config.step];
  dom.configStepCurrent.textContent = String(config.step + 1);
  dom.configStepTotal.textContent = String(CONFIG_STEPS.length);
  dom.configStepName.textContent = step.name;
  dom.configProgress.className = `progress-step-${config.step + 1}`;
  dom.configTitle.textContent = step.title;
  dom.configDescription.textContent = step.description;
  dom.configBack.hidden = config.step === 0;
  dom.configOptions.replaceChildren();
  dom.configOptions.removeAttribute("role");
  dom.configOptions.removeAttribute("aria-labelledby");
  if (config.step <= 2) {
    dom.configOptions.setAttribute("role", "radiogroup");
    dom.configOptions.setAttribute("aria-labelledby", "config-title");
  }

  if (config.step === 0) renderModelOptions(config);
  if (config.step === 1) renderColorOptions(config);
  if (config.step === 2) renderSizeOptions(config);
  if (config.step === 3) renderPersonalizationOptions(config);
  if (config.step === 4) renderReview(config);

  dom.configNext.firstChild.textContent =
    config.step === CONFIG_STEPS.length - 1
      ? config.editKey
        ? "Salvar alterações "
        : "Adicionar à sacola "
      : "Continuar ";
  dom.configNext.disabled = !configStepValid(config);
  updateConfigPrice();
  window.requestAnimationFrame(() => {
    const panel = dom.configOptions.closest(".config-panel-inner");
    if (panel) panel.scrollTop = 0;
  });
}

function makeChoice({
  title,
  detail,
  visual,
  price,
  selected,
  swatch,
  onSelect,
}) {
  const button = element("button", {
    className: `config-choice${selected ? " is-selected" : ""}`,
    type: "button",
    attrs: { role: "radio", "aria-checked": String(selected) },
  });
  const visualNode = element("span", {
    className: `choice-visual${swatch ? ` color-swatch color-tone ${colorTone(swatch)}` : ""}`,
    text: swatch ? "" : visual,
    attrs: { "aria-hidden": "true" },
  });
  const copy = element("span", { className: "choice-text" }, [
    element("strong", { text: title }),
    element("small", { text: detail }),
  ]);
  const end =
    price !== undefined
      ? element("span", { className: "choice-price", text: price })
      : element("span", { className: "choice-check" }, [
          iconPath("m4 10 4 4 8-9"),
        ]);
  button.append(visualNode, copy, end);
  button.addEventListener("click", onSelect);
  return button;
}

function renderModelOptions(config) {
  config.product.fits.forEach((fit, index) => {
    const details =
      index === 0
        ? "Equilíbrio entre estrutura e liberdade"
        : index === 1
          ? "Linhas mais próximas ao corpo"
          : "Uma leitura diferente do mesmo design";
    dom.configOptions.append(
      makeChoice({
        title: fit,
        detail: details,
        visual: String(index + 1).padStart(2, "0"),
        selected: config.model === fit,
        onSelect: () => {
          config.model = fit;
          renderConfigStep();
          window.requestAnimationFrame(() =>
            dom.configOptions
              .querySelectorAll(".config-choice")
              [index]?.focus(),
          );
        },
      }),
    );
  });
}

function renderColorOptions(config) {
  config.product.colors.forEach((color, index) => {
    dom.configOptions.append(
      makeChoice({
        title: color.name,
        detail: "Cor selecionada para esta peça",
        swatch: color.value,
        selected: config.color.name === color.name,
        onSelect: () => {
          config.color = { name: color.name, value: color.value };
          updateConfigPreview();
          renderConfigStep();
          window.requestAnimationFrame(() =>
            dom.configOptions
              .querySelectorAll(".config-choice")
              [index]?.focus(),
          );
        },
      }),
    );
  });
}

function renderSizeOptions(config) {
  const grid = element("div", {
    className: "size-grid",
    attrs: { role: "group", "aria-label": "Tamanhos disponíveis" },
  });
  config.product.variants.forEach((size, index) => {
    const available = sizeAvailable(config.product, size, config.editKey);
    const button = element("button", {
      className: `size-choice${config.size === size ? " is-selected" : ""}`,
      text: size,
      type: "button",
      attrs: {
        role: "radio",
        "aria-checked": String(config.size === size),
        "aria-label": available
          ? `Tamanho ${size}`
          : `Tamanho ${size}, indisponível`,
      },
    });
    button.disabled = !available;
    button.addEventListener("click", () => {
      config.size = size;
      config.qty = Math.min(
        config.qty,
        availableQuantity(config.product, size, config.editKey),
      );
      renderConfigStep();
      window.requestAnimationFrame(() =>
        dom.configOptions.querySelectorAll(".size-choice")[index]?.focus(),
      );
    });
    grid.append(button);
  });
  const help = element("div", { className: "size-help" }, [
    element("span", {
      text: "Os tamanhos seguem a grade informada para cada peça.",
    }),
    element("button", { text: "Guia de medidas", type: "button" }),
  ]);
  help
    .querySelector("button")
    .addEventListener("click", () =>
      showToast(
        "O guia detalhado de medidas será disponibilizado antes do lançamento.",
      ),
    );
  dom.configOptions.append(grid, help);
}

function renderPersonalizationOptions(config) {
  const fields = element("div", { className: "personalization-fields" });
  const nameGroup = createTextField({
    id: "personalization-name",
    label: "Nome (opcional)",
    value: config.name,
    placeholder: "Ex.: Dra. Ana Lima",
    maxLength: 28,
    onInput: (value) => {
      config.name = value;
      updateConfigPreview();
    },
  });
  const professionGroup = createTextField({
    id: "personalization-profession",
    label: "Profissão ou especialidade (opcional)",
    value: config.profession,
    placeholder: "Ex.: Cardiologia",
    maxLength: 34,
    onInput: (value) => {
      config.profession = value;
      updateConfigPreview();
    },
  });
  const note = element("p", {
    className: "personalization-note",
    text: config.product.personalizable
      ? "A personalização é opcional e aparece de forma discreta na prévia. Revise a grafia antes de adicionar à sacola."
      : "Esta peça não recebe personalização. Você pode continuar sem preencher os campos.",
  });
  if (!config.product.personalizable) {
    nameGroup.querySelector("input").disabled = true;
    professionGroup.querySelector("input").disabled = true;
    config.name = "";
    config.profession = "";
  }
  fields.append(nameGroup, professionGroup, note);
  dom.configOptions.append(fields);
}

function createTextField({
  id,
  label,
  value,
  placeholder,
  maxLength,
  onInput,
}) {
  const group = element("div", { className: "field-group" });
  const labelNode = element("label", { text: label, attrs: { for: id } });
  const input = element("input", {
    attrs: {
      id,
      type: "text",
      value,
      placeholder,
      maxlength: maxLength,
      autocomplete: "off",
    },
  });
  const counter = element("span", { text: `${value.length}/${maxLength}` });
  const meta = element("div", { className: "field-meta" }, [
    element("span", { text: "Confira acentos e abreviações" }),
    counter,
  ]);
  input.addEventListener("input", () => {
    const clean = cleanMultiline(input.value, maxLength).replace(
      /[\r\n]+/g,
      " ",
    );
    if (input.value !== clean) input.value = clean;
    counter.textContent = `${clean.length}/${maxLength}`;
    onInput(clean);
  });
  input.addEventListener("blur", () => {
    const clean = cleanText(input.value, maxLength);
    input.value = clean;
    counter.textContent = `${clean.length}/${maxLength}`;
    onInput(clean);
  });
  group.append(labelNode, input, meta);
  return group;
}

function renderReview(config) {
  const review = element("div", { className: "review-card" });
  review.append(
    reviewRow("Peça", config.product.name),
    reviewRow("Modelo", config.model),
    reviewRow("Cor", config.color.name),
    reviewRow("Tamanho", config.size),
    reviewRow(
      "Personalização",
      [config.name, config.profession].filter(Boolean).join(" · ") ||
        "Sem personalização",
    ),
  );
  const quantityRow = element("div", { className: "review-row" });
  const quantityLabel = element("span", { text: "Quantidade" });
  const stepper = createQuantityStepper(
    config.qty,
    Math.min(
      availableQuantity(config.product, config.size, config.editKey),
      MAX_ORDER_UNITS -
        state.cart.reduce(
          (sum, item) => sum + (item.key === config.editKey ? 0 : item.qty),
          0,
        ),
    ),
    (nextQty, direction) => {
      config.qty = nextQty;
      renderConfigStep();
      window.requestAnimationFrame(() =>
        dom.configOptions
          .querySelector(
            `.quantity-stepper button:${direction === "increase" ? "last" : "first"}-child`,
          )
          ?.focus(),
      );
    },
  );
  quantityRow.append(quantityLabel, stepper);
  review.append(
    quantityRow,
    reviewRow("Total", money.format(config.product.price * config.qty)),
  );
  dom.configOptions.append(
    review,
    element("p", {
      className: "personalization-note",
      text: "Limite de 10 unidades por configuração nesta reserva. Para pedidos corporativos, fale com nossa equipe no WhatsApp.",
    }),
  );
}

function reviewRow(label, value) {
  return element("div", { className: "review-row" }, [
    element("span", { text: label }),
    element("strong", { text: value }),
  ]);
}

function createQuantityStepper(value, max, onChange, label = "Quantidade") {
  const stepper = element("div", {
    className: "quantity-stepper",
    attrs: { "aria-label": label },
  });
  const decrease = element("button", {
    text: "−",
    type: "button",
    attrs: { "aria-label": "Diminuir quantidade" },
  });
  const output = element("output", {
    text: String(value),
    attrs: { "aria-live": "polite" },
  });
  const increase = element("button", {
    text: "+",
    type: "button",
    attrs: { "aria-label": "Aumentar quantidade" },
  });
  decrease.disabled = value <= 1;
  increase.disabled = value >= max;
  decrease.addEventListener("click", () =>
    onChange(Math.max(1, value - 1), "decrease"),
  );
  increase.addEventListener("click", () =>
    onChange(Math.min(max, value + 1), "increase"),
  );
  stepper.append(decrease, output, increase);
  return stepper;
}

function configStepValid(config) {
  if (config.step === 0) return Boolean(config.model);
  if (config.step === 1) return Boolean(config.color?.name);
  if (config.step === 2)
    return (
      Boolean(config.size) &&
      sizeAvailable(config.product, config.size, config.editKey)
    );
  return true;
}

function updateConfigPreview() {
  const config = state.config;
  if (!config) return;
  dom.configCode.textContent = `${config.product.categoryLabel.toUpperCase()} / ${config.product.id}`;
  dom.configColorName.textContent = config.color.name;
  applyColorTone(dom.configPreview, config.color.value);
  dom.configImage.classList.remove("has-image-error");
  dom.configPreview.classList.remove("has-image-error");
  dom.configImage.src = config.product.image;
  dom.configImage.alt = `Prévia de ${config.product.name} na cor ${config.color.name}`;
  dom.configImage.onerror = () =>
    dom.configPreview.classList.add("has-image-error");
  const hasPersonalization =
    Boolean(config.name || config.profession) && config.product.personalizable;
  dom.embroideryPreview.hidden = !hasPersonalization;
  dom.embroideryPreview.querySelector("strong").textContent = config.name;
  dom.embroideryPreview.querySelector("span").textContent = config.profession;
  updateConfigPrice();
}

function updateConfigPrice() {
  if (!state.config) return;
  dom.configPrice.textContent = money.format(
    state.config.product.price * state.config.qty,
  );
}

function handleConfigNext() {
  const config = state.config;
  if (!config || !configStepValid(config)) return;
  if (config.step < CONFIG_STEPS.length - 1) {
    config.step += 1;
    renderConfigStep();
    window.requestAnimationFrame(() =>
      dom.configTitle.focus({ preventScroll: true }),
    );
    return;
  }
  saveConfiguredItem(config);
}

function saveConfiguredItem(config) {
  config.name = cleanText(config.name, 28);
  config.profession = cleanText(config.profession, 34);
  const item = {
    key: config.editKey || createId(),
    productId: config.product.id,
    name: config.product.name,
    category: config.product.category,
    image: config.product.image,
    model: config.model,
    color: { name: config.color.name, value: config.color.value },
    size: config.size,
    variantId: cleanText(config.product.variantIds?.[config.size], 96),
    personalization: { name: config.name, profession: config.profession },
    qty: config.qty,
    unitPrice: config.product.price,
  };
  if (config.editKey) {
    const otherQuantity = state.cart.reduce(
      (sum, current) =>
        sum + (current.key === config.editKey ? 0 : current.qty),
      0,
    );
    if (otherQuantity + item.qty > MAX_ORDER_UNITS) {
      showToast("Uma reserva pode reunir no máximo 50 unidades.");
      return;
    }
    state.cart = state.cart.map((current) =>
      current.key === config.editKey ? item : current,
    );
  } else {
    const match = state.cart.find((current) =>
      sameConfiguration(current, item),
    );
    if (match) {
      const max = Math.min(
        inventoryLimit(config.product, config.size),
        match.qty + MAX_ORDER_UNITS - cartItemCount(),
      );
      if (max <= match.qty) {
        showToast("Uma reserva pode reunir no máximo 50 unidades.");
        return;
      }
      state.cart = state.cart.map((current) =>
        current.key === match.key
          ? { ...current, qty: Math.min(max, current.qty + item.qty) }
          : current,
      );
    } else {
      if (state.cart.length >= MAX_CART_LINES) {
        showToast(
          "Sua sacola chegou ao limite de configurações. Finalize esta reserva ou remova um item para continuar.",
        );
        return;
      }
      if (cartItemCount() + item.qty > MAX_ORDER_UNITS) {
        showToast("Uma reserva pode reunir no máximo 50 unidades.");
        return;
      }
      state.cart.push(item);
    }
  }
  persistCart();
  renderCart();
  closeDialog(dom.configurator);
  showToast(
    config.editKey
      ? "Personalização atualizada na sacola."
      : `${config.product.name} foi adicionado à sacola.`,
  );
  bumpCartCount();
  state.config = null;
}

function sameConfiguration(left, right) {
  return (
    left.productId === right.productId &&
    left.model === right.model &&
    left.color?.name === right.color?.name &&
    left.size === right.size &&
    left.personalization?.name === right.personalization?.name &&
    left.personalization?.profession === right.personalization?.profession
  );
}

function createId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `sfl-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function removeSessionValue(key) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // O fluxo continua em memória quando o navegador bloqueia armazenamento.
  }
}

function readCart() {
  try {
    const legacy = localStorage.getItem(CART_STORAGE_KEY);
    const stored = sessionStorage.getItem(CART_STORAGE_KEY) || legacy;
    if (legacy) localStorage.removeItem(CART_STORAGE_KEY);
    const parsed = JSON.parse(stored || "null");
    const legacyItems = Array.isArray(parsed) ? parsed : null;
    const savedAt = safeNumber(parsed?.savedAt, 0, Number.MAX_SAFE_INTEGER);
    const items =
      legacyItems || (Array.isArray(parsed?.items) ? parsed.items : []);
    if (!legacyItems && (!savedAt || Date.now() - savedAt > CART_TTL_MS)) {
      removeSessionValue(CART_STORAGE_KEY);
      return [];
    }
    const normalized = items
      .slice(0, MAX_CART_LINES)
      .map(normalizeCartItem)
      .filter(Boolean);
    let remaining = MAX_ORDER_UNITS;
    return normalized
      .map((item) => {
        const qty = Math.min(item.qty, remaining);
        remaining -= qty;
        return { ...item, qty };
      })
      .filter((item) => item.qty > 0);
  } catch {
    return [];
  }
}

function normalizeCartItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const productId = cleanText(raw.productId, 64);
  const name = cleanText(raw.name, 100);
  const size = cleanText(raw.size, 12);
  const unitPrice = safeNumber(raw.unitPrice, -1, 100_000);
  if (!productId || !name || !size || unitPrice < 0) return null;
  const category = raw.category === "scrub" ? "scrub" : "jaleco";
  return {
    key: cleanText(raw.key, 80) || createId(),
    productId,
    name,
    category,
    image: safeImage(raw.image, category),
    model: cleanText(raw.model, 40),
    color: {
      name: cleanText(raw.color?.name, 40) || "Cor selecionada",
      value: safeColor(raw.color?.value),
    },
    size,
    variantId: cleanText(raw.variantId, 96),
    personalization: {
      name: cleanText(raw.personalization?.name, 28),
      profession: cleanText(raw.personalization?.profession, 34),
    },
    qty: Math.max(1, Math.min(10, Math.floor(safeNumber(raw.qty, 1, 10)))),
    unitPrice,
    unavailableReason: "",
  };
}

function reconcileCartWithCatalog() {
  if (!state.catalog.length || !state.cart.length) return;
  const before = JSON.stringify(state.cart);
  const reserved = new Map();
  state.cart = state.cart.map((item) => {
    const product = state.catalog.find(
      (candidate) => candidate.id === item.productId,
    );
    if (!product)
      return {
        ...item,
        unavailableReason: "Este produto não faz mais parte da coleção atual.",
      };

    let unavailableReason = "";
    if (product.stock <= 0)
      unavailableReason = "Produto temporariamente sem estoque.";
    else if (
      !product.variants.includes(item.size) ||
      (product.hasVariantStock &&
        safeNumber(product.variantStock[item.size], 0) <= 0)
    )
      unavailableReason = "O tamanho selecionado precisa ser revisto.";
    else if (!product.colors.some((color) => color.name === item.color.name))
      unavailableReason = "A cor selecionada precisa ser escolhida novamente.";
    else if (!product.fits.includes(item.model))
      unavailableReason =
        "O modelo selecionado precisa ser escolhido novamente.";

    let qty = item.qty;
    if (!unavailableReason) {
      const key = product.hasVariantStock
        ? `${product.id}:${item.size}`
        : product.id;
      const used = reserved.get(key) || 0;
      const remaining = Math.max(0, inventoryLimit(product, item.size) - used);
      if (!remaining)
        unavailableReason =
          "O estoque disponível já está reservado por outro item da sacola.";
      else {
        qty = Math.min(qty, remaining);
        reserved.set(key, used + qty);
      }
    }

    return {
      ...item,
      name: product.name,
      category: product.category,
      image: product.image,
      unitPrice: product.price,
      variantId: cleanText(product.variantIds?.[item.size], 96),
      qty,
      unavailableReason,
    };
  });
  if (before !== JSON.stringify(state.cart)) persistCart();
}

function persistCart() {
  try {
    const items = state.cart.map(
      ({ unavailableReason: _unavailableReason, ...item }) => item,
    );
    sessionStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({ savedAt: Date.now(), items }),
    );
    const savedIntent = readCheckoutIntent();
    const fingerprint = cartFingerprint();
    if (savedIntent && savedIntent.fingerprint !== fingerprint)
      removeSessionValue(CHECKOUT_INTENT_KEY);
    if (
      state.checkout.fingerprint &&
      state.checkout.fingerprint !== fingerprint
    ) {
      state.checkout.idempotencyKey = "";
      state.checkout.fingerprint = "";
    }
  } catch {
    showToast(
      "A sacola funciona nesta sessão, mas não pôde ser salva neste navegador.",
    );
  }
}

function cartItemCount() {
  return state.cart.reduce((sum, item) => sum + item.qty, 0);
}

function renderCart() {
  const count = cartItemCount();
  dom.cartCounts.forEach((node) => {
    node.textContent = String(count);
  });
  dom.cartActions.forEach((button) =>
    button.setAttribute(
      "aria-label",
      `Abrir sacola, ${count} ${count === 1 ? "item" : "itens"}`,
    ),
  );
  dom.cartHeadingCount.textContent = `(${count})`;
  dom.cartContent.replaceChildren();

  if (!state.cart.length) {
    dom.cartFooter.hidden = true;
    const empty = element("div", { className: "empty-cart" });
    const content = element("div");
    const icon = element(
      "div",
      { className: "empty-cart-icon", attrs: { "aria-hidden": "true" } },
      [iconPath("M5.8 8.5h12.4l.8 11H5l.8-11ZM9 9V6.8a3 3 0 0 1 6 0V9")],
    );
    const continueButton = element("button", {
      className: "button button-primary",
      text: "Explorar coleção",
      type: "button",
    });
    continueButton.addEventListener("click", () => {
      closeDialog(dom.cartDialog);
      document
        .querySelector("#loja")
        ?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
    });
    content.append(
      icon,
      element("h3", { text: "Sua sacola está leve." }),
      element("p", {
        text: "Escolha uma peça, personalize cada detalhe e ela aparecerá aqui.",
      }),
      continueButton,
    );
    empty.append(content);
    dom.cartContent.append(empty);
    return;
  }

  state.cart.forEach((item) => dom.cartContent.append(createCartItem(item)));
  const subtotal = state.cart.reduce(
    (sum, item) => sum + item.unitPrice * item.qty,
    0,
  );
  dom.cartSubtotal.textContent = money.format(subtotal);
  dom.cartFooter.hidden = false;
  const invalidItem = state.cart.find((item) => item.unavailableReason);
  const checkoutBlocked =
    state.catalogLoading || Boolean(state.catalogError) || Boolean(invalidItem);
  dom.cartCheckout.disabled = checkoutBlocked || state.checkout.submitting;
  dom.cartCheckout.setAttribute("aria-disabled", String(checkoutBlocked));
  if (state.catalogLoading) {
    dom.cartValidation.textContent =
      "Aguarde enquanto confirmamos a disponibilidade atual.";
  } else if (state.catalogError) {
    dom.cartValidation.textContent =
      "A coleção precisa ser atualizada antes de criar uma reserva.";
  } else if (invalidItem) {
    dom.cartValidation.textContent =
      "Corrija ou remova os itens sinalizados antes de continuar.";
  } else {
    dom.cartValidation.textContent =
      "O estoque será validado novamente antes de criar a reserva.";
  }
}

function createCartItem(item) {
  const article = element("article", { className: "cart-item" });
  article.dataset.cartKey = item.key;
  const imageShell = element("div", {
    className: "cart-item-image image-fallback",
    attrs: { "data-fallback": item.productId },
  });
  applyColorTone(imageShell, item.color.value);
  const image = element("img", {
    attrs: { src: item.image, alt: "", loading: "lazy" },
  });
  image.addEventListener(
    "error",
    () => imageShell.classList.add("has-image-error"),
    { once: true },
  );
  imageShell.append(image);

  const body = element("div", { className: "cart-item-body" });
  body.append(element("h3", { text: item.name }));
  body.append(
    element("p", {
      text: `${item.model} · ${item.color.name} · Tam. ${item.size}`,
    }),
  );
  const personalization = [
    item.personalization.name,
    item.personalization.profession,
  ]
    .filter(Boolean)
    .join(" · ");
  if (personalization)
    body.append(
      element("p", {
        className: "cart-item-personalization",
        text: personalization,
      }),
    );
  if (item.unavailableReason)
    body.append(
      element("p", {
        className: "cart-item-warning",
        text: item.unavailableReason,
        attrs: { role: "status" },
      }),
    );
  const product = state.catalog.find(
    (candidate) => candidate.id === item.productId,
  );
  if (product) {
    const edit = element("button", {
      className: "cart-edit",
      text: "Editar personalização",
      type: "button",
    });
    edit.addEventListener("click", () => {
      closeDialog(dom.cartDialog, false);
      window.setTimeout(
        () => openConfigurator(product, item),
        reduceMotion ? 0 : 160,
      );
    });
    body.append(edit);
  }
  const bottom = element("div", { className: "cart-item-bottom" });
  const max = product
    ? Math.min(
        availableQuantity(product, item.size, item.key),
        MAX_ORDER_UNITS - (cartItemCount() - item.qty),
      )
    : Math.min(10, MAX_ORDER_UNITS - (cartItemCount() - item.qty));
  if (!item.unavailableReason)
    bottom.append(
      createQuantityStepper(
        item.qty,
        max,
        (qty, direction) => updateCartQuantity(item.key, qty, direction),
        `Quantidade de ${item.name}`,
      ),
    );
  bottom.append(
    element("strong", {
      className: "cart-item-price",
      text: money.format(item.unitPrice * item.qty),
    }),
  );
  body.append(bottom);

  const remove = element("button", {
    className: "cart-remove",
    text: "×",
    type: "button",
    attrs: { "aria-label": `Remover ${item.name} da sacola` },
  });
  remove.addEventListener("click", () => removeCartItem(item.key));
  article.append(imageShell, body, remove);
  return article;
}

function updateCartQuantity(key, qty, direction) {
  state.cart = state.cart.map((item) =>
    item.key === key ? { ...item, qty } : item,
  );
  persistCart();
  renderCart();
  window.requestAnimationFrame(() => {
    const item = [...dom.cartContent.querySelectorAll(".cart-item")].find(
      (node) => node.dataset.cartKey === key,
    );
    item
      ?.querySelector(
        `.quantity-stepper button:${direction === "increase" ? "last" : "first"}-child`,
      )
      ?.focus();
  });
}

function removeCartItem(key) {
  const previousIndex = state.cart.findIndex(
    (candidate) => candidate.key === key,
  );
  const item = state.cart.find((candidate) => candidate.key === key);
  state.cart = state.cart.filter((candidate) => candidate.key !== key);
  persistCart();
  renderCart();
  window.requestAnimationFrame(() => {
    const remaining = [...dom.cartContent.querySelectorAll(".cart-remove")];
    const target =
      remaining[Math.min(Math.max(previousIndex, 0), remaining.length - 1)];
    (
      target || dom.cartCloseActions.find((node) => node.closest(".drawer"))
    )?.focus({
      preventScroll: true,
    });
  });
  if (item) showToast(`${item.name} foi removido da sacola.`);
}

function bumpCartCount() {
  dom.cartCounts.forEach((node) => {
    node.classList.remove("is-bumping");
    void node.offsetWidth;
    node.classList.add("is-bumping");
  });
}

async function refreshAuth({ announceUnavailable = false } = {}) {
  const requestId = ++authRefreshSequence;
  dom.authStatus.textContent = "";
  try {
    const response = await fetch("/api/customer-auth/me", {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    const data = await safeJson(response);
    if (requestId !== authRefreshSequence) return Boolean(state.auth.user);
    if (response.status === 401) {
      setSignedOut(true);
      return false;
    }
    if (!response.ok || !data?.user)
      throw new Error(cleanText(data?.error, 120) || "Acesso indisponível.");
    setSignedIn(data.user, data.csrf);
    return true;
  } catch {
    if (requestId !== authRefreshSequence) return Boolean(state.auth.user);
    setSignedOut(false);
    if (announceUnavailable)
      dom.authStatus.textContent =
        "O acesso com Google está temporariamente indisponível. A loja e sua sacola continuam funcionando normalmente.";
    return false;
  }
}

function setSignedIn(user, csrf) {
  const name = cleanText(user?.name, 100) || "Cliente";
  const email = cleanText(user?.email, 180);
  state.auth = {
    checked: true,
    user: { name, email },
    csrf: cleanText(csrf, 300),
    googleAvailable: true,
  };
  dom.authSignedOut.hidden = true;
  dom.authSignedIn.hidden = false;
  dom.authName.textContent = firstName(name);
  dom.authEmail.textContent = email;
  dom.authFullName.textContent = name;
  dom.authInitials.textContent = initials(name);
  dom.accountLabels.forEach((label) => {
    label.textContent = firstName(name);
  });
}

function setSignedOut(googleAvailable = true) {
  state.auth = { checked: true, user: null, csrf: "", googleAvailable };
  dom.authSignedOut.hidden = false;
  dom.authSignedIn.hidden = true;
  dom.accountLabels.forEach((label) => {
    label.textContent = "Entrar";
  });
  dom.googleLogin.classList.toggle("is-disabled", !googleAvailable);
  dom.googleLogin.setAttribute("aria-disabled", String(!googleAvailable));
}

function firstName(name) {
  return cleanText(name, 100).split(" ")[0] || "cliente";
}

function initials(name) {
  const parts = cleanText(name, 100).split(" ").filter(Boolean);
  return (
    [parts[0], parts.at(-1)]
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .toLocaleUpperCase("pt-BR")
      .slice(0, 2) || "SF"
  );
}

async function logout(retried = false) {
  if (!state.auth.csrf) {
    setSignedOut(true);
    closeDialog(dom.authDialog);
    return;
  }
  dom.logout.disabled = true;
  dom.authStatus.textContent = "Encerrando acesso…";
  try {
    const response = await fetch("/api/customer-auth/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json", "X-CSRF-Token": state.auth.csrf },
    });
    if (response.status === 403 && !retried) {
      const refreshed = await refreshAuth();
      if (refreshed) return logout(true);
    }
    if (!response.ok && response.status !== 401) {
      const data = await safeJson(response).catch(() => ({}));
      throw new Error(
        cleanText(data?.error, 120) || "Não foi possível sair agora.",
      );
    }
    setSignedOut(true);
    closeDialog(dom.authDialog);
    showToast("Acesso encerrado com segurança.");
  } catch (error) {
    dom.authStatus.textContent =
      cleanText(error?.message, 140) ||
      "Não foi possível encerrar o acesso. Tente novamente.";
  } finally {
    dom.logout.disabled = false;
  }
}

async function openAuth() {
  closeMobileMenu();
  if (dom.cartDialog.open) closeDialog(dom.cartDialog, false);
  openDialog(dom.authDialog, dom.authClose);
  dom.authStatus.textContent = "Verificando seu acesso…";
  const signedIn = await refreshAuth({ announceUnavailable: true });
  if (!dom.authDialog.open) return;
  const target = signedIn
    ? dom.logout
    : state.auth.googleAvailable
      ? dom.googleLogin
      : dom.authClose;
  target?.focus({ preventScroll: true });
}

function cartFingerprint() {
  const canonical = JSON.stringify(
    state.cart.map((item) => ({
      productId: item.productId,
      variantId: item.variantId,
      size: item.size,
      color: item.color?.name,
      model: item.model,
      personalization: item.personalization,
      quantity: item.qty,
    })),
  );
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function readCheckoutIntent() {
  try {
    const parsed = JSON.parse(
      sessionStorage.getItem(CHECKOUT_INTENT_KEY) || "null",
    );
    const key = cleanText(parsed?.key, 128);
    const fingerprint = cleanText(parsed?.fingerprint, 32);
    if (!/^[A-Za-z0-9._:-]{16,128}$/.test(key) || !fingerprint) return null;
    return { key, fingerprint };
  } catch {
    return null;
  }
}

function checkoutIntentKey() {
  const fingerprint = cartFingerprint();
  if (
    state.checkout.fingerprint === fingerprint &&
    state.checkout.idempotencyKey
  )
    return state.checkout.idempotencyKey;
  const saved = readCheckoutIntent();
  const key = saved?.fingerprint === fingerprint ? saved.key : createId();
  state.checkout.idempotencyKey = key;
  state.checkout.fingerprint = fingerprint;
  try {
    sessionStorage.setItem(
      CHECKOUT_INTENT_KEY,
      JSON.stringify({ key, fingerprint }),
    );
  } catch {
    // A chave ainda protege esta tentativa; apenas não sobreviverá a um reload.
  }
  return key;
}

function checkoutPayload() {
  return {
    items: state.cart.map((item) => ({
      variantId: item.variantId || undefined,
      productId: item.productId,
      size: item.size,
      color: item.color.name,
      model: item.model,
      quantity: item.qty,
      personalization: {
        name: item.personalization.name,
        profession: item.personalization.profession,
      },
    })),
  };
}

function renderCheckout() {
  dom.checkoutItems.replaceChildren();
  state.cart.forEach((item) => {
    const details = [item.model, item.color.name, `Tam. ${item.size}`].join(
      " · ",
    );
    const personalization = [
      item.personalization.name,
      item.personalization.profession,
    ]
      .filter(Boolean)
      .join(" · ");
    dom.checkoutItems.append(
      element("article", { className: "checkout-item" }, [
        element("strong", { text: `${item.qty}× ${item.name}` }),
        element("span", { text: details }),
        personalization ? element("small", { text: personalization }) : null,
        element("strong", {
          className: "checkout-item-price",
          text: money.format(item.unitPrice * item.qty),
        }),
      ]),
    );
  });
  const subtotal = state.cart.reduce(
    (sum, item) => sum + item.unitPrice * item.qty,
    0,
  );
  dom.checkoutTotal.textContent = money.format(subtotal);
  dom.checkoutAccount.replaceChildren();
  if (state.auth.user) {
    dom.checkoutAccount.append(
      element("span", { text: "Pedido conectado à conta de " }),
      element("strong", { text: state.auth.user.name }),
      element("span", { text: "." }),
    );
  } else {
    dom.checkoutAccount.append(
      element("strong", { text: "Compra como visitante. " }),
      element("span", {
        text: "Você poderá se identificar diretamente no WhatsApp; nenhuma senha é necessária.",
      }),
    );
  }
  dom.checkoutConfirm.disabled =
    state.checkout.submitting || !state.storeConfig.whatsappAvailable;
  dom.checkoutConfirm.setAttribute(
    "aria-busy",
    String(state.checkout.submitting),
  );
  if (!state.storeConfig.whatsappAvailable)
    dom.checkoutStatus.textContent =
      "O número oficial de atendimento precisa ser configurado antes de reservar.";
}

async function handleCheckout() {
  if (state.cart.some((item) => item.unavailableReason)) {
    showToast("Revise os itens sinalizados antes de continuar o pedido.");
    return;
  }
  if (!state.cart.length || state.catalogLoading || state.catalogError) {
    showToast("Atualize a coleção e revise sua sacola antes de continuar.");
    return;
  }
  if (!state.storeConfig.loaded) await loadStoreConfig();
  state.checkout.order = null;
  state.checkout.whatsappUrl = "";
  dom.checkoutStatus.textContent = "";
  dom.checkoutReview.hidden = false;
  dom.checkoutSuccess.hidden = true;
  renderCheckout();
  closeDialog(dom.cartDialog, false);
  window.setTimeout(
    () => openDialog(dom.checkoutDialog, dom.checkoutConfirm),
    reduceMotion ? 0 : 150,
  );
}

function checkoutErrorMessage(data, status) {
  const code = cleanText(data?.code || data?.error?.code, 60);
  if (code === "OUT_OF_STOCK")
    return "A disponibilidade mudou enquanto você revisava o pedido. Atualizamos a sacola para você conferir novamente.";
  if (code === "IDEMPOTENCY_CONFLICT")
    return "Esta tentativa já foi usada com outra seleção. Gere uma nova reserva e tente novamente.";
  if (code === "STORE_NOT_READY" || status === 503)
    return "O atendimento está temporariamente indisponível. Sua sacola foi preservada; tente novamente em instantes.";
  if (status === 429)
    return "Muitas tentativas em pouco tempo. Aguarde um instante e tente novamente.";
  return (
    cleanText(data?.error?.message || data?.error, 180) ||
    "Não foi possível criar a reserva agora. Sua sacola continua preservada."
  );
}

async function submitCheckout(retriedCsrf = false) {
  if (state.checkout.submitting || !state.cart.length) return;
  state.checkout.submitting = true;
  dom.checkoutStatus.textContent = "Validando preço e disponibilidade…";
  dom.checkoutConfirm.textContent = "Criando reserva…";
  renderCheckout();
  const idempotencyKey = checkoutIntentKey();
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "Idempotency-Key": idempotencyKey,
  };
  if (state.auth.user && state.auth.csrf)
    headers["X-CSRF-Token"] = state.auth.csrf;

  try {
    const response = await fetch("/api/store/orders", {
      method: "POST",
      credentials: "same-origin",
      headers,
      body: JSON.stringify(checkoutPayload()),
    });
    const data = await safeJson(response).catch(() => ({}));
    if (response.status === 403 && state.auth.user && !retriedCsrf) {
      state.checkout.submitting = false;
      const refreshed = await refreshAuth();
      if (refreshed) return submitCheckout(true);
    }
    if (!response.ok || !data?.order) {
      if (
        cleanText(data?.code || data?.error?.code, 60) ===
        "IDEMPOTENCY_CONFLICT"
      ) {
        removeSessionValue(CHECKOUT_INTENT_KEY);
        state.checkout.idempotencyKey = "";
        state.checkout.fingerprint = "";
      }
      if (response.status === 409) await loadCatalog();
      throw new Error(checkoutErrorMessage(data, response.status));
    }

    const whatsappUrl = safeWhatsappUrl(data.whatsappUrl);
    if (!whatsappUrl)
      throw new Error(
        "A reserva foi criada, mas o link oficial do WhatsApp não pôde ser validado. Guarde o código exibido.",
      );
    state.checkout.order = data.order;
    state.checkout.whatsappUrl = whatsappUrl;
    try {
      sessionStorage.setItem(
        LAST_ORDER_KEY,
        JSON.stringify({
          code: cleanText(data.order.code, 60),
          reservationExpiresAt: cleanText(data.order.reservationExpiresAt, 60),
        }),
      );
    } catch {
      // A reserva permanece válida mesmo se o navegador bloquear armazenamento.
    }
    state.cart = [];
    removeSessionValue(CART_STORAGE_KEY);
    removeSessionValue(CHECKOUT_INTENT_KEY);
    renderCart();
    showCheckoutSuccess(data.order, whatsappUrl);
    window.setTimeout(
      () => window.location.assign(whatsappUrl),
      reduceMotion ? 100 : 900,
    );
  } catch (error) {
    dom.checkoutStatus.textContent =
      cleanText(error?.message, 220) ||
      "Não foi possível criar a reserva. Tente novamente.";
  } finally {
    state.checkout.submitting = false;
    dom.checkoutConfirm.replaceChildren(
      document.createTextNode("Confirmar reserva e abrir WhatsApp "),
      element("span", { text: "→", attrs: { "aria-hidden": "true" } }),
    );
    renderCheckout();
  }
}

function showCheckoutSuccess(order, whatsappUrl) {
  const code = cleanText(order?.code, 60) || "Pedido criado";
  dom.checkoutReview.hidden = true;
  dom.checkoutSuccess.hidden = false;
  dom.orderCode.textContent = code;
  dom.orderWhatsapp.href = whatsappUrl;
  const expiresAt = Date.parse(order?.reservationExpiresAt || "");
  dom.orderExpiry.textContent = Number.isFinite(expiresAt)
    ? `Reserva válida até ${new Intl.DateTimeFormat("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(expiresAt)}.`
    : "Continue no WhatsApp para concluir o atendimento.";
  dom.checkoutSuccess.querySelector("h2")?.focus?.({ preventScroll: true });
}

const dialogFocus = new WeakMap();

function openDialog(dialog, preferredFocus) {
  if (!dialog || dialog.open) return;
  dialogFocus.set(dialog, document.activeElement);
  dialog.showModal();
  updateBodyLock();
  window.requestAnimationFrame(() => {
    const target = preferredFocus || focusableElements(dialog)[0];
    target?.focus({ preventScroll: true });
  });
}

function closeDialog(dialog, restoreFocus = true) {
  if (!dialog?.open) return;
  dialog.close();
  updateBodyLock();
  if (restoreFocus) {
    const target = dialogFocus.get(dialog);
    window.requestAnimationFrame(() =>
      target?.focus?.({ preventScroll: true }),
    );
  }
}

function updateBodyLock() {
  const hasOpenDialog = [...document.querySelectorAll("dialog")].some(
    (dialog) => dialog.open,
  );
  document.body.classList.toggle("is-locked", hasOpenDialog);
}

function focusableElements(container) {
  return [
    ...container.querySelectorAll(
      "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
    ),
  ].filter((node) => !node.hidden && node.getClientRects().length > 0);
}

function trapFocus(event) {
  const dialog = event.currentTarget;
  if (event.key !== "Tab") return;
  const focusables = focusableElements(dialog);
  if (!focusables.length) {
    event.preventDefault();
    return;
  }
  const first = focusables[0];
  const last = focusables.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function showToast(message) {
  const toast = element("div", {
    className: "toast",
    attrs: { role: "status" },
  });
  const icon = element("span", {
    className: "toast-icon",
    text: "✓",
    attrs: { "aria-hidden": "true" },
  });
  const text = element("p", { text: cleanText(message, 180) });
  const close = element("button", {
    text: "×",
    type: "button",
    attrs: { "aria-label": "Fechar aviso" },
  });
  const dismiss = () => {
    if (!toast.isConnected) return;
    toast.classList.add("is-leaving");
    window.setTimeout(() => toast.remove(), reduceMotion ? 0 : 220);
  };
  let dismissTimer;
  const pauseDismiss = () => window.clearTimeout(dismissTimer);
  const scheduleDismiss = () => {
    pauseDismiss();
    dismissTimer = window.setTimeout(dismiss, 4600);
  };
  close.addEventListener("click", dismiss);
  toast.addEventListener("mouseenter", pauseDismiss);
  toast.addEventListener("mouseleave", scheduleDismiss);
  toast.addEventListener("focusin", pauseDismiss);
  toast.addEventListener("focusout", () => {
    window.setTimeout(() => {
      if (!toast.contains(document.activeElement)) scheduleDismiss();
    }, 0);
  });
  toast.append(icon, text, close);
  dom.toastRegion.append(toast);
  scheduleDismiss();
}

function handleLoginQuery() {
  const url = new URL(window.location.href);
  if (url.searchParams.get("login") !== "erro") return;
  showToast(
    "Não foi possível concluir o acesso com Google. Nenhuma alteração foi feita; tente novamente quando quiser.",
  );
  url.searchParams.delete("login");
  const query = url.searchParams.toString();
  history.replaceState(
    null,
    "",
    `${url.pathname}${query ? `?${query}` : ""}${url.hash}`,
  );
}

function setupImageFallbacks() {
  document.querySelectorAll("[data-image-fallback]").forEach((image) => {
    const markError = () =>
      image.closest(".image-fallback")?.classList.add("has-image-error");
    image.addEventListener("error", markError, { once: true });
    if (image.complete && image.naturalWidth === 0) markError();
  });
}

function setupReveal() {
  const nodes = [...document.querySelectorAll(".reveal")];
  if (reduceMotion || !("IntersectionObserver" in window)) {
    nodes.forEach((node) => node.classList.add("is-visible"));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px" },
  );
  nodes.forEach((node) => observer.observe(node));
}

function setupNavigationObserver() {
  if (!("IntersectionObserver" in window)) return;
  const links = [...document.querySelectorAll(".desktop-nav a")];
  const sections = ["inicio", "tecnologia", "colecao", "loja"]
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      links.forEach((link) => {
        const current = link.getAttribute("href") === `#${visible.target.id}`;
        link.classList.toggle("is-current", current);
        if (current) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
    },
    { rootMargin: "-30% 0px -60%", threshold: [0, 0.2, 0.5] },
  );
  sections.forEach((section) => observer.observe(section));
}

function closeMobileMenu(restoreFocus = false) {
  dom.menuToggle.setAttribute("aria-expanded", "false");
  dom.mobileMenu.hidden = true;
  dom.menuToggle.querySelector(".sr-only").textContent = "Abrir menu";
  if (restoreFocus) dom.menuToggle.focus({ preventScroll: true });
}

dom.filterButtons.forEach((button) =>
  button.addEventListener("click", () => setFilter(button.dataset.filter)),
);
dom.filterLinks.forEach((link) =>
  link.addEventListener("click", () => setFilter(link.dataset.filterLink)),
);
dom.productSearch.addEventListener("input", () => {
  state.search = cleanText(dom.productSearch.value, 80);
  state.visibleProducts = CATALOG_PAGE_SIZE;
  renderCatalog();
});
dom.productSort.addEventListener("change", () => {
  state.sort = dom.productSort.value;
  renderCatalog();
});
dom.loadMore.addEventListener("click", () => {
  state.visibleProducts += CATALOG_PAGE_SIZE;
  renderCatalog();
});

dom.configBack.addEventListener("click", () => {
  if (!state.config || state.config.step === 0) return;
  state.config.step -= 1;
  renderConfigStep();
  window.requestAnimationFrame(() =>
    dom.configTitle.focus({ preventScroll: true }),
  );
});
dom.configClose.addEventListener("click", () => closeDialog(dom.configurator));
dom.configNext.addEventListener("click", handleConfigNext);
dom.configOptions.addEventListener("keydown", (event) => {
  if (
    !["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key) ||
    dom.configOptions.getAttribute("role") !== "radiogroup"
  )
    return;
  const choices = [
    ...dom.configOptions.querySelectorAll("[role='radio']:not([disabled])"),
  ];
  const current = choices.indexOf(document.activeElement);
  if (current < 0 || !choices.length) return;
  event.preventDefault();
  const direction = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1;
  const next = choices[(current + direction + choices.length) % choices.length];
  next.focus();
  next.click();
});
dom.configurator.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeDialog(dom.configurator);
});

dom.cartActions.forEach((button) =>
  button.addEventListener("click", () => {
    renderCart();
    openDialog(
      dom.cartDialog,
      dom.cartContent.querySelector("button") ||
        dom.cartCloseActions.find((node) => node.closest(".drawer")),
    );
  }),
);
dom.cartCloseActions.forEach((button) =>
  button.addEventListener("click", () => closeDialog(dom.cartDialog)),
);
dom.cartDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeDialog(dom.cartDialog);
});
dom.cartCheckout.addEventListener("click", handleCheckout);

dom.checkoutClose.addEventListener("click", () => {
  if (!state.checkout.submitting) closeDialog(dom.checkoutDialog);
});
dom.checkoutConfirm.addEventListener("click", () => submitCheckout());
dom.checkoutDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  if (!state.checkout.submitting) closeDialog(dom.checkoutDialog);
});
dom.copyOrder.addEventListener("click", async () => {
  const code = cleanText(state.checkout.order?.code, 60);
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    showToast("Código do pedido copiado.");
  } catch {
    showToast(`Anote o código: ${code}`);
  }
});

dom.authActions.forEach((button) => button.addEventListener("click", openAuth));
dom.authClose.addEventListener("click", () => closeDialog(dom.authDialog));
dom.authDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeDialog(dom.authDialog);
});
dom.logout.addEventListener("click", () => logout());
dom.googleLogin.href = "/api/customer-auth/google/start?returnTo=%2Floja";
dom.googleLogin.addEventListener("click", (event) => {
  if (state.auth.googleAvailable) return;
  event.preventDefault();
  dom.authStatus.textContent =
    "O acesso com Google ainda não está configurado neste ambiente.";
});

[dom.configurator, dom.cartDialog, dom.checkoutDialog, dom.authDialog].forEach(
  (dialog) => {
    dialog.addEventListener("keydown", trapFocus);
    dialog.addEventListener("close", updateBodyLock);
  },
);

dom.sizeGuideActions.forEach((button) =>
  button.addEventListener("click", () => openDialog(dom.sizeGuide)),
);
dom.careGuideActions.forEach((button) =>
  button.addEventListener("click", () => openDialog(dom.careGuide)),
);
dom.infoCloseActions.forEach((button) =>
  button.addEventListener("click", () => closeDialog(button.closest("dialog"))),
);
[dom.sizeGuide, dom.careGuide].forEach((dialog) => {
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDialog(dialog);
  });
  dialog.addEventListener("keydown", trapFocus);
  dialog.addEventListener("close", updateBodyLock);
});

dom.whatsappActions.forEach((action) => {
  action.addEventListener("click", (event) => {
    if (!state.storeConfig.whatsappAvailable) {
      event.preventDefault();
      showToast(
        "O atendimento pelo WhatsApp está temporariamente indisponível.",
      );
      return;
    }
    if (action.matches("button")) {
      event.preventDefault();
      const parentDialog = action.closest("dialog");
      if (parentDialog?.open) closeDialog(parentDialog, false);
      window.open(
        state.storeConfig.whatsappUrl,
        "_blank",
        "noopener,noreferrer",
      );
    }
  });
});

dom.menuToggle.addEventListener("click", () => {
  const open = dom.menuToggle.getAttribute("aria-expanded") === "true";
  dom.menuToggle.setAttribute("aria-expanded", String(!open));
  dom.mobileMenu.hidden = open;
  dom.menuToggle.querySelector(".sr-only").textContent = open
    ? "Abrir menu"
    : "Fechar menu";
  if (!open) dom.mobileMenu.querySelector("a")?.focus();
});
dom.mobileMenu
  .querySelectorAll("a")
  .forEach((link) => link.addEventListener("click", () => closeMobileMenu()));
document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    dom.menuToggle.getAttribute("aria-expanded") === "true"
  )
    closeMobileMenu(true);
});
window.addEventListener(
  "resize",
  () => {
    if (window.innerWidth > 900) closeMobileMenu();
  },
  { passive: true },
);
window.addEventListener(
  "scroll",
  () => dom.header.classList.toggle("is-scrolled", window.scrollY > 20),
  { passive: true },
);

document.querySelectorAll("[data-current-year]").forEach((node) => {
  node.textContent = String(new Date().getFullYear());
});
setupImageFallbacks();
setupReveal();
setupNavigationObserver();
renderCart();
handleLoginQuery();
refreshAuth();
loadStoreConfig();
loadCatalog();
