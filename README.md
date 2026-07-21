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
