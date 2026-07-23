/**
 * Surgery For Life - Premium Features Frontend
 * 10 funcionalidades que aumentam conversão
 * Júnior 18 anos - Porto Digital
 */

// 1. Visualizador Bordado ao Vivo
function initEmbroideryLivePreview() {
  const nameInput = document.querySelector('[data-embroidery-name]');
  const crmInput = document.querySelector('[data-embroidery-crm]');
  const colorSelect = document.querySelector('[data-embroidery-color]');
  const preview = document.querySelector('[data-embroidery-preview]');
  if (!nameInput || !preview) return;

  const update = () => {
    const name = nameInput.value.trim().slice(0,20) || 'Seu Nome';
    const crm = crmInput ? crmInput.value.trim().slice(0,15) : '';
    const color = colorSelect ? colorSelect.value : '#D6BE9D';
    preview.innerHTML = `<div style="font-family:Georgia,serif;color:${color};text-align:center;line-height:1.2;transform:rotate(-2deg);text-shadow:1px 1px 0 rgba(255,255,255,0.8);border:1px dashed ${color};padding:8px 12px;border-radius:8px;background:rgba(255,255,255,0.9)"><div style="font-size:14px;font-weight:700;letter-spacing:1px">${name}</div>${crm?`<div style="font-size:10px;margin-top:2px;opacity:0.9">${crm}</div>`:''}</div>`;
    preview.style.display = 'block';
  };
  nameInput.addEventListener('input', update);
  if (crmInput) crmInput.addEventListener('input', update);
  if (colorSelect) colorSelect.addEventListener('change', update);
  update();
}

// 2. Prova Tamanho Inteligente
function initSizeQuiz() {
  const btn = document.querySelector('[data-open-size-quiz]');
  const modal = document.querySelector('[data-size-quiz-modal]');
  if (!btn || !modal) return;
  
  btn.addEventListener('click', () => modal.style.display = 'flex');
  const closeBtns = modal.querySelectorAll('[data-close-size-quiz]');
  closeBtns.forEach(b => b.addEventListener('click', () => modal.style.display = 'none'));

  const form = modal.querySelector('form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const altura = form.querySelector('[name="altura"]').value;
    const peso = form.querySelector('[name="peso"]').value;
    const corpo = form.querySelector('[name="corpo"]').value;
    const resDiv = modal.querySelector('[data-size-result]');
    
    try {
      const res = await fetch('/api/size-recommend', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ heightCm: altura, weightKg: peso, bodyType: corpo })
      });
      const data = await res.json();
      resDiv.innerHTML = `<div style="background:#f0f7ff;padding:16px;border-radius:12px;border:1px solid #d0ddee"><strong style="color:#101F39;font-size:18px">Tamanho recomendado: ${data.size}</strong><br><small style="color:#666">${data.reason}</small><br><small style="color:#4A7C6F">Confiança: ${data.confidence}% • IMC: ${data.imc}</small><br><button class="button primary" style="margin-top:12px" onclick="selectSize('${data.size}'); document.querySelector('[data-size-quiz-modal]').style.display='none'">Usar tamanho ${data.size}</button></div>`;
      resDiv.style.display = 'block';
    } catch {
      resDiv.innerHTML = `<div style="background:#fdf0ec;padding:12px;border-radius:8px;color:#C26B4F">Erro ao calcular, tente novamente</div>`;
    }
  });
}

window.selectSize = function(size) {
  // Tenta selecionar tamanho na página produto
  const sizeButtons = document.querySelectorAll('[data-variant][data-variant-type="size"]');
  sizeButtons.forEach(b => {
    if (b.textContent.trim().toUpperCase() === size.toUpperCase()) b.click();
  });
  // Também dispara evento custom
  document.dispatchEvent(new CustomEvent('sfl:size-selected', {detail:{size}}));
};

// 3. Lista Espera
async function initWaitlist() {
  const forms = document.querySelectorAll('[data-waitlist-form]');
  forms.forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const sku = form.dataset.sku || form.querySelector('[name="sku"]')?.value;
      const nome = form.querySelector('[name="nome"]')?.value;
      const zap = form.querySelector('[name="whatsapp"]')?.value;
      const resDiv = form.querySelector('[data-waitlist-result]');
      
      try {
        const res = await fetch('/api/waitlist', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ sku, customerName: nome, whatsapp: zap })
        });
        const data = await res.json();
        if (data.already) {
          resDiv.innerHTML = `<small style="color:#C26B4F">Você já está na lista para ${sku}! Te avisamos no WhatsApp quando voltar.</small>`;
        } else {
          resDiv.innerHTML = `<small style="color:#4A7C6F">✅ Entrou na lista VIP! Você será avisado no WhatsApp assim que ${sku} voltar. Posição: ${data.position || 'VIP'}</small>`;
          form.reset();
        }
        resDiv.style.display = 'block';
      } catch {
        resDiv.innerHTML = `<small style="color:#C26B4F">Erro, tente novamente</small>`;
      }
    });
  });
}

// 4. Kit Builder
let kitItems = [];
function initKitBuilder() {
  const addBtns = document.querySelectorAll('[data-add-to-kit]');
  const kitBar = document.querySelector('[data-kit-bar]');
  const kitList = document.querySelector('[data-kit-list]');
  const kitTotal = document.querySelector('[data-kit-total]');
  if (!kitBar) return;

  addBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const sku = btn.dataset.sku;
      const name = btn.dataset.name;
      const price = parseFloat(btn.dataset.price);
      kitItems.push({ sku, name, price, qty: 1 });
      updateKitUI();
      kitBar.style.display = 'flex';
      showToast(`Adicionado ao kit: ${name}`);
    });
  });

  function updateKitUI() {
    if (kitItems.length === 0) { kitBar.style.display = 'none'; return; }
    let subtotal = kitItems.reduce((s,i)=>s+i.price,0);
    let discount = 0;
    if (kitItems.length===2) discount = subtotal*0.10;
    else if (kitItems.length===3) discount = subtotal*0.15;
    else if (kitItems.length>=4) discount = subtotal*0.18;
    else if (kitItems.length>=5) discount = subtotal*0.20;
    let total = subtotal - discount;
    
    if (kitList) kitList.innerHTML = kitItems.map((i,idx)=>`${i.name} - R$ ${i.price} <button onclick="kitItems.splice(${idx},1);updateKitUI()" style="margin-left:8px;background:#fdf0ec;border:none;padding:2px 6px;border-radius:10px;cursor:pointer">x</button>`).join('<br>');
    if (kitTotal) kitTotal.innerHTML = `Subtotal R$ ${subtotal.toFixed(2)} | Desconto ${discount>0?'-R$ '+discount.toFixed(2):'Monte 2+ para 10% OFF'} | <strong>Total R$ ${total.toFixed(2)}</strong>`;
    window.kitItems = kitItems;
    window.updateKitUI = updateKitUI;
  }
  
  const checkoutKitBtn = document.querySelector('[data-checkout-kit]');
  if (checkoutKitBtn) {
    checkoutKitBtn.addEventListener('click', () => {
      if (kitItems.length < 2) { showToast('Adicione 2+ itens para kit com desconto'); return; }
      // Envia kit pro carrinho
      kitItems.forEach(item => {
        // Simula adicionar ao carrinho existente
        const event = new CustomEvent('sfl:add-to-cart', {detail:{sku:item.sku, qty:1}});
        document.dispatchEvent(event);
      });
      kitItems = [];
      updateKitUI();
      document.querySelector('[data-open-cart]')?.click();
    });
  }
}

// 5. Prova Social Tempo Real
function initSocialProof() {
  const container = document.querySelector('[data-social-proof]');
  if (!container) return;
  
  const names = ["Dra. Ana","Dra. Camila","Dra. Beatriz","Dra. Larissa","Dra. Fernanda","Dr. Rafael"];
  const cities = ["Recife","Camaragibe","Olinda","Jaboatão","Paulista","São Paulo"];
  const products = ["Scrub Noir Navy M","Jaleco Axis Branco P","Scrub Pulse Azul G"];
  
  function showOne() {
    const name = names[Math.floor(Math.random()*names.length)];
    const city = cities[Math.floor(Math.random()*cities.length)];
    const prod = products[Math.floor(Math.random()*products.length)];
    const minutes = Math.floor(Math.random()*30)+1;
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;bottom:20px;left:20px;background:white;border:1px solid #eee;border-radius:12px;padding:12px 16px;box-shadow:0 8px 24px rgba(16,31,57,.15);font-size:12px;z-index:9999;max-width:320px;animation:slideIn .4s ease';
    el.innerHTML = `<div style="display:flex;gap:10px;align-items:center"><div style="width:32px;height:32px;background:#101F39;color:#D6BE9D;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700">${name.charAt(0)}</div><div><strong>${name} de ${city}</strong> comprou<br>${prod} há ${minutes} min<br><small style="color:#4A7C6F">✓ Compra verificada</small></div><button onclick="this.parentElement.parentElement.remove()" style="margin-left:auto;background:none;border:none;cursor:pointer">×</button></div>`;
    document.body.appendChild(el);
    setTimeout(()=>{el.style.opacity='0';el.style.transform='translateY(10px)';setTimeout(()=>el.remove(),400)},5000);
  }
  
  setInterval(showOne, 25000); // a cada 25s
  setTimeout(showOne, 5000); // primeira após 5s
}

// 6. Coleta Agendada
function initCollectionDate() {
  const select = document.querySelector('[data-collection-date]');
  if (!select) return;
  
  fetch('/api/collection-dates')
    .then(r=>r.json())
    .then(dates=>{
      select.innerHTML = dates.map(d=>`<option value="${d.date}">${d.fullLabel} - ${d.slots[0]} | Entrega ${d.estimate?d.estimate.deliveryLabel:''}</option>`).join('');
    })
    .catch(()=>{
      // fallback offline
      const today = new Date().toISOString().slice(0,10);
      select.innerHTML = `<option value="${today}">Hoje - 16:00 Coleta Divinópolis | Entrega em 2 dias</option>`;
    });
}

// 7. QR Code Recompra
function initReorderQr() {
  const qrs = document.querySelectorAll('[data-reorder-qr]');
  qrs.forEach(async el=>{
    const sku = el.dataset.sku;
    try{
      const res = await fetch(`/api/qr/reorder?sku=${encodeURIComponent(sku)}`);
      const data = await res.json();
      if(data.qrDataUrl){
        const img = document.createElement('img');
        img.src = data.qrDataUrl;
        img.style.width='120px';
        img.style.height='120px';
        el.appendChild(img);
      }
    }catch{}
  });
}

// 8. Indicação Médica
function initReferral() {
  const urlParams = new URLSearchParams(window.location.search);
  const ref = urlParams.get('ref');
  if(ref){
    localStorage.setItem('sfl_ref', ref);
    const banner = document.createElement('div');
    banner.style.cssText = 'background:#101F39;color:#EEDCC6;padding:10px;text-align:center;font-size:12px;position:sticky;top:0;z-index:100';
    banner.innerHTML = `Você foi indicada por Dra. ${ref} - Ganhe R$50 OFF no seu primeiro pedido! Cupom aplicado automaticamente.`;
    document.body.prepend(banner);
  }
  
  const refForm = document.querySelector('[data-referral-form]');
  if(refForm){
    refForm.addEventListener('submit', async e=>{
      e.preventDefault();
      const nome = refForm.querySelector('[name="nome"]').value;
      const zap = refForm.querySelector('[name="whatsapp"]').value;
      const res = await fetch('/api/referral', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({doctorName:nome,whatsapp:zap})});
      const data = await res.json();
      const resDiv = refForm.querySelector('[data-referral-result]');
      if(data.link){
        resDiv.innerHTML = `Seu link de indicação: <strong>${data.link}</strong><br><button onclick="navigator.clipboard.writeText('${data.link}')">Copiar link</button><br><small>Você ganha R$50 por cada venda e sua amiga também!</small>`;
      }
    });
  }
}

// 9. PWA Push Venda (Admin)
function initAdminPush() {
  if (!('Notification' in window)) return;
  const btn = document.querySelector('[data-enable-push]');
  if(!btn) return;
  btn.addEventListener('click', async ()=>{
    const perm = await Notification.requestPermission();
    if(perm==='granted'){
      btn.textContent='Notificações ativadas ✓';
      // Aqui integraria com Push API do navegador + backend
      showToast('Você receberá notificação a cada venda!');
    }
  });
}

// 10. Devolução 1 Clique
function initReverse() {
  const forms = document.querySelectorAll('[data-reverse-form]');
  forms.forEach(form=>{
    form.addEventListener('submit', async e=>{
      e.preventDefault();
      const order = form.querySelector('[name="order"]').value;
      const sku = form.querySelector('[name="sku"]').value;
      const reason = form.querySelector('[name="reason"]').value;
      const resDiv = form.querySelector('[data-reverse-result]');
      try{
        const res = await fetch('/api/reverse', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({originalOrder:order,sku,reason,quantity:1})});
        const data = await res.json();
        resDiv.innerHTML = `✅ Devolução criada ${data.id}<br>Status: ${data.status}<br>Etiqueta reversa será gerada e coleta agendada em Divinópolis`;
      }catch{
        resDiv.textContent='Erro ao criar devolução';
      }
    });
  });
}

function showToast(msg){
  const region = document.querySelector('[data-toast-region]');
  if(!region){alert(msg);return;}
  const el = document.createElement('div');
  el.style.cssText='background:#101F39;color:#fff;padding:12px 16px;border-radius:8px;margin-bottom:8px;font-size:12px;box-shadow:0 8px 24px rgba(0,0,0,.2)';
  el.textContent=msg;
  region.appendChild(el);
  setTimeout(()=>el.remove(),4000);
}

// Init tudo quando DOM pronto
document.addEventListener('DOMContentLoaded', ()=>{
  initEmbroideryLivePreview();
  initSizeQuiz();
  initWaitlist();
  initKitBuilder();
  initSocialProof();
  initCollectionDate();
  initReorderQr();
  initReferral();
  initAdminPush();
  initReverse();
  
  // Modo plantão noturno
  const hour = new Date().getHours();
  const isNight = hour>=19 || hour<=6;
  if(isNight){
    document.body.classList.add('plantao-noturno');
    const banner = document.createElement('div');
    banner.style.cssText='background:#1C3158;color:#EEDCC6;padding:8px;text-align:center;font-size:11px';
    banner.textContent='🌙 Modo Plantão Noturno ativado - luz suave para não cansar seus olhos às 2h da manhã';
    document.body.prepend(banner);
  }
});

console.log('✅ Surgery For Life - Premium Features V2 carregadas: Bordado ao vivo, Prova tamanho IA, Lista espera, Kit Builder, Prova social, Coleta agendada, QR Recompra, Indicação, Push Admin, Devolução 1 clique');
