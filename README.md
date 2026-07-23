# Chatbot de loja para WhatsApp

Bot transacional para a API oficial WhatsApp Cloud API. Ele apresenta catálogo, pesquisa produtos, mantém carrinho por cliente, coleta dados de entrega, registra pedidos, consulta status e transfere a conversa para uma pessoa. Pagamentos ficam fora do bot e são combinados pela equipe no próprio WhatsApp.

## Testar agora com a interface visual

O projeto não usa pacotes externos. Requer Node.js 20 ou superior.

```powershell
npm test
npm run demo
Copy-Item .env.example .env
npm start
```

Com a porta padrão, abra `http://localhost:3000` para acessar a loja Surgery For Life, explorar a coleção, personalizar produtos e usar a sacola. O simulador visual do WhatsApp foi preservado em `http://localhost:3000/simulador`; o botão ↻ reinicia a conversa. Abra `http://localhost:3000/health` para verificar o servidor. Se alterar `PORT`, use a mesma porta nas URLs.

Painel integrado do estoque: `http://localhost:3000/estoque`. A interface profissional está separada em `public/estoque/index.html`, `styles.css`, `api.js` e `app.js`. Consulte `docs/implantacao-producao.md` e `docs/integracao-whatsapp.md` para produção.

O painel possui contas individuais, perfis, sessões seguras, auditoria, recuperação de senha e 2FA obrigatório para administradores. Consulte `docs/autenticacao.md`.

O acesso dos clientes usa Google OAuth 2.0/OpenID Connect, separado das contas administrativas. Para configurar Client ID, segredo, callback HTTPS e política de produção, consulte `docs/login-google.md`.

Em produção, defina `ENABLE_SIMULATOR=false` no `.env` se não quiser deixar o simulador público.

## Personalização

- Edite `data/catalog.json` com produtos, estoque, preços e variações reais.
- Edite `data/faqs.json` com políticas e respostas da loja.
- Edite `.env` com nome da loja, frete e credenciais da Meta.
- Estoque, pedidos, movimentações e idempotência ficam no agregado atômico `runtime/inventory.json`; sessões do bot ficam em `runtime/sessions.json`.
- O contrato do checkout e do handoff assinado está em `docs/checkout-whatsapp.md`.
- O assistente virtual privado, seus limites de conhecimento e o contrato da API estão em `docs/assistente-virtual.md`.

## Conectar ao WhatsApp Cloud API

1. Crie um aplicativo empresarial na Meta for Developers e adicione o produto WhatsApp.
2. Copie `.env.example` para `.env` e preencha `WHATSAPP_TOKEN`, `PHONE_NUMBER_ID`, `META_APP_SECRET` e um `VERIFY_TOKEN` secreto criado por você.
3. Publique este servidor em HTTPS. Durante desenvolvimento, use um túnel HTTPS confiável apontando para a porta 3000.
4. Cadastre `https://SEU-DOMINIO/webhook` como URL de callback e use o mesmo `VERIFY_TOKEN`.
5. Assine o campo de webhook `messages` e teste com um número autorizado.
6. Configure `STORE_WHATSAPP_NUMBER` no formato internacional, somente dígitos. Novos pedidos e pedidos de atendente serão notificados nesse número.

Não publique o arquivo `.env`. Use token permanente de usuário do sistema em produção e proteja o servidor com HTTPS.

## Comandos do cliente

O cliente normalmente escolhe produtos respondendo `1`, `2` ou `3`; não precisa copiar códigos. Também estão disponíveis: `menu`, `catálogo`, `buscar`, `carrinho`, `alterar ITEM QUANTIDADE`, `remover ITEM`, `limpar carrinho`, `favoritos`, `observação TEXTO`, `finalizar`, `status`, `atendente` e `cancelar`.

## Arquitetura e segurança

- `src/server.js`: servidor HTTP, webhook e orquestração.
- `src/whatsapp.js`: valida assinatura e conversa com a Graph API.
- `src/bot.js`: máquina de estados do atendimento e pedidos.
- `src/catalog.js`: catálogo e busca textual.
- `src/json-store.js`: persistência local atômica.
- `data/`: conteúdo editável da loja.
- `tests/`: testes dos principais fluxos.

O webhook limita o corpo a 1 MB, valida a assinatura HMAC da Meta com comparação segura, não registra tokens, não coleta cartão e vincula a consulta de pedido ao número do cliente. Para grande volume, substitua os arquivos JSON por PostgreSQL/Redis e processe webhooks em uma fila.

---

## 🚀 Melhorias V2 Impecável - Auditoria Especialista (Jul 2026)

Este fork foi auditado como QA especialista - 86/86 testes passando (antes 82/86 com 4 cancelados).

### Correções Críticas

- **Fix timeout JWKS**: Removido `timer.unref()` em `src/customer-auth.js` que causava cancelamento de 4 testes de segurança (timeout corpo, CSRF logout, Secure cookies, OAuth TTL). Agora 86/86 PASS.
- **Paleta Premium Surgery For Life**: Atualizado `public/loja/styles.css` --lime de #f3dfb2 para Champagne #D6BE9D (cor oficial da marca) e --lime-soft para #EEDCC6
- **Low-Stock Notifier**: Novo `src/low-stock-notifier.js` - Envia alerta WhatsApp automático quando SKU fica abaixo do mínimo. Integra com `STORE_WHATSAPP_NUMBER` e evita spam (1x por dia por SKU). Log automático em Divinópolis.
- **Alerta estoque baixo no commerce**: Adicionado warning em `src/commerce.js` ao reservar última unidade: `[LowStock] ALERTA: SFL-NAVY-M-NOIR saldo 2 <= mínimo 3 | Divinópolis - Repor urgente!`

### Novos Documentos para Operação Real Camaragibe

- `docs/logistica-camaragibe.md` - Guia completo estoque em casa Condomínio Divinópolis, organização caixas, etiqueta Melhor Envio R$22 com coleta Jadlog em casa, embalagem R$3,95, transporte Divinópolis → Centro Camaragibe → cliente
- `docs/custos-operacao.md` - Cálculo custo total: Investimento inicial R$8.520 sem produtos, mensal fixo R$186-472, variável por pedido R$25,95, simulação lucro 10-100 pedidos, suporte mensal R$590 vs operação completa R$1.990
- `docs/paletas.md` - 4 paletas premium com hex: Current Brand Navy #101F39 Champagne #D6BE9D, Deep Forest & Sage, Midnight Blue & Dusty Rose, Charcoal & Warm Sand - com psicologia, uso e recomendação
- `docs/deploy-profissional.md` - Passo a passo deploy React TS: build, GitHub, Vercel Pro R$90/mês, domínio Registro.br, Supabase, sitemap, Search Console, checklist profissional

### Arquitetura Auditada

- **Segurança**: HMAC validação, body 1MB limite, secure comparison, rate limiters (30 req/60s auth, 12 req/15min pedidos, 60 req/5min assistente), webhook deduplicator, 2FA obrigatório admin, audit
- **Inventário Atômico**: Revisão, idempotência, reserva com TTL 30min, liberação expirada, validação corrupção, seed, PUT com revision conflict detection, protege SKU com reserva ativa
- **Bot**: State machine, carrinho por cliente, favoritos, quantidade por extenso pt-BR (um, duas...), intent conversacional (obrigado, tchau, quem é você), handoff assinado SFLH_ token para vincular site → WhatsApp, comandos menu/catálogo/buscar/carrinho/alterar/remover/finalizar/status/atendente/cancelar
- **Commerce**: Idempotência, última unidade só reservada por um pedido, não baixa parcial se falta item, preço/SKU adulterados ignorados, URL WhatsApp sem PII, handoff expira libera saldo 1x

### Como testar V2 Impecável

```bash
npm test # agora 86/86 PASS, 0 cancelados, 0 fail
npm run demo
cp .env.example .env
npm start
# Loja: http://localhost:3000
# Simulador WhatsApp: http://localhost:3000/simulador
# Estoque: http://localhost:3000/estoque (login com bootstrap admin)
# Health: http://localhost:3000/health
```

### Deploy Produção Recomendado para Surgery For Life

- **Hospedagem**: Cloudways Vultr HF R$110/mês (Litespeed + Redis + Backup) ou Hostinger Cloud R$49/mês para começo
- **CDN**: Cloudflare Pro R$80/mês (ou grátis)
- **Domínio**: Registro.br .com.br R$40/ano
- **Banco**: Supabase grátis 500MB depois R$90/mês (migra runtime/*.json para Postgres)
- **WhatsApp**: Wati/Z-API R$80-150/mês API oficial selo verde
- **Frete**: Melhor Envio grátis + Jadlog R$22 média com coleta em casa Divinópolis

Custo infra já incluso nos R$590/mês suporte que você cobra, lucro líquido R$400+.

### Próximos Passos Sugeridos

1. Migrar runtime/*.json para Supabase Postgres + Redis para alta concorrência
2. Adicionar TypeScript gradual via JSDoc ou migração completa
3. Modularizar src/server.js (1077 linhas) em routes/loja.js, routes/estoque.js, routes/webhook.js
4. Adicionar ESLint + Prettier CI check
5. Implementar fila para webhooks WhatsApp em produção (BullMQ)
6. LGPD: adicionar página /privacidade e /termos já existentes em public/loja

