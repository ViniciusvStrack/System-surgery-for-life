/**
 * Surgery For Life - Notificador de Estoque Baixo
 * Envia alerta via WhatsApp para o número da loja quando um produto fica abaixo do mínimo
 * Criado para operação Divinópolis - Camaragibe
 * Júnior 18 anos - Porto Digital - Impecável
 */

export class LowStockNotifier {
  constructor({ whatsappClient, storeNumber, inventory }) {
    this.whatsapp = whatsappClient;
    this.storeNumber = storeNumber;
    this.inventory = inventory;
    this.notified = new Set(); // evita spam do mesmo SKU no mesmo dia
  }

  shouldNotify(product, quantity) {
    if (!product || typeof quantity !== 'number') return false;
    const min = Number(product.minStock ?? product.min ?? 3);
    return quantity <= min;
  }

  formatMessage(product, quantity) {
    const sku = product.sku || product.id || 'SEM-SKU';
    const nome = product.name || product.nome || 'Produto';
    const cor = product.color || product.cor || '';
    const tam = product.size || product.tam || product.variant || '';
    const min = product.minStock ?? product.min ?? 3;
    
    return `⚠️ *Alerta Estoque Baixo - Surgery For Life*\n\n` +
           `📦 Produto: *${nome}*\n` +
           `🎨 Cor: ${cor} | Tamanho: ${tam}\n` +
           `🔖 SKU: ${sku}\n` +
           `📊 Saldo atual: *${quantity}* (mínimo: ${min})\n\n` +
           `📍 Local: Condomínio Divinópolis - Camaragibe/PE\n` +
           `👉 Ação: Repor urgente! Faltam ${Math.max(0, min - quantity + 1)} unidades para voltar ao mínimo.\n\n` +
           `_Mensagem automática do sistema Atelier V2 Impecável_`;
  }

  async notifyIfLow(product, quantity, options = {}) {
    if (!this.shouldNotify(product, quantity)) return false;
    
    const today = new Date().toISOString().slice(0, 10);
    const key = `${product.sku || product.id}-${today}`;
    
    // Evita spam: notifica mesmo SKU só 1x por dia, a menos que force
    if (!options.force && this.notified.has(key)) return false;
    
    const message = this.formatMessage(product, quantity);
    
    // Se não tem WhatsApp configurado (dev), só loga
    if (!this.whatsapp || !this.storeNumber) {
      console.warn(`[LowStock] ${product.sku} - ${quantity} unidades (mínimo ${product.min}). WhatsApp não configurado, mensagem:\n${message}`);
      this.notified.add(key);
      return true;
    }

    try {
      await this.whatsapp.sendText(this.storeNumber, message);
      this.notified.add(key);
      console.log(`[LowStock] Alerta enviado para ${this.storeNumber}: ${product.sku} = ${quantity}`);
      return true;
    } catch (error) {
      console.error(`[LowStock] Falha ao enviar alerta para ${product.sku}:`, error.message);
      return false;
    }
  }

  // Limpa cache diário à meia-noite
  clearDailyCache() {
    this.notified.clear();
  }
}
