# Deploy Profissional Pago - Surgery For Life

Guia completo do que acontece depois que seu site React TS fica pronto perfeito.

## O que é deploy amador vs profissional pago

**Amador:** Hospedagem R$15/mês compartilhada, sobe via FTP, sem backup, domínio sem SSL "Não seguro", se quebra não volta, site lento 6-8s Google te joga pra baixo.

**Profissional Pago:** Hospedagem Cloud dedicada só da Surgery For Life, 3 ambientes LOCAL -> STAGING (homolog) -> PRODUÇÃO, testa no staging, 1 clique vai pro produção, backup diário as 3h guarda 30 dias, restaura em 2 cliques, SSL, CDN, Cache <2s.

## Infra recomendada para Surgery For Life (React TS)

- **Hospedagem:** Cloudways Vultr HF R$110-280/mês ou Hostinger Cloud R$49-90/mês - Cloud Litespeed + Redis + Backup diário. HostGator básico NÃO.
- **Domínio:** Registro.br .com.br R$40/ano + .com R$50/ano
- **CDN + Segurança:** Cloudflare Pro R$80/mês ou grátis no começo - site rápido Brasil todo + WAF
- **SSL:** Grátis via Cloudflare/Let's Encrypt, cadeado verde
- **Banco Estoque:** Supabase grátis até 500MB depois R$90/mês - sai de JSON localStorage para Postgres multi-dispositivo (ela no Divinópolis e você em Recife veem mesmo estoque)
- **Backend:** Se seu React tem Node, mesmo Cloudways serve. Se for só frontend, Vercel Pro R$90/mês.

## Passo a passo deploy Vercel (mais fácil para React TS)

0. Checklist antes:
```bash
npm run build
npm run preview
```
Se abrir e tudo funcionar (fotos, personalização cor/tamanho, botão WhatsApp), pode ir.

1. GitHub:
```bash
git init
git add .
git commit -m "Surgery For Life - loja completa"
git remote add origin https://github.com/seuuser/surgery-for-life.git
git push -u origin main
```

2. Vercel:
- vercel.com → Add New Project → Importa do GitHub
- Framework: Vite, Build: `npm run build`, Output: `dist`
- Environment Variables: `VITE_API_URL`, `VITE_SUPABASE_KEY`
- Deploy → 2 minutos link `https://surgery-for-life.vercel.app`

Toda vez que der `git push` na main, deploy automático (CI/CD).

3. Domínio:
- Vercel → Settings → Domains → Add `surgeryforlife.com.br` e `www...`
- Vercel te dá 2 DNS `ns1.vercel-dns.com`
- Registro.br → Editar Zona DNS → troca para esses 2 da Vercel
- 1-4h propaga, vira `surgeryforlife.com.br` oficial SSL

4. Backend/Estoque:
- Supabase cria projeto, tabela `produtos`, `movimentacoes`
- Troca `localStorage.setItem` por `supabase.from('produtos').insert()`

5. Google para ser visitado:
- Gera `sitemap.xml` e `robots.txt` (plugin vite-plugin-sitemap)
- Google Search Console → Adicionar propriedade → Colar sitemap → Pedir indexação
- 3-7 dias indexa
- Instala GA4 + Pixel Meta antes do deploy

## Checklist deploy profissional que você entrega

✅ Domínio .com.br/.com configurado
✅ SSL cadeado verde
✅ Hospedagem Cloud Litespeed + Redis
✅ CDN Cloudflare
✅ Backup diário automático + restauração 1 clique
✅ Ambiente STAGING para testar
✅ Cache <2.5s
✅ Monitoring uptime 99.9%
✅ sitemap.xml, robots.txt, Search Console, GA4, Pixels

## Custo real deploy profissional pago

Vercel Pro R$90/mês + Supabase R$0-90 + Domínio R$40/ano = ~R$130/mês já incluso no seu mensal R$590 que cobra dela. Seu lucro R$460.
