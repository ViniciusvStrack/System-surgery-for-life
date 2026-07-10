import crypto from "node:crypto";

export function verifySignature(rawBody, signature, secret) {
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected); const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function extractMessages(payload) {
  const result = [];
  for (const entry of payload.entry ?? []) for (const change of entry.changes ?? []) {
    const contacts = change.value?.contacts ?? [];
    for (const message of change.value?.messages ?? []) {
      const text = message.text?.body ?? message.button?.text ?? message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title;
      if (text) result.push({ id: message.id, from: message.from, text, name: contacts.find((c) => c.wa_id === message.from)?.profile?.name ?? "Cliente" });
    }
  }
  return result;
}

export class WhatsAppClient {
  constructor(config) { this.config = config; }
  configured() { return Boolean(this.config.whatsappToken && this.config.phoneNumberId); }
  async sendText(to, body) {
    if (!this.configured()) { console.log(`[SIMULAÇÃO para ${to}] ${body}`); return; }
    const url = `https://graph.facebook.com/${this.config.graphVersion}/${this.config.phoneNumberId}/messages`;
    const response = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${this.config.whatsappToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body } }) });
    if (!response.ok) throw new Error(`WhatsApp API ${response.status}: ${await response.text()}`);
  }
  async markRead(messageId) {
    if (!this.configured()) return;
    const url = `https://graph.facebook.com/${this.config.graphVersion}/${this.config.phoneNumberId}/messages`;
    await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${this.config.whatsappToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: messageId }) });
  }
}
