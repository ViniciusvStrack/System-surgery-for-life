import fs from "node:fs";
import crypto from "node:crypto";
import { makeOrderId, money, normalize } from "./utils.js";
import { hashPrincipal } from "./commerce.js";

const MENU = "*Menu da loja*\n\n1. Ver catálogo\n2. Buscar produto\n3. Ver carrinho\n4. Acompanhar pedido\n5. Dúvidas frequentes\n6. Falar com atendente\n\nVocê também pode escrever o nome do produto que procura.";

function hasAny(text, expressions) {
  return expressions.some((expression) => text.includes(expression));
}

const NUMBER_WORDS = new Map([
  ["um", 1],
  ["uma", 1],
  ["dois", 2],
  ["duas", 2],
  ["tres", 3],
  ["quatro", 4],
  ["cinco", 5],
  ["seis", 6],
  ["sete", 7],
  ["oito", 8],
  ["nove", 9],
  ["dez", 10],
]);

function requestedQuantity(text) {
  const numeric = text.match(/\b\d+\b/);
  if (numeric) return Number(numeric[0]);
  return NUMBER_WORDS.get(normalize(text)) || null;
}

function matches(text, expressions) {
  return expressions.some((expression) =>
    text === expression || text.startsWith(`${expression} `),
  );
}

function conversationalIntent(text) {
  // Intenções sociais aceitam frases completas, não apenas comandos exatos.
  if (hasAny(text, ["obrigado", "obrigada", "valeu", "agradeco", "agradeço"])) return "thanks";
  if (hasAny(text, ["tchau", "ate logo", "até logo", "ate mais", "até mais", "bom trabalho"])) return "bye";
  if (hasAny(text, ["quem e voce", "quem é você", "voce e robo", "você é robô", "quem estou falando"])) return "identity";
  if (hasAny(text, ["quais as opcoes", "quais opções", "quais opcoes", "o que voces tem", "o que vocês têm", "como funciona", "pode me ajudar", "preciso de ajuda"])) return "options";
  if (/\b(oi+|ola|olá|opa|e ai|e aí|bom dia|boa tarde|boa noite)\b/.test(text)) return "greeting";
  if (hasAny(text, ["tudo bem", "tudo bom", "como voce esta", "como você está", "como vai"])) return "wellbeing";
  return null;
}

export class StoreBot {
  constructor({ catalog, sessions, orders, commerce = null, faqFile, config }) {
    this.catalog = catalog;
    this.sessions = sessions;
    this.orders = orders;
    this.commerce = commerce;
    this.faqs = JSON.parse(fs.readFileSync(faqFile, "utf8"));
    this.config = config;
  }

  session(user) {
    const all = this.sessions.read();
    all[user] ??= { stage: "idle", cart: [], favorites: [], updatedAt: new Date().toISOString() };
    all[user].cart ??= [];
    all[user].favorites ??= [];
    return { all, value: all[user] };
  }

  save(user, all, session) {
    session.updatedAt = new Date().toISOString();
    all[user] = session;
    this.sessions.write(all);
  }

  cartSummary(session, includeInstructions = true) {
    if (!session.cart.length) return "Seu carrinho está vazio.";
    const lines = session.cart.map((item, i) => `${i + 1}. ${item.name} (${item.variant}) × ${item.qty} — ${money(item.price * item.qty)}`);
    const subtotal = session.cart.reduce((sum, item) => sum + item.price * item.qty, 0);
    lines.push(`\n*Subtotal: ${money(subtotal)}*`);
    if (includeInstructions) lines.push("\nDigite *finalizar*, *alterar 1 3*, *remover 1*, *limpar carrinho* ou *observação seu texto*. Nenhum pagamento será solicitado pelo bot.");
    return lines.join("\n");
  }

  productList(products, numbered = false) {
    const list = products.map((p, index) => `${numbered ? `*${index + 1}. ${p.name}*` : `*${p.name}*`}\n${p.description}\n${money(p.price)} | opções: ${p.variants.join(", ")}`).join("\n\n");
    return list + (numbered ? "\n\nResponda apenas com o *número do produto* que deseja." : "");
  }

  async handle(user, rawText, profileName = "Cliente") {
    const text = rawText.trim();
    const n = normalize(text);
    const { all, value: s } = this.session(user);
    const finish = (messages, extra = {}) => { this.save(user, all, s); return { messages: Array.isArray(messages) ? messages : [messages], ...extra }; };

    const webOrderCode = text.match(/\bPED-\d{8}-[A-Z0-9]{6,20}\b/i)?.[0];
    const webHandoffToken = text.match(/\bSFLH_([A-Za-z0-9_-]{43})\b/)?.[1];
    if (this.commerce && webOrderCode && webHandoffToken) {
      try {
        const claimed = this.commerce.claimWebOrder(webOrderCode, webHandoffToken, user);
        s.lastOrderId = claimed.order.code;
        s.stage = "human";
        return finish(
          `Reserva *${claimed.order.code}* localizada e vinculada a este WhatsApp. ✅\n\nNossa equipe recebeu o aviso e continuará com prazo, entrega e pagamento.`,
          { handoff: !claimed.replayed },
        );
      } catch (error) {
        const message = error.code === "RESERVATION_EXPIRED"
          ? "Esta reserva expirou. Volte ao site, atualize a disponibilidade e gere um novo pedido."
          : "Não consegui validar este código de conexão. Abra novamente o WhatsApp pelo botão do pedido no site.";
        return finish(message);
      }
    }

    // Conversa informal é interpretada somente fora de formulários do pedido.
    // Assim, um endereço como "Rua Boa Vista" não é confundido com uma saudação.
    if (["idle", "search"].includes(s.stage)) {
      const social = conversationalIntent(n);
      if (social === "thanks") return finish("Por nada! 😊 Foi um prazer ajudar. Se precisar de mais alguma coisa, é só chamar ou digitar *menu*.");
      if (social === "bye") return finish(`Até logo! A *${this.config.storeName}* agradece o contato. 👋`);
      if (social === "identity") return finish(`Sou o assistente virtual da *${this.config.storeName}*. Posso apresentar produtos, montar seu carrinho, registrar pedidos e chamar um atendente quando necessário. Não realizo pagamentos.`);
      if (["options", "wellbeing", "greeting"].includes(social)) {
        s.stage = "idle";
        const introduction = social === "wellbeing"
          ? "Tudo ótimo, obrigado por perguntar! 😊 Espero que você também esteja bem."
          : social === "greeting"
            ? `Olá, ${profileName}! Tudo bem? 😊 Seja bem-vindo à *${this.config.storeName}*.`
            : "Claro! Estas são as opções disponíveis:";
        return finish(`${introduction}\n\n${MENU}`);
      }
    }

    // Comandos globais funcionam em qualquer etapa da conversa.
    if (matches(n, ["menu", "inicio", "oi", "ola", "bom dia", "boa tarde", "boa noite", "ajuda", "opcoes", "voltar"])) {
      s.stage = "idle";
      return finish(`Olá, ${profileName}! Eu sou o assistente da *${this.config.storeName}*. 🛍️\n\n${MENU}`);
    }
    if (["cancelar", "cancelar pedido"].includes(n)) { s.stage = "idle"; s.pending = null; s.checkout = null; s.checkoutKey = null; return finish("Operação cancelada. Seu carrinho foi mantido.\n\n" + MENU); }
    if (hasAny(n, ["atendente", "humano", "falar com atendente", "falar com alguem", "falar com uma pessoa", "quero falar com a equipe"]) || (n === "6" && s.stage === "idle")) {
      s.stage = "human";
      return finish("Certo! Encaminhei sua conversa para nossa equipe. Um atendente responderá assim que possível.", { handoff: true });
    }
    if (s.stage === "human") return finish("Sua conversa está aguardando atendimento humano. Digite *menu* para voltar ao atendimento automático.");
    if (["carrinho", "ver carrinho"].includes(n) || (n === "3" && s.stage === "idle")) return finish(this.cartSummary(s));

    if (["limpar carrinho", "esvaziar carrinho"].includes(n)) {
      if (!s.cart.length) return finish("Seu carrinho já está vazio.");
      s.cart = []; s.pending = null; s.checkout = null; s.checkoutKey = null; s.orderNote = null; s.stage = "idle";
      return finish("Carrinho esvaziado com sucesso. Digite *catálogo* para começar novamente.");
    }

    const change = n.match(/^alterar\s+(\d+)\s+(\d+)$/);
    if (change) {
      const index = Number(change[1]) - 1; const qty = Number(change[2]); const item = s.cart[index];
      if (!item) return finish("Esse item não existe no carrinho.\n" + this.cartSummary(s));
      const product = this.catalog.byId(item.productId);
      const otherVariants = s.cart.filter((x, i) => i !== index && x.productId === item.productId).reduce((sum, x) => sum + x.qty, 0);
      const limit = product.variantStock ? this.catalog.stockFor(product, item.variant) : product.stock - otherVariants;
      if (qty < 1 || qty > limit) return finish(`A quantidade dessa opção deve ficar entre 1 e ${limit}.`);
      item.qty = qty;
      return finish(`Quantidade de ${item.name} alterada para ${qty}.\n\n${this.cartSummary(s)}`);
    }

    const note = text.match(/^observa(?:ç|c)[aã]o\s+(.+)$/i);
    if (note) {
      if (!s.cart.length) return finish("Adicione um produto antes de incluir uma observação.");
      s.orderNote = note[1].trim().slice(0, 300);
      return finish(`Observação salva: “${s.orderNote}”.`);
    }

    const remove = n.match(/^remover\s+(\d+)$/);
    if (remove) {
      const index = Number(remove[1]) - 1;
      if (!s.cart[index]) return finish("Esse item não existe no carrinho.\n" + this.cartSummary(s));
      const [removed] = s.cart.splice(index, 1);
      return finish(`${removed.name} foi removido.\n\n${this.cartSummary(s)}`);
    }

    if (["favoritos", "meus favoritos"].includes(n)) {
      const products = s.favorites.map((id) => this.catalog.byId(id)).filter(Boolean);
      return finish(products.length ? `*Seus favoritos* ❤️\n\n${this.productList(products)}` : "Você ainda não tem favoritos. Digite *favoritar CÓDIGO* para salvar um produto.");
    }
    const favorite = n.match(/^favoritar\s+([a-z0-9-]+)$/);
    if (favorite) {
      const product = this.catalog.byId(favorite[1]);
      if (!product) return finish("Não encontrei esse produto para favoritar.");
      if (!s.favorites.includes(product.id)) s.favorites.push(product.id);
      return finish(`${product.name} foi adicionado aos seus favoritos. ❤️`);
    }
    const unfavorite = n.match(/^desfavoritar\s+([a-z0-9-]+)$/);
    if (unfavorite) {
      const before = s.favorites.length;
      s.favorites = s.favorites.filter((id) => normalize(id) !== normalize(unfavorite[1]));
      return finish(before === s.favorites.length ? "Esse produto não estava nos favoritos." : "Produto removido dos favoritos.");
    }

    if (["catalogo", "ver catalogo", "produtos"].includes(n) || (n === "1" && s.stage === "idle")) {
      const categories = this.catalog.categories().map((x) => `• ${x}`).join("\n");
      return finish(`*Categorias disponíveis*\n${categories}\n\nDigite uma categoria ou o nome do produto desejado.`);
    }
    if (["buscar", "buscar produto"].includes(n) || (n === "2" && s.stage === "idle")) { s.stage = "search"; return finish("O que você procura? Digite o nome, categoria ou característica do produto."); }

    if (s.stage === "product_selection") {
      const selection = Number.parseInt(n, 10);
      const productId = Number.isInteger(selection) ? s.productOptions?.[selection - 1] : null;
      const product = productId ? this.catalog.byId(productId) : null;
      if (!product) return finish(`Escolha um número entre 1 e ${s.productOptions?.length || 0}, ou digite *cancelar*.`);
      s.pending = { productId: product.id };
      if (product.variants.length === 1) {
        s.pending.variant = product.variants[0]; s.stage = "quantity";
        return finish(`Você escolheu *${product.name} — ${product.variants[0]}*. Quantas unidades deseja?`);
      }
      s.stage = "variant";
      return finish(`Você escolheu *${product.name}*. Qual opção deseja?\n${product.variants.join(" | ")}`);
    }

    const add = n.match(/^(?:adicionar|comprar)\s+([a-z0-9-]+)$/);
    if (add) {
      const product = this.catalog.byId(add[1]);
      if (!product || product.stock <= 0) return finish("Produto indisponível. Digite *catálogo* para ver outras opções.");
      s.pending = { productId: product.id };
      s.stage = "variant";
      return finish(`Você escolheu *${product.name}*. Qual opção deseja?\n${product.variants.join(" | ")}`);
    }

    if (s.stage === "variant") {
      const product = this.catalog.byId(s.pending.productId);
      const variant = product?.variants.find((v) => normalize(v) === n);
      if (!variant) return finish(`Opção inválida. Escolha uma destas: ${product.variants.join(" | ")}`);
      s.pending.variant = variant; s.stage = "quantity";
      return finish(`Quantas unidades de *${product.name} — ${variant}* você deseja?`);
    }
    if (s.stage === "quantity") {
      const qty = requestedQuantity(n);
      const product = this.catalog.byId(s.pending.productId);
      const same = s.cart.find((x) => x.productId === product.id && x.variant === s.pending.variant);
      const alreadyInCart = product.variantStock ? (same?.qty || 0) : s.cart.filter((x) => x.productId === product.id).reduce((sum, x) => sum + x.qty, 0);
      const limit = product.variantStock ? this.catalog.stockFor(product, s.pending.variant) : product.stock;
      if (!Number.isInteger(qty) || qty < 1 || qty > limit) return finish(`Digite uma quantidade entre 1 e ${limit}.`);
      if (alreadyInCart + qty > limit) return finish(`Você já possui ${alreadyInCart} dessa opção no carrinho. O estoque permite no máximo ${limit}. Digite outra quantidade.`);
      if (same) same.qty += qty;
      else s.cart.push({ productId: product.id, sku: product.variantSku?.[s.pending.variant] || null, name: product.name, variant: s.pending.variant, price: product.price, qty });
      s.stage = "idle"; s.pending = null;
      return finish(`Produto adicionado! ✅\n\n${this.cartSummary(s)}`);
    }

    if (["finalizar", "fechar pedido", "checkout"].includes(n)) {
      if (!s.cart.length) return finish("Seu carrinho está vazio. Digite *catálogo* para começar.");
      s.checkoutKey = crypto.randomUUID();
      s.stage = "checkout_name";
      return finish(`${this.cartSummary(s, false)}\n\nPara iniciar o pedido, informe seu *nome completo*.`);
    }
    if (s.stage === "checkout_name") {
      if (text.length < 3) return finish("Por favor, informe seu nome completo.");
      s.checkout = { name: text, idempotencyKey: s.checkoutKey || crypto.randomUUID() }; s.stage = "checkout_delivery";
      return finish("Você prefere *entrega* ou *retirada*?");
    }
    if (s.stage === "checkout_delivery") {
      const delivery = hasAny(n, ["entrega", "entregar", "delivery", "motoboy"])
        ? "entrega"
        : hasAny(n, ["retirada", "retirar", "buscar na loja", "vou buscar"])
          ? "retirada"
          : null;
      if (!delivery) return finish("Você prefere *entrega* ou *retirada na loja*? Pode responder com uma dessas opções.");
      s.checkout.delivery = delivery;
      if (delivery === "entrega") { s.stage = "checkout_address"; return finish("Informe endereço completo, número, complemento, bairro, cidade e CEP."); }
      s.checkout.address = "Retirada na loja"; s.stage = "checkout_confirm";
      return finish(this.confirmation(s));
    }
    if (s.stage === "checkout_address") {
      if (text.length < 15) return finish("O endereço parece incompleto. Inclua rua, número, bairro, cidade e CEP.");
      s.checkout.address = text; s.stage = "checkout_confirm";
      return finish(this.confirmation(s));
    }
    if (s.stage === "checkout_confirm") {
      if (hasAny(n, ["nao", "não", "corrigir", "voltar", "alterar"])) { s.stage = "idle"; s.checkoutKey = null; return finish("Tudo bem. O pedido não foi enviado e seu carrinho continua salvo. Quando quiser, digite *finalizar* novamente."); }
      if (!hasAny(n, ["sim", "confirmar", "confirmo", "pode enviar", "pode confirmar", "ok", "okay"])) return finish("Está tudo certo? Responda *confirmar* ou *sim* para enviar, ou *corrigir* para alterar.");
      let order;
      try { order = this.createOrder(user, s); }
      catch (error) { s.stage = "idle"; return finish(`Não consegui reservar o estoque: ${error.message}\n\nSeu carrinho foi mantido. Escolha outra opção ou digite *atendente*.`); }
      s.cart = []; s.checkout = null; s.checkoutKey = null; s.orderNote = null; s.stage = "idle"; s.lastOrderId = order.id;
      return finish(`Pedido *${order.id}* registrado com sucesso! ✅\n\nNossa equipe continuará o atendimento pelo WhatsApp para confirmar disponibilidade, prazo e pagamento. O bot não solicita dados de cartão.`, { order });
    }

    const statusMatch = n.match(/ped-\d{8}-[a-z0-9]{6}/i);
    if (["acompanhar pedido", "status"].includes(n) || (n === "4" && s.stage === "idle")) return finish("Digite o código do pedido, por exemplo: PED-20260101-ABC123.");
    if (statusMatch) {
      const order = this.commerce?.findOrderByCode(statusMatch[0]) || this.orders.read().find((x) => normalize(x.id) === statusMatch[0]);
      return finish(order && order.user === user ? `Pedido *${order.id}*: ${order.status}.` : "Não encontrei esse pedido vinculado ao seu WhatsApp.");
    }

    if (["duvidas", "dúvidas", "faq"].includes(n) || (n === "5" && s.stage === "idle")) return finish(this.faqs.map((x) => `• ${x.question}`).join("\n") + "\n\nDigite sua dúvida.");
    const faq = this.faqs.find((x) => x.keywords.some((k) => n.includes(normalize(k))));
    if (faq) return finish(faq.answer);

    const results = this.catalog.search(text);
    if (results.length) {
      s.stage = "product_selection";
      s.productOptions = results.map((product) => product.id);
      return finish(this.productList(results, true));
    }
    if (s.stage === "search") return finish("Não encontrei esse produto. Tente outro termo ou digite *atendente*.");
    return finish(`Não consegui entender com segurança. Posso ajudar sem inventar informações.\n\n${MENU}`);
  }

  confirmation(s) {
    const subtotal = s.cart.reduce((sum, x) => sum + x.price * x.qty, 0);
    const fee = s.checkout.delivery === "entrega" && !(this.config.freeShippingFrom > 0 && subtotal >= this.config.freeShippingFrom) ? this.config.deliveryFee : 0;
    s.checkout.deliveryFee = fee;
    const note = s.orderNote ? `\nObservação: ${s.orderNote}` : "";
    return `*Revise seu pedido*\n\n${this.cartSummary(s, false)}\nFrete: ${money(fee)}\n*Total estimado: ${money(subtotal + fee)}*\n\nNome: ${s.checkout.name}\nForma: ${s.checkout.delivery}\nEndereço: ${s.checkout.address}${note}\n\nDigite *confirmar* para enviar ou *corrigir* para voltar. O pagamento será combinado com a equipe.`;
  }

  createOrder(user, s) {
    if (this.commerce) {
      const result = this.commerce.placeOrder({
        principal: hashPrincipal("whatsapp", user),
        idempotencyKey: `bot-${s.checkout.idempotencyKey || crypto.randomUUID()}`,
        payload: {
          items: s.cart.map((item) => ({
            productId: item.productId,
            size: item.variant,
            quantity: item.qty,
          })),
          note: s.orderNote || "",
        },
        source: "whatsapp",
        requireWhatsAppLink: false,
        trusted: {
          customer: s.checkout.name,
          user,
          delivery: s.checkout.delivery,
          address: s.checkout.address,
          note: s.orderNote || "",
          deliveryFeeCents: Math.round(Number(s.checkout.deliveryFee || 0) * 100),
        },
      });
      return result.order;
    }
    const subtotal = s.cart.reduce((sum, x) => sum + x.price * x.qty, 0);
    const order = { id: makeOrderId(), user, customer: s.checkout.name, items: structuredClone(s.cart), delivery: s.checkout.delivery, address: s.checkout.address, note: s.orderNote || "", subtotal, deliveryFee: s.checkout.deliveryFee, total: subtotal + s.checkout.deliveryFee, status: "Aguardando confirmação da loja", createdAt: new Date().toISOString() };
    this.catalog.reserveOrder(order);
    const orders = this.orders.read(); orders.push(order); this.orders.write(orders);
    return order;
  }
}
