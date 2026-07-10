const messages = document.querySelector("#messages");
const form = document.querySelector("#composer");
const input = document.querySelector("#message");
const sendButton = document.querySelector("#send");
const sessionId = sessionStorage.getItem("chatSession") || crypto.randomUUID();
sessionStorage.setItem("chatSession", sessionId);

function time() { return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date()); }
function scrollDown() { messages.scrollTop = messages.scrollHeight; }

function addMessage(text, author) {
  const row = document.createElement("div"); row.className = `row ${author}`;
  const bubble = document.createElement("div"); bubble.className = "bubble";
  const content = document.createElement("span"); content.textContent = text;
  const meta = document.createElement("span"); meta.className = "meta"; meta.textContent = time();
  if (author === "user") { const ticks = document.createElement("span"); ticks.className = "ticks"; ticks.textContent = "✓✓"; meta.append(ticks); }
  bubble.append(content, meta); row.append(bubble); messages.append(row); scrollDown();
}

function showTyping() {
  const row = document.createElement("div"); row.className = "row bot typing"; row.id = "typing";
  row.innerHTML = '<div class="bubble"><i></i><i></i><i></i></div>'; messages.append(row); scrollDown();
}

async function talk(text) {
  if (!text.trim() || sendButton.disabled) return;
  addMessage(text.trim(), "user"); input.value = ""; sendButton.disabled = true; showTyping();
  try {
    const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, name: "Cliente", message: text.trim() }) });
    const data = await response.json();
    await new Promise((resolve) => setTimeout(resolve, 450));
    document.querySelector("#typing")?.remove();
    if (!response.ok) throw new Error(data.error || "Erro no servidor");
    for (const message of data.messages) { addMessage(message, "bot"); await new Promise((resolve) => setTimeout(resolve, 180)); }
  } catch (error) { document.querySelector("#typing")?.remove(); addMessage(`Não consegui acessar o bot: ${error.message}`, "bot"); }
  finally { sendButton.disabled = false; input.focus(); }
}

form.addEventListener("submit", (event) => { event.preventDefault(); talk(input.value); });
document.querySelectorAll("[data-message]").forEach((button) => button.addEventListener("click", () => talk(button.dataset.message)));
document.querySelector("#reset").addEventListener("click", async () => {
  await fetch("/api/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId }) });
  messages.querySelectorAll(".row").forEach((node) => node.remove());
  addMessage("Conversa reiniciada. Digite oi para começar!", "bot"); input.focus();
});

addMessage("Olá! 👋 Este é o simulador da loja. Digite *oi* ou use os atalhos abaixo para começar.", "bot");
input.focus();
