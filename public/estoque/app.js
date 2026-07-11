import { InventoryApi } from "./api.js";

const api = new InventoryApi();
const state = { revision: 0, products: [], movements: [], view: "dashboard", timer: null, user: null };
const $ = (selector) => document.querySelector(selector);
const money = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
const date = (value) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));

function toast(message, error = false) {
  const element = $("#toast"); element.textContent = message; element.style.background = error ? "#9f3f3f" : "#26354c"; element.classList.add("show");
  clearTimeout(toast.timer); toast.timer = setTimeout(() => element.classList.remove("show"), 3200);
}

function setConnection(online) {
  $("#connectionDot").style.background = online ? "#58c698" : "#e06363";
  $("#connectionText").textContent = online ? "Sincronizado" : "Offline";
  $("#revisionText").textContent = online ? `Revisão ${state.revision}` : "Clique em atualizar";
}

async function connect() {
  try {
    const identity = await api.me(); state.user = identity.user; configureAccess();
    if (identity.requiresTwoFactorSetup) await beginTwoFactorSetup();
    applySnapshot(await api.read()); setConnection(true); startPolling(); $("#loginScreen").classList.add("hidden"); $("#appShell").classList.remove("hidden");
  } catch (error) { $("#appShell").classList.add("hidden"); $("#loginScreen").classList.remove("hidden"); if (error.status !== 401 && error.code !== "MFA_SETUP_REQUIRED") $("#loginMessage").textContent = error.message; }
}

function configureAccess() {
  const labels = { admin: "Administrador", stock: "Estoque", support: "Atendimento" }; $("#currentUserName").textContent = state.user.name; $("#currentUserRole").textContent = labels[state.user.role];
  document.querySelectorAll(".admin-only").forEach((element) => element.classList.toggle("hidden", state.user.role !== "admin"));
  document.querySelectorAll(".write-action").forEach((element) => element.classList.toggle("hidden", state.user.role === "support"));
}

async function beginTwoFactorSetup() { const setup = await api.setupTwoFactor(); $("#twoFactorSecret").textContent = setup.secret; $("#twoFactorQr").src = setup.qrCode; $("#twoFactorDialog").showModal(); }

function applySnapshot(snapshot) {
  state.revision = snapshot.revision; state.products = snapshot.products; state.movements = snapshot.movements; render();
}

async function save() {
  try { applySnapshot(await api.save({ revision: state.revision, products: state.products, movements: state.movements })); setConnection(true); toast("Estoque sincronizado com sucesso."); }
  catch (error) {
    if (error.status === 409) { toast("O estoque mudou. Recarregando a versão atual…", true); return refresh(); }
    if (error.status === 401) return connect(true);
    setConnection(false); toast(error.message, true); throw error;
  }
}

async function refresh(silent = false) {
  try { const snapshot = await api.read(); if (snapshot.revision !== state.revision) applySnapshot(snapshot); setConnection(true); if (!silent) toast("Dados atualizados."); }
  catch (error) { setConnection(false); if (!silent) toast(error.message, true); }
}

function startPolling() { if (!state.timer) state.timer = setInterval(() => refresh(true), 5000); }
function productForMovement(movement) { return state.products.find((product) => Number(product.id) === Number(movement.prodId)); }

function render() {
  const units = state.products.reduce((sum, product) => sum + Number(product.qtd), 0);
  const low = state.products.filter((product) => Number(product.qtd) <= Number(product.min));
  $("#metricProducts").textContent = state.products.length; $("#metricUnits").textContent = units; $("#metricLow").textContent = low.length;
  $("#metricValue").textContent = money(state.products.reduce((sum, product) => sum + product.qtd * product.custo, 0));
  $("#lowBadge").textContent = low.length; $("#metricEntries").textContent = state.movements.filter((m) => m.tipo === "entrada").reduce((s, m) => s + Number(m.qtd), 0);
  $("#metricExits").textContent = state.movements.filter((m) => m.tipo === "saida").reduce((s, m) => s + Number(m.qtd), 0);
  $("#metricWhatsapp").textContent = state.movements.filter((m) => m.motivo === "Venda WhatsApp").length;
  renderLow(low); renderProducts(); renderMovements(); renderTimeline(); populateProductSelect();
}

function renderLow(products) {
  $("#lowStockList").innerHTML = products.length ? products.map((product) => `<div class="stock-row"><div class="info"><strong>${escapeHtml(product.nome)} · ${escapeHtml(product.cor)}</strong><small>${escapeHtml(product.sku)} · Tamanho ${escapeHtml(product.tam)}</small></div><span class="qty">${product.qtd} un.</span></div>`).join("") : '<div class="empty">Tudo certo. Nenhum item precisa de reposição.</div>';
}

function renderProducts() {
  const query = $("#productSearch").value.toLowerCase().trim();
  const products = state.products.filter((product) => [product.nome, product.sku, product.cor, product.tam].some((value) => String(value).toLowerCase().includes(query)));
  $("#productsTable").innerHTML = products.length ? products.map((product) => `<tr><td><strong>${escapeHtml(product.nome)}</strong><span class="product-sub">${escapeHtml(product.colecao)}</span></td><td>${escapeHtml(product.sku)}</td><td>${escapeHtml(product.cor)}</td><td>${escapeHtml(product.tam)}</td><td><strong>${product.qtd}</strong></td><td>${product.min}</td><td>${money(product.preco)}</td><td><span class="status ${product.qtd <= product.min ? "low" : "ok"}">${product.qtd <= 0 ? "ZERADO" : product.qtd <= product.min ? "REPOR" : "SAUDÁVEL"}</span></td><td>${state.user?.role !== "support" ? `<div class="row-actions"><button data-edit="${product.id}">Editar</button><button data-delete="${product.id}">Excluir</button></div>` : ""}</td></tr>`).join("") : '<tr><td colspan="9" class="empty">Nenhum produto encontrado.</td></tr>';
}

function movementRow(movement) {
  const product = productForMovement(movement); const responsible = movement.forn || movement.cliente || "Sistema";
  return `<tr><td>${date(movement.date)}</td><td><span class="status ${movement.tipo === "entrada" ? "ok" : "low"}">${movement.tipo.toUpperCase()}</span></td><td><strong>${escapeHtml(product?.nome || "Produto excluído")}</strong><span class="product-sub">${escapeHtml(product?.sku || "—")}</span></td><td>${movement.tipo === "entrada" ? "+" : "−"}${movement.qtd}</td><td>${movement.saldoDepois ?? "—"}</td><td>${escapeHtml(responsible)}</td><td>${escapeHtml(movement.obs || movement.motivo || "—")}</td></tr>`;
}

function sortedMovements() { return [...state.movements].sort((a, b) => new Date(b.date) - new Date(a.date)); }
function renderMovements() { const items = sortedMovements(); $("#movementsTable").innerHTML = items.length ? items.map(movementRow).join("") : '<tr><td colspan="7" class="empty">Nenhuma movimentação registrada.</td></tr>'; }

function timelineRow(movement) {
  const product = productForMovement(movement); const detail = movement.forn || movement.cliente || movement.motivo || "Sistema";
  return `<div class="timeline-row"><span class="type ${movement.tipo}">${movement.tipo === "entrada" ? "+" : "−"}</span><div class="info"><strong>${escapeHtml(product?.nome || "Produto excluído")} · ${movement.qtd} un.</strong><small>${escapeHtml(detail)} · ${date(movement.date)}</small></div><b>${movement.saldoDepois ?? "—"}</b></div>`;
}

function renderTimeline() { const items = sortedMovements(); $("#recentMovements").innerHTML = items.length ? items.slice(0, 6).map(timelineRow).join("") : '<div class="empty">Nenhuma atividade recente.</div>'; $("#historyTimeline").innerHTML = items.length ? items.map(timelineRow).join("") : '<div class="empty">Nenhum histórico.</div>'; }
function populateProductSelect() { $("#movementForm [name=prodId]").innerHTML = state.products.map((product) => `<option value="${product.id}">${escapeHtml(product.sku)} — ${escapeHtml(product.nome)} ${escapeHtml(product.cor)} ${escapeHtml(product.tam)} (${product.qtd})</option>`).join(""); }

async function showView(view) {
  state.view = view; document.querySelectorAll(".view").forEach((element) => element.classList.toggle("active", element.id === `view-${view}`));
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  $("#pageTitle").textContent = ({ dashboard: "Visão geral", products: "Produtos", movements: "Movimentações", history: "Histórico", users: "Usuários", audit: "Auditoria" })[view];
  if (view === "users") await renderUsers(); if (view === "audit") await renderAudit();
}

async function renderUsers() { try { const users = await api.users(); $("#usersTable").innerHTML = users.map((user) => `<tr><td><strong>${escapeHtml(user.name)}</strong></td><td>${escapeHtml(user.email)}</td><td>${escapeHtml(user.role)}</td><td><span class="status ${user.twoFactorEnabled ? "ok" : "low"}">${user.twoFactorEnabled ? "ATIVO" : "PENDENTE"}</span></td><td>${user.active ? "Ativo" : "Desativado"}</td><td>${date(user.createdAt)}</td></tr>`).join(""); } catch (error) { toast(error.message, true); } }
async function renderAudit() { try { const entries = await api.audit(); $("#auditTimeline").innerHTML = entries.length ? entries.map((entry) => `<div class="timeline-row"><span class="type entrada">◎</span><div class="info"><strong>${escapeHtml(entry.action)}</strong><small>${escapeHtml(entry.actor?.name || "Sistema")} · ${date(entry.timestamp)}</small></div></div>`).join("") : '<div class="empty">Nenhum evento registrado.</div>'; } catch (error) { toast(error.message, true); } }

function openProduct(id = null) {
  const form = $("#productForm"); form.reset(); form.elements.colecao.value = "Atelier 2026"; form.elements.qtd.value = 0; form.elements.min.value = 2;
  const product = id ? state.products.find((item) => Number(item.id) === Number(id)) : null;
  $("#productDialogTitle").textContent = product ? "Editar produto" : "Novo produto";
  if (product) Object.entries(product).forEach(([key, value]) => { if (form.elements[key]) form.elements[key].value = value; });
  $("#productDialog").showModal();
}

$("#productForm").addEventListener("submit", async (event) => {
  event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); const id = values.id ? Number(values.id) : Date.now();
  const product = { id, nome: values.nome.trim(), cor: values.cor.trim(), tam: values.tam.trim(), colecao: values.colecao.trim(), sku: values.sku.trim().toUpperCase(), qtd: Number(values.qtd), min: Number(values.min), custo: Number(values.custo), preco: Number(values.preco) };
  if (state.products.some((item) => item.sku === product.sku && Number(item.id) !== id)) return toast("Este SKU já está cadastrado.", true);
  const index = state.products.findIndex((item) => Number(item.id) === id); const previous = index >= 0 ? state.products[index] : null;
  if (index >= 0) state.products[index] = product; else state.products.push(product);
  const diff = product.qtd - Number(previous?.qtd || 0); if (diff) state.movements.push({ id: Date.now(), date: new Date().toISOString(), tipo: diff > 0 ? "entrada" : "saida", prodId: id, qtd: Math.abs(diff), forn: "Cadastro de produto", motivo: "Ajuste de saldo", cliente: "Sistema", obs: previous ? "Alteração pelo painel" : "Estoque inicial", saldoDepois: product.qtd });
  await save(); $("#productDialog").close();
});

$("#movementForm").addEventListener("submit", async (event) => {
  event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); const product = state.products.find((item) => Number(item.id) === Number(values.prodId)); const qty = Number(values.qtd);
  if (!product) return toast("Selecione um produto.", true); if (values.tipo === "saida" && qty > product.qtd) return toast(`Saldo insuficiente. Disponível: ${product.qtd}.`, true);
  product.qtd += values.tipo === "entrada" ? qty : -qty; state.movements.push({ id: Date.now(), date: new Date().toISOString(), tipo: values.tipo, prodId: product.id, qtd: qty, forn: values.tipo === "entrada" ? values.responsavel : undefined, cliente: values.tipo === "saida" ? values.responsavel : undefined, motivo: values.tipo === "saida" ? "Movimentação manual" : undefined, obs: values.obs.trim(), saldoDepois: product.qtd });
  await save(); $("#movementDialog").close(); event.currentTarget.reset();
});

$("#navigation").addEventListener("click", (event) => { const button = event.target.closest("[data-view]"); if (button) showView(button.dataset.view); });
document.addEventListener("click", async (event) => {
  const go = event.target.closest("[data-go]"); if (go) showView(go.dataset.go);
  const edit = event.target.closest("[data-edit]"); if (edit) openProduct(edit.dataset.edit);
  const remove = event.target.closest("[data-delete]"); if (remove && confirm("Excluir este produto? O histórico será preservado.")) { state.products = state.products.filter((item) => Number(item.id) !== Number(remove.dataset.delete)); await save(); }
});
$("#newProduct").addEventListener("click", () => openProduct()); $("#newMovement").addEventListener("click", () => $("#movementDialog").showModal());
$("#refreshButton").addEventListener("click", () => refresh()); $("#productSearch").addEventListener("input", renderProducts);
$("#exportButton").addEventListener("click", () => { const rows = [["Data", "Tipo", "SKU", "Produto", "Quantidade", "Saldo", "Responsável", "Observação"], ...sortedMovements().map((movement) => { const product = productForMovement(movement); return [movement.date, movement.tipo, product?.sku || "", product?.nome || "Produto excluído", movement.qtd, movement.saldoDepois ?? "", movement.forn || movement.cliente || "", movement.obs || movement.motivo || ""]; })]; const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n"); const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" })); link.download = `estoque-surgery-for-life-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(link.href); });

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault(); const form = event.currentTarget; $("#loginMessage").textContent = "Autenticando…";
  try { const result = await api.login(form.elements.email.value, form.elements.password.value, form.elements.code.value); if (result.requiresTwoFactor) { $("#loginCodeField").classList.remove("hidden"); form.elements.code.required = true; $("#loginMessage").textContent = "Digite o código do aplicativo autenticador."; return; } await connect(); }
  catch (error) { $("#loginMessage").textContent = error.message; }
});
$("#logoutButton").addEventListener("click", async () => { await api.logout(); clearInterval(state.timer); state.timer = null; state.user = null; $("#loginForm").reset(); $("#loginCodeField").classList.add("hidden"); await connect(); });
$("#forgotButton").addEventListener("click", async () => { const email = prompt("Informe o e-mail da conta:"); if (!email) return; try { const result = await api.forgotPassword(email); let token = result.developmentResetToken; if (token) token = prompt("Ambiente local: copie este token para redefinir a senha:", token); else alert(result.message); if (token) { const password = prompt("Digite a nova senha (mínimo de 12 caracteres):"); if (password) { await api.resetPassword(token, password); alert("Senha redefinida. Faça login novamente."); } } } catch (error) { $("#loginMessage").textContent = error.message; } });
$("#twoFactorForm").addEventListener("submit", async (event) => { event.preventDefault(); try { await api.confirmTwoFactor(event.currentTarget.elements.code.value); $("#twoFactorDialog").close(); await connect(); } catch (error) { toast(error.message, true); } });
$("#newUser").addEventListener("click", () => $("#userDialog").showModal());
$("#userForm").addEventListener("submit", async (event) => { event.preventDefault(); try { await api.createUser(Object.fromEntries(new FormData(event.currentTarget))); $("#userDialog").close(); event.currentTarget.reset(); await renderUsers(); toast("Usuário criado com sucesso."); } catch (error) { toast(error.message, true); } });

connect();
