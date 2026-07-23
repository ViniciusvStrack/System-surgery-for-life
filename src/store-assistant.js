import crypto from "node:crypto";
import { money, normalize, tokens } from "./utils.js";

const MAX_MESSAGE_LENGTH = 600;
const MAX_CONVERSATIONS = 5_000;
const MAX_HISTORY_ENTRIES = 6;
const CONVERSATION_TTL_MS = 30 * 60_000;
const CONVERSATION_ID = /^[A-Za-z0-9_-]{8,80}$/;

const INJECTION_PATTERNS = [
  /ignore (?:as |todas as )?(?:instrucoes|instruções|regras)/i,
  /(?:revele|mostre|exiba|repita).{0,40}(?:prompt|instrucoes internas|instruções internas|segredo|chave de api)/i,
  /(?:system prompt|developer message|modo desenvolvedor|jailbreak)/i,
  /(?:finja|aja como).{0,50}(?:sem regras|administrador|sistema)/i,
];

const SENSITIVE_PATTERNS = [
  {
    expression: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: "[e-mail removido]",
  },
  {
    expression: /\b\d{3}[.\s-]?\d{3}[.\s-]?\d{3}[-.\s]?\d{2}\b/g,
    replacement: "[documento removido]",
  },
  { expression: /\b(?:\d[ -]*?){13,19}\b/g, replacement: "[número removido]" },
  {
    expression:
      /(?:\+?\d{1,3}[\s.-]*)?(?:\(?\d{2}\)?[\s.-]*)?\d{4,5}[\s.-]?\d{4}\b/g,
    replacement: "[telefone removido]",
  },
  {
    expression: /\b(?:senha|password|token|chave(?: de api)?)\s*[:=]\s*\S+/gi,
    replacement: "[credencial removida]",
  },
];

const STOP_WORDS = new Set([
  "a",
  "ao",
  "as",
  "com",
  "como",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "eu",
  "me",
  "o",
  "os",
  "para",
  "por",
  "qual",
  "quais",
  "que",
  "tem",
  "um",
  "uma",
  "voce",
  "voces",
]);

export class StoreAssistantError extends Error {
  constructor(message, code = "INVALID_ASSISTANT_REQUEST", status = 400) {
    super(message);
    this.name = "StoreAssistantError";
    this.code = code;
    this.status = status;
  }
}

function cleanText(value) {
  if (typeof value !== "string") {
    throw new StoreAssistantError("A mensagem deve ser um texto.");
  }
  if (value.length > MAX_MESSAGE_LENGTH) {
    throw new StoreAssistantError(
      `A mensagem deve ter no máximo ${MAX_MESSAGE_LENGTH} caracteres.`,
      "ASSISTANT_MESSAGE_TOO_LONG",
    );
  }
  const text = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text)
    throw new StoreAssistantError("Escreva uma dúvida para o assistente.");
  return text;
}

function redactSensitive(text) {
  let result = String(text || "");
  for (const { expression, replacement } of SENSITIVE_PATTERNS) {
    expression.lastIndex = 0;
    result = result.replace(expression, replacement);
  }
  return result.slice(0, MAX_MESSAGE_LENGTH);
}

function containsSensitiveData(text) {
  return SENSITIVE_PATTERNS.some(({ expression }) => {
    expression.lastIndex = 0;
    return expression.test(text);
  });
}

function editDistance(left, right, maximum) {
  if (Math.abs(left.length - right.length) > maximum) return maximum + 1;
  const matrix = Array.from({ length: left.length + 1 }, () =>
    Array(right.length + 1).fill(0),
  );
  for (let row = 0; row <= left.length; row += 1) matrix[row][0] = row;
  for (let column = 0; column <= right.length; column += 1)
    matrix[0][column] = column;

  for (let row = 1; row <= left.length; row += 1) {
    let smallest = maximum + 1;
    for (let column = 1; column <= right.length; column += 1) {
      const substitution = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + substitution,
      );
      if (
        row > 1 &&
        column > 1 &&
        left[row - 1] === right[column - 2] &&
        left[row - 2] === right[column - 1]
      ) {
        matrix[row][column] = Math.min(
          matrix[row][column],
          matrix[row - 2][column - 2] + 1,
        );
      }
      smallest = Math.min(smallest, matrix[row][column]);
    }
    if (smallest > maximum) return maximum + 1;
  }
  return matrix[left.length][right.length];
}

function hasAny(text, terms) {
  const value = normalize(text);
  const words = [...tokens(value)];
  return terms.some((rawTerm) => {
    const term = normalize(rawTerm);
    if (value.includes(term)) return true;
    // Pequenos erros de digitação são comuns no celular. A aproximação só é
    // aplicada a palavras longas, nunca a frases ou termos curtos ambíguos.
    if (term.length < 6 || term.includes(" ")) return false;
    const maximum = term.length >= 8 ? 2 : 1;
    return words.some((word) => {
      if (word.length < 6) return false;
      const candidate =
        word.length > term.length ? word.slice(0, term.length) : word;
      return editDistance(candidate, term, maximum) <= maximum;
    });
  });
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function availableSizes(product) {
  const variants = Array.isArray(product?.variants)
    ? product.variants.map(String)
    : [];
  if (!product?.variantStock) return variants;
  return variants.filter((size) => safeNumber(product.variantStock[size]) > 0);
}

function publicProduct(product) {
  return {
    id: String(product.id),
    name: String(product.name),
    price: safeNumber(product.price),
    image:
      typeof product.image === "string" && product.image.startsWith("/")
        ? product.image
        : "",
    stock: Math.floor(safeNumber(product.stock)),
  };
}

function requestedSize(text) {
  return (
    text
      .match(/(?:^|\s)(XGG|GG|PP|P|M|G)(?=\s|$|[?!.,;:])/i)?.[1]
      ?.toUpperCase() || null
  );
}

function requestedBudget(text) {
  const match =
    text.match(
      /(?:ate|até|no maximo|no máximo|orcamento|orçamento)\s*(?:de\s*)?(?:r\$\s*)?([0-9]{2,5}(?:[.,][0-9]{1,2})?)/i,
    ) || text.match(/r\$\s*([0-9]{2,5}(?:[.,][0-9]{1,2})?)/i);
  if (!match) return null;
  const value = Number(match[1].replace(".", "").replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function compactReply(value) {
  return String(value)
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 1_400);
}

export function parseAssistantPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new StoreAssistantError(
      "O corpo da solicitação deve ser um objeto JSON.",
    );
  }
  const allowed = new Set(["message", "conversationId"]);
  if (Object.keys(payload).some((key) => !allowed.has(key))) {
    throw new StoreAssistantError("O corpo contém campos não permitidos.");
  }
  const message = cleanText(payload.message);
  let conversationId = null;
  if (
    payload.conversationId !== undefined &&
    payload.conversationId !== null &&
    payload.conversationId !== ""
  ) {
    if (
      typeof payload.conversationId !== "string" ||
      !CONVERSATION_ID.test(payload.conversationId)
    ) {
      throw new StoreAssistantError(
        "conversationId inválido.",
        "INVALID_CONVERSATION_ID",
      );
    }
    conversationId = payload.conversationId;
  }
  return { message, conversationId };
}

export class StoreAssistant {
  constructor({
    catalog,
    commerce,
    config = {},
    now = () => Date.now(),
    makeConversationId = () => crypto.randomUUID(),
  }) {
    if (!catalog || typeof catalog.available !== "function")
      throw new Error("StoreAssistant requer um catálogo.");
    this.catalog = catalog;
    this.commerce = commerce || null;
    this.config = config;
    this.now = now;
    this.makeConversationId = makeConversationId;
    this.conversations = new Map();
  }

  #catalog() {
    try {
      const products =
        typeof this.catalog.availableReadOnly === "function"
          ? this.catalog.availableReadOnly()
          : this.catalog.available();
      if (!Array.isArray(products)) throw new Error("Catálogo inválido.");
      return products.filter(
        (product) => product && safeNumber(product.stock) > 0,
      );
    } catch {
      throw new StoreAssistantError(
        "Não consegui consultar o catálogo agora. Tente novamente em instantes.",
        "ASSISTANT_CATALOG_UNAVAILABLE",
        503,
      );
    }
  }

  #catalogSnapshot() {
    try {
      return { products: this.#catalog(), available: true };
    } catch (error) {
      if (
        error instanceof StoreAssistantError &&
        error.code === "ASSISTANT_CATALOG_UNAVAILABLE"
      ) {
        return { products: [], available: false };
      }
      throw error;
    }
  }

  status() {
    const snapshot = this.#catalogSnapshot();
    return {
      available: true,
      catalogAvailable: snapshot.available,
      mode: "local-read-only",
    };
  }

  #conversationKey(principal, conversationId) {
    const owner = String(principal || "anonymous").slice(0, 160);
    return crypto
      .createHash("sha256")
      .update(`${owner}\n${conversationId}`)
      .digest("hex");
  }

  #cleanup(timestamp) {
    for (const [key, conversation] of this.conversations) {
      if (timestamp - conversation.updatedAt > CONVERSATION_TTL_MS)
        this.conversations.delete(key);
    }
    if (this.conversations.size < MAX_CONVERSATIONS) return;
    const oldest = [...this.conversations.entries()]
      .sort((left, right) => left[1].updatedAt - right[1].updatedAt)
      .slice(0, Math.max(1, this.conversations.size - MAX_CONVERSATIONS + 1));
    for (const [key] of oldest) this.conversations.delete(key);
  }

  #remember(key, role, content, timestamp) {
    const conversation = this.conversations.get(key) || {
      entries: [],
      updatedAt: timestamp,
    };
    conversation.entries.push({
      role,
      content: redactSensitive(content).slice(0, MAX_MESSAGE_LENGTH),
    });
    conversation.entries = conversation.entries.slice(-MAX_HISTORY_ENTRIES);
    conversation.updatedAt = timestamp;
    this.conversations.set(key, conversation);
  }

  #contextProduct(products, entries) {
    for (const entry of [...entries].reverse()) {
      const text = normalize(entry.content);
      const found = products.find(
        (product) =>
          text.includes(normalize(product.id)) ||
          text.includes(normalize(product.name)),
      );
      if (found) return found;
    }
    return null;
  }

  #findProducts(rawText, products, entries = []) {
    const text = normalize(rawText);
    const exact = products.filter(
      (product) =>
        text.includes(normalize(product.id)) ||
        text.includes(normalize(product.name)),
    );
    if (exact.length) return exact;

    const budget = requestedBudget(text);
    const wantsScrub = /\bscrubs?\b/.test(text);
    const wantsCoat = /\bjalecos?\b/.test(text);
    const wantedTokens = [...tokens(text)].filter(
      (token) => token.length > 2 && !STOP_WORDS.has(token),
    );
    let ranked = products.map((product, index) => {
      const choices = [
        product.id,
        product.name,
        product.description,
        product.category,
        ...(product.keywords || []),
        ...(product.features || []),
        ...(product.fits || []),
        ...(product.colors || []).map((color) => color?.name || color),
      ];
      const haystack = normalize(choices.join(" "));
      let score = wantedTokens.reduce(
        (sum, word) => sum + (haystack.includes(word) ? 1 : 0),
        0,
      );
      if (wantsScrub && normalize(product.category).includes("scrub"))
        score += 5;
      if (wantsCoat && normalize(product.category).includes("jaleco"))
        score += 5;
      if (budget !== null && safeNumber(product.price) <= budget) score += 3;
      return { product, score, index };
    });

    if (budget !== null)
      ranked = ranked.filter(
        ({ product }) => safeNumber(product.price) <= budget,
      );
    if (
      hasAny(text, [
        "mais barato",
        "mais barata",
        "economico",
        "economica",
        "econômico",
        "econômica",
        "menor preco",
        "menor preço",
      ])
    ) {
      ranked.sort(
        (left, right) =>
          safeNumber(left.product.price) - safeNumber(right.product.price) ||
          right.score - left.score,
      );
      return ranked.map(({ product }) => product).slice(0, 3);
    }
    ranked.sort(
      (left, right) => right.score - left.score || left.index - right.index,
    );
    const relevant = ranked
      .filter(({ score }) => score > 0)
      .map(({ product }) => product);
    if (relevant.length) return relevant.slice(0, 3);

    const context = this.#contextProduct(products, entries);
    return context ? [context] : [];
  }

  #whatsappAction(label = "Falar com a equipe") {
    try {
      const value = this.commerce?.publicConfig?.();
      const url = value?.whatsappUrl;
      if (!value?.whatsappAvailable || typeof url !== "string") return null;
      const parsed = new URL(url);
      if (
        parsed.protocol !== "https:" ||
        !["wa.me", "api.whatsapp.com"].includes(parsed.hostname)
      )
        return null;
      return { type: "whatsapp", url: parsed.toString(), label };
    } catch {
      return null;
    }
  }

  #result(conversationId, reply, { suggestions, products, action } = {}) {
    return {
      reply: compactReply(reply),
      ...(Array.isArray(suggestions) && suggestions.length
        ? {
            suggestions: suggestions
              .slice(0, 4)
              .map((item) => String(item).slice(0, 80)),
          }
        : {}),
      ...(Array.isArray(products) && products.length
        ? { products: products.slice(0, 3).map(publicProduct) }
        : {}),
      ...(action ? { action } : {}),
      conversationId,
    };
  }

  #catalogUnavailableResult(conversationId) {
    const action = this.#whatsappAction("Consultar com a equipe");
    return this.#result(
      conversationId,
      action
        ? "Não consegui consultar preços, tamanhos e estoque ao vivo neste instante. Tente novamente em alguns momentos ou use o WhatsApp oficial para confirmar a disponibilidade. Ainda posso explicar como funciona a compra, a personalização e os cuidados gerais."
        : "Não consegui consultar preços, tamanhos e estoque ao vivo neste instante, e o link do atendimento humano também está temporariamente indisponível. Tente novamente em alguns momentos. Ainda posso explicar como funciona a compra, a personalização e os cuidados gerais.",
      {
        suggestions: [
          "Como funciona a compra?",
          "Como escolher o tamanho?",
          "Como cuidar da peça?",
          "Tentar consultar o catálogo novamente",
        ],
        action,
      },
    );
  }

  #answerPolicy(text, conversationId) {
    const handoff = this.#whatsappAction("Confirmar com a equipe");
    if (
      hasAny(text, [
        "como funciona o pedido",
        "como funciona a compra",
        "como comprar",
        "reserva",
        "reservar",
        "carrinho",
        "finalizar compra",
        "fechar pedido",
      ])
    ) {
      let minutes = null;
      try {
        const configured = Number(
          this.commerce?.publicConfig?.().reservationTtlMinutes,
        );
        if (
          Number.isInteger(configured) &&
          configured >= 5 &&
          configured <= 1_440
        )
          minutes = configured;
      } catch {
        // A duração é opcional na explicação; nunca inventamos um valor.
      }
      return this.#result(
        conversationId,
        `Escolha o produto, personalize as opções disponíveis e adicione-o à sacola. Ao finalizar, o servidor revalida preço e estoque e cria a reserva${minutes ? ` por ${minutes} minutos` : " pelo período configurado"}. ${handoff ? "Depois, o site abre o WhatsApp oficial para a equipe continuar com prazo, entrega e pagamento." : "A continuação normalmente ocorre no WhatsApp oficial, mas o link direto está temporariamente indisponível; tente novamente antes de finalizar."} O assistente não pede dados de cartão.`,
        {
          suggestions: [
            "Quero ver os produtos",
            "Posso personalizar?",
            "Como escolher o tamanho?",
          ],
          action: handoff,
        },
      );
    }
    if (
      hasAny(text, [
        "como escolher o tamanho",
        "como saber meu tamanho",
        "como medir",
        "qual tamanho uso",
        "tamanho ideal",
      ]) ||
      (hasAny(text, ["altura", "peso"]) &&
        hasAny(text, ["tamanho", "veste", "vestir"]))
    ) {
      return this.#result(
        conversationId,
        "Use o guia de medidas e compare as medidas com uma peça que veste bem. Como a tabela numérica específica de cada modelo não está cadastrada no assistente, não vou indicar um tamanho apenas por altura ou peso.",
        {
          suggestions: [
            "Quais tamanhos estão disponíveis?",
            "Quero ver os produtos",
          ],
          action: { type: "size-guide", label: "Abrir guia de medidas" },
        },
      );
    }
    if (
      hasAny(text, [
        "lavar",
        "lavagem",
        "cuidado",
        "cuidados",
        "conservar",
        "passar",
        "secadora",
        "alvejante",
      ])
    ) {
      return this.#result(
        conversationId,
        "A etiqueta interna de cada peça é a orientação principal de conservação. Antes de lavar ou passar, confira os símbolos da etiqueta e não use temperatura, alvejante ou secadora sem essa indicação. Se houver personalização, confirme os cuidados específicos com a equipe.",
        {
          suggestions: [
            "Fale sobre o tecido",
            "Como escolher o tamanho?",
            "Quero ver os produtos",
          ],
          action: this.#whatsappAction("Confirmar cuidados específicos"),
        },
      );
    }
    if (
      hasAny(text, [
        "pagamento",
        "pagar",
        "pix",
        "cartao",
        "cartão",
        "parcel",
        "boleto",
      ])
    ) {
      return this.#result(
        conversationId,
        `As formas e condições de pagamento não estão publicadas na configuração da loja. ${handoff ? "A equipe confirma tudo pelo WhatsApp antes do pagamento." : "O link direto para confirmar com a equipe está temporariamente indisponível; tente novamente mais tarde."} Por segurança, não envie número de cartão, senha ou código de verificação neste chat.`,
        {
          suggestions: ["Como funciona o pedido?", "Quero ver os produtos"],
          action: handoff,
        },
      );
    }
    if (
      hasAny(text, [
        "troca",
        "trocar",
        "devolucao",
        "devolução",
        "reembolso",
        "garantia",
      ])
    ) {
      return this.#result(
        conversationId,
        "Não há uma política detalhada de troca ou devolução cadastrada para eu confirmar prazos ou condições aqui. Consulte os Termos do site e confirme o seu caso com a equipe, sem enviar dados pessoais neste chat.",
        {
          suggestions: ["Como funciona o pedido?", "Falar sobre tamanhos"],
          action: handoff,
        },
      );
    }
    if (
      hasAny(text, [
        "prazo",
        "entrega",
        "frete",
        "envio",
        "quando chega",
        "retirada",
        "cep",
      ])
    ) {
      return this.#result(
        conversationId,
        `O prazo e as condições de entrega dependem do destino e da disponibilidade confirmada. Esses dados não estão definidos no catálogo. ${handoff ? "A equipe informa o prazo correto pelo WhatsApp antes do pagamento." : "O link direto do atendimento está temporariamente indisponível; tente novamente mais tarde para confirmar o prazo."} Não envie endereço ou CEP neste chat.`,
        {
          suggestions: ["Ver produtos disponíveis", "Como funciona a reserva?"],
          action: handoff,
        },
      );
    }
    if (
      hasAny(text, [
        "horario",
        "horário",
        "funcionamento",
        "atendimento",
        "abre",
        "fecha",
      ])
    ) {
      const configured = String(this.config.businessHours || "").trim();
      const known = configured.match(
        /^seg-sex\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/i,
      );
      const hours = known
        ? `O horário configurado para atendimento é de segunda a sexta, das ${known[1]} às ${known[2]}.`
        : configured
          ? `O horário configurado para atendimento é: ${redactSensitive(configured).slice(0, 100)}.`
          : "O horário de atendimento ainda não está publicado na configuração da loja.";
      return this.#result(conversationId, hours, {
        suggestions: ["Quero ver os produtos", "Falar com a equipe"],
        action: handoff,
      });
    }
    if (
      hasAny(text, [
        "endereco",
        "endereço",
        "localizacao",
        "localização",
        "onde fica",
        "loja fisica",
        "loja física",
      ])
    ) {
      return this.#result(
        conversationId,
        "O endereço da loja não está publicado na configuração atual. Para não indicar um local incorreto, confirme diretamente com a equipe.",
        {
          suggestions: ["Ver catálogo", "Como funciona a entrega?"],
          action: handoff,
        },
      );
    }
    return null;
  }

  #answerFabric(text, conversationId, products, entries) {
    const relevant = this.#findProducts(text, products, entries);
    const selected = relevant.length ? relevant : products;
    const asksUnsupported = hasAny(text, [
      "antimicrob",
      "impermeav",
      "composicao",
      "composição",
      "gramatura",
      "algodao",
      "algodão",
      "poliester",
      "poliéster",
      "protecao uv",
      "proteção uv",
      "nao amassa",
      "não amassa",
    ]);
    if (asksUnsupported) {
      return this.#result(
        conversationId,
        "Essa propriedade não está informada no catálogo atual. Não vou atribuir composição, gramatura, proteção antimicrobiana, impermeabilidade ou certificações sem uma ficha técnica oficial. A equipe pode confirmar o dado correto pelo WhatsApp.",
        {
          suggestions: ["Fale sobre o tecido", "Quero ver os modelos"],
          products: relevant,
          action: this.#whatsappAction("Pedir a ficha técnica"),
        },
      );
    }

    if (
      hasAny(text, [
        "laser",
        "corte",
        "recorte",
        "tecnologia",
        "tecnologico",
        "tecnológico",
      ])
    ) {
      const laserProducts = selected.filter(
        (product) => product.laserCut === true,
      );
      const names = laserProducts
        .slice(0, 3)
        .map((product) => product.name)
        .join(", ");
      const claim = names
        ? `No catálogo atual, ${names}${laserProducts.length > 3 ? " e outros modelos" : ""} têm corte a laser informado.`
        : "Não encontrei um produto com corte a laser informado no estoque atual.";
      return this.#result(
        conversationId,
        `${claim} O recurso é usado para obter precisão nos painéis e recortes do produto. Ele não comprova, sozinho, composição, impermeabilidade ou proteção antimicrobiana.`,
        {
          suggestions: [
            "Fale sobre o tecido",
            "Quais modelos estão disponíveis?",
            "Posso personalizar?",
          ],
          products: laserProducts,
        },
      );
    }

    const fabricFeatures = [];
    for (const product of selected) {
      for (const feature of product.features || []) {
        if (
          /tecido|toque|flex|confort|leve|fluidez|macio|suave/i.test(feature)
        ) {
          fabricFeatures.push(`${feature} — ${product.name}`);
        }
      }
    }
    const unique = [...new Set(fabricFeatures)].slice(0, 4);
    const description = unique.length
      ? `Os atributos registrados no catálogo são: ${unique.join("; ")}.`
      : "O catálogo atual não traz uma ficha técnica completa do tecido.";
    return this.#result(
      conversationId,
      `${description} Composição, gramatura e certificações não estão cadastradas, então esses pontos precisam ser confirmados com a equipe.`,
      {
        suggestions: ["Como funciona o corte a laser?", "Quero ver os modelos"],
        products: relevant,
        action: this.#whatsappAction("Confirmar detalhes do tecido"),
      },
    );
  }

  #answerSize(text, conversationId, products, entries) {
    const relevant = this.#findProducts(text, products, entries);
    const size = requestedSize(text);
    if (relevant.length === 1) {
      const product = relevant[0];
      const sizes = availableSizes(product);
      if (size) {
        const canonical = sizes.find(
          (entry) => normalize(entry) === normalize(size),
        );
        const reply = canonical
          ? `${product.name} está disponível no tamanho ${canonical} neste momento. O estoque será revalidado ao adicionar e novamente ao reservar o pedido.`
          : `${product.name} não aparece com estoque no tamanho ${size} agora. As opções disponíveis são: ${sizes.join(", ") || "nenhuma"}.`;
        return this.#result(conversationId, reply, {
          suggestions: ["Personalizar este produto", "Ver outro modelo"],
          products: [product],
          action: canonical
            ? {
                type: "product",
                productId: String(product.id),
                label: `Personalizar ${product.name}`,
              }
            : { type: "size-guide", label: "Abrir guia de medidas" },
        });
      }
      return this.#result(
        conversationId,
        `${product.name} tem estes tamanhos com estoque no momento: ${sizes.join(", ") || "nenhum"}. A loja ainda não possui uma tabela de medidas numéricas cadastrada; por isso não vou indicar um tamanho apenas por altura ou peso.`,
        {
          suggestions: ["Como medir meu corpo?", "Posso trocar o tamanho?"],
          products: [product],
          action: { type: "size-guide", label: "Abrir guia de medidas" },
        },
      );
    }

    if (size) {
      const matching = products
        .filter((product) =>
          availableSizes(product).some(
            (entry) => normalize(entry) === normalize(size),
          ),
        )
        .slice(0, 3);
      return this.#result(
        conversationId,
        matching.length
          ? `Encontrei ${matching.length} ${matching.length === 1 ? "opção" : "opções"} com estoque no tamanho ${size}. Escolha um modelo para conferir cores e modelagem.`
          : `Não encontrei produto com estoque no tamanho ${size} neste momento.`,
        {
          suggestions: ["Ver todos os produtos", "Como escolher meu tamanho?"],
          products: matching,
          action: { type: "size-guide", label: "Abrir guia de medidas" },
        },
      );
    }

    return this.#result(
      conversationId,
      "Para escolher com segurança, use o guia de medidas e compare com uma peça que veste bem. Como não há medidas numéricas cadastradas no catálogo, não vou adivinhar o tamanho com base somente em altura, peso ou profissão.",
      {
        suggestions: [
          "Quais tamanhos estão disponíveis?",
          "Falar com a equipe",
        ],
        action: { type: "size-guide", label: "Abrir guia de medidas" },
      },
    );
  }

  #answerPersonalization(text, conversationId, products, entries) {
    const relevant = this.#findProducts(text, products, entries);
    const personalized = (relevant.length ? relevant : products).filter(
      (product) => product.personalizable === true,
    );
    if (
      /\b(?:logo|logotipo|simbolo|símbolo)\b/.test(text) ||
      text.includes("imagem bordada")
    ) {
      return this.#result(
        conversationId,
        "A personalização com logotipo ou imagem não está disponível como opção cadastrada no site. O personalizador atual aceita nome e profissão; consulte a equipe para saber se um projeto especial é possível.",
        {
          suggestions: ["Personalizar com nome", "Ver modelos"],
          products: personalized,
          action: this.#whatsappAction("Consultar personalização especial"),
        },
      );
    }
    if (!personalized.length) {
      return this.#result(
        conversationId,
        "Não encontrei um item personalizável com estoque agora.",
        {
          suggestions: ["Ver catálogo", "Falar com a equipe"],
          action: this.#whatsappAction(),
        },
      );
    }
    const product = personalized[0];
    const colors = (product.colors || [])
      .map((color) => color?.name || color)
      .filter(Boolean);
    const fits = (product.fits || []).map(String);
    return this.#result(
      conversationId,
      `O personalizador permite escolher tamanho${colors.length ? `, cor (${colors.join(", ")})` : ""}${fits.length ? ` e modelagem (${fits.join(", ")})` : ""}, além de informar nome e profissão para o bordado. Valor e prazo de qualquer personalização adicional não estão publicados e devem ser confirmados antes do pagamento.`,
      {
        suggestions: ["Escolher tamanho", "Como funciona o tecido?"],
        products: personalized,
        action: {
          type: "product",
          productId: String(product.id),
          label: `Personalizar ${product.name}`,
        },
      },
    );
  }

  #answerProducts(text, conversationId, products, entries) {
    const found = this.#findProducts(text, products, entries);
    if (!products.length) {
      return this.#result(
        conversationId,
        "O catálogo está sem produtos disponíveis neste momento.",
        {
          suggestions: ["Falar com a equipe"],
          action: this.#whatsappAction(),
        },
      );
    }
    if (!found.length) {
      const options = products.slice(0, 3);
      return this.#result(
        conversationId,
        "Estas são algumas opções com estoque agora. Posso filtrar por jaleco, scrub, cor, modelagem ou orçamento.",
        {
          suggestions: [
            "Quero um jaleco",
            "Quero um scrub",
            "Qual é o mais acessível?",
          ],
          products: options,
          action: {
            type: "product",
            productId: String(options[0].id),
            label: `Ver ${options[0].name}`,
          },
        },
      );
    }
    if (
      found.length >= 2 &&
      hasAny(text, ["comparar", "compare", "diferenca", "qual a diferenca", "qual e melhor"])
    ) {
      const comparison = found.slice(0, 3).map((product) => {
        const features = Array.isArray(product.features)
          ? product.features.slice(0, 2).join(", ")
          : "atributos cadastrados no catálogo";
        const fits = Array.isArray(product.fits) && product.fits.length
          ? ` Modelagem: ${product.fits.join(", ")}.`
          : "";
        return `${product.name}: ${money(safeNumber(product.price))}, ${features}.${fits}`;
      });
      return this.#result(
        conversationId,
        `Comparei os modelos disponíveis pelo catálogo atual:\n\n${comparison.join("\n") }\n\nA melhor escolha depende do caimento e dos recursos que você prefere. O estoque e o preço são revalidados antes da reserva.`,
        {
          suggestions: ["Ver tamanhos disponíveis", "Posso personalizar?", "Falar com a equipe"],
          products: found.slice(0, 3),
          action: {
            type: "product",
            productId: String(found[0].id),
            label: `Ver ${found[0].name}`,
          },
        },
      );
    }
    const cheapest = hasAny(text, [
      "mais barato",
      "mais barata",
      "economico",
      "econômico",
      "menor preco",
      "menor preço",
    ]);
    const budget = requestedBudget(text);
    const explanation = cheapest
      ? `A opção de menor preço entre os itens compatíveis e disponíveis é ${found[0].name}, por ${money(safeNumber(found[0].price))}.`
      : budget !== null
        ? `Encontrei ${found.length} ${found.length === 1 ? "opção disponível" : "opções disponíveis"} dentro do orçamento informado.`
        : `Encontrei ${found.length} ${found.length === 1 ? "opção disponível" : "opções disponíveis"} com base no que você pediu.`;
    return this.#result(
      conversationId,
      `${explanation} Preço e estoque vêm do catálogo atual e são revalidados ao reservar.`,
      {
        suggestions: [
          "Quais tamanhos têm estoque?",
          "Posso personalizar?",
          "Comparar com outro modelo",
        ],
        products: found,
        action: {
          type: "product",
          productId: String(found[0].id),
          label: `Ver ${found[0].name}`,
        },
      },
    );
  }

  answer(payload, { principal = "anonymous" } = {}) {
    const parsed = parseAssistantPayload(payload);
    const timestamp = this.now();
    this.#cleanup(timestamp);
    const conversationId = parsed.conversationId || this.makeConversationId();
    if (!CONVERSATION_ID.test(conversationId))
      throw new Error("makeConversationId retornou um valor inválido.");
    const key = this.#conversationKey(principal, conversationId);
    const entries = this.conversations.get(key)?.entries || [];
    const text = normalize(parsed.message);
    let result;

    if (containsSensitiveData(parsed.message)) {
      result = this.#result(
        conversationId,
        "Para proteger você, não cole nome completo, telefone, e-mail, CPF, endereço, dados de cartão, senhas ou códigos neste chat. O dado enviado não será repetido na resposta. Para concluir um pedido, use o fluxo seguro do site ou fale no WhatsApp oficial.",
        {
          suggestions: ["Ver produtos", "Como funciona o pedido?"],
          action: this.#whatsappAction("Abrir o WhatsApp oficial"),
        },
      );
      this.#remember(
        key,
        "user",
        "[mensagem com dado sensível removido]",
        timestamp,
      );
      this.#remember(key, "assistant", result.reply, timestamp);
      return result;
    }

    if (INJECTION_PATTERNS.some((pattern) => pattern.test(parsed.message))) {
      result = this.#result(
        conversationId,
        "Posso responder somente sobre produtos, estoque, personalização, tamanhos e atendimento da Surgery For Life. Não acesso prompts internos, credenciais, sistemas administrativos ou dados de outros clientes.",
        {
          suggestions: [
            "Ver produtos",
            "Fale sobre o tecido",
            "Como escolher o tamanho?",
          ],
        },
      );
      this.#remember(key, "user", "[instrução externa ignorada]", timestamp);
      this.#remember(key, "assistant", result.reply, timestamp);
      return result;
    }

    const catalogSnapshot = this.#catalogSnapshot();
    const products = catalogSnapshot.products;
    if (
      /\b(oi+|ola|olá|bom dia|boa tarde|boa noite|ajuda|o que voce faz|o que você faz)\b/.test(
        text,
      )
    ) {
      result = this.#result(
        conversationId,
        `Olá! Sou o assistente virtual da ${String(this.config.storeName || "Surgery For Life").slice(0, 80)}. Posso consultar o catálogo e o estoque atuais, explicar as opções registradas de tecido, corte a laser e personalização, ou orientar sobre tamanhos sem pedir dados pessoais.`,
        {
          suggestions: [
            "Quero ver os produtos",
            "Fale sobre o tecido",
            "Como escolher o tamanho?",
          ],
        },
      );
    } else if (
      hasAny(text, [
        "atendente",
        "humano",
        "falar com alguem",
        "falar com alguém",
        "whatsapp",
        "contato",
      ])
    ) {
      const action = this.#whatsappAction("Continuar no WhatsApp");
      result = this.#result(
        conversationId,
        action
          ? "Claro. Use o botão abaixo para abrir o WhatsApp oficial da Surgery For Life. Não envie cartão, senha ou código de verificação."
          : "O WhatsApp oficial ainda não está disponível na configuração da loja. Tente novamente mais tarde.",
        { suggestions: ["Ver produtos", "Tirar uma dúvida"], action },
      );
    } else {
      result = this.#answerPolicy(text, conversationId);
      if (
        !result &&
        !catalogSnapshot.available &&
        hasAny(text, [
          "tecido",
          "laser",
          "corte",
          "tecnologia",
          "tamanho",
          "medida",
          "personal",
          "bordad",
          "produto",
          "catalogo",
          "jaleco",
          "scrub",
          "modelo",
          "comprar",
          "preco",
          "estoque",
          "disponivel",
        ])
      ) {
        result = this.#catalogUnavailableResult(conversationId);
      }
      if (
        !result &&
        hasAny(text, [
          "tecido",
          "laser",
          "corte",
          "recorte",
          "tecnologia",
          "tecnologico",
          "tecnológico",
          "antimicrob",
          "impermeav",
          "composicao",
          "composição",
          "gramatura",
        ])
      ) {
        result = this.#answerFabric(text, conversationId, products, entries);
      }
      if (
        !result &&
        (hasAny(text, ["tamanho", "medida", "veste", "altura", "peso"]) ||
          requestedSize(text))
      ) {
        result = this.#answerSize(text, conversationId, products, entries);
      }
      if (
        !result &&
        (hasAny(text, [
          "personal",
          "bordad",
          "nome no",
          "profissao",
          "profissão",
        ]) ||
          /\b(?:logo|logotipo)\b/.test(text))
      ) {
        result = this.#answerPersonalization(
          text,
          conversationId,
          products,
          entries,
        );
      }
      if (
        !result &&
        hasAny(text, [
          "produto",
          "catalogo",
          "catálogo",
          "jaleco",
          "scrub",
          "modelo",
          "comprar",
          "preco",
          "preço",
          "barato",
          "cor",
          "recomenda",
          "opcao",
          "opção",
          "disponivel",
          "disponível",
          "estoque",
        ])
      ) {
        result = this.#answerProducts(text, conversationId, products, entries);
      }
      if (!result) {
        const contextProduct = this.#contextProduct(products, entries);
        const handoff = this.#whatsappAction("Perguntar à equipe");
        result = contextProduct
          ? this.#result(
              conversationId,
              `Posso continuar ajudando sobre ${contextProduct.name}: estoque por tamanho, cores, modelagem, tecido informado ou personalização. Para assuntos não publicados, encaminho ao WhatsApp oficial.`,
              {
                suggestions: [
                  "Quais tamanhos têm estoque?",
                  "Fale sobre o tecido",
                  "Posso personalizar?",
                ],
                products: [contextProduct],
                action: {
                  type: "product",
                  productId: String(contextProduct.id),
                  label: `Ver ${contextProduct.name}`,
                },
              },
            )
          : this.#result(
              conversationId,
              handoff
                ? "Ainda não consegui identificar a dúvida. Posso ajudar com produtos, estoque, tamanhos, tecido, corte a laser, personalização, entrega ou atendimento. Para outro assunto, fale com a equipe sem enviar dados pessoais neste chat."
                : "Ainda não consegui identificar a dúvida. Posso ajudar com produtos, estoque, tamanhos, tecido, corte a laser, personalização, entrega ou cuidados com a peça. O link do atendimento humano está temporariamente indisponível; tente novamente em alguns momentos.",
              {
                suggestions: [
                  "Quero ver os produtos",
                  "Fale sobre o tecido",
                  "Como escolher o tamanho?",
                  "Falar com a equipe",
                ],
                action: handoff,
              },
            );
      }
    }

    const contextIds = Array.isArray(result.products)
      ? result.products
          .map((product) => String(product?.id || "").slice(0, 64))
          .filter(Boolean)
      : [];
    this.#remember(
      key,
      "user",
      contextIds.length
        ? `[contexto de produto: ${contextIds.join(", ")}]`
        : "[intenção comercial processada]",
      timestamp,
    );
    this.#remember(key, "assistant", result.reply, timestamp);
    return result;
  }
}
