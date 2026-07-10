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

Abra `http://localhost:3002` no navegador para conversar em um simulador visual semelhante ao WhatsApp. O botão ↻ reinicia a conversa. Abra `http://localhost:3002/health` para verificar o servidor.

Painel integrado do estoque: `http://localhost:3002/estoque`. Consulte `docs/implantacao-producao.md` para migrar dados locais e `docs/integracao-whatsapp.md` para conectar o número oficial.

Em produção, defina `ENABLE_SIMULATOR=false` no `.env` se não quiser deixar o simulador público.

## Personalização

- Edite `data/catalog.json` com produtos, estoque, preços e variações reais.
- Edite `data/faqs.json` com políticas e respostas da loja.
- Edite `.env` com nome da loja, frete e credenciais da Meta.
- Pedidos ficam em `runtime/orders.json`; sessões ficam em `runtime/sessions.json`.

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
