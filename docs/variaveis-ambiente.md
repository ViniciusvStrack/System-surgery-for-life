# Variáveis de ambiente

Copie `.env.example` para `.env`. Nunca envie `.env` ao GitHub.

| Variável | Finalidade | Produção |
|---|---|---|
| `APP_ENV` | Ativa as proteções do ambiente | Use `production` |
| `HOST` | Interface de rede do servidor | `0.0.0.0` no contêiner; `127.0.0.1` local |
| `PORT` | Porta HTTP | Obrigatória |
| `ENABLE_SIMULATOR` | Habilita o chat de teste | Use `false` |
| `ADMIN_TOKEN` | Protege a API do estoque | Segredo forte e único |
| `AUTH_ENCRYPTION_KEY` | Protege segredos internos e valida a configuração | Aleatória, com 32+ caracteres |
| `BOOTSTRAP_ADMIN_EMAIL` | Conta inicial do painel | Use apenas no primeiro provisionamento |
| `BOOTSTRAP_ADMIN_PASSWORD` | Senha inicial do painel | Longa, única e temporária |
| `GOOGLE_OAUTH_CLIENT_ID` | Identifica o cliente OAuth web | Recomendada; guest checkout funciona sem OAuth |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Segredo OAuth mantido no servidor | Gerenciador de segredos |
| `GOOGLE_OAUTH_CALLBACK_URL` | Callback exato do login Google | HTTPS no domínio real |
| `CUSTOMER_SESSION_TTL_DAYS` | Validade da sessão de cliente | Entre 1 e 90 dias |
| `EXPOSE_DEVELOPMENT_RESET_TOKEN` | Exibe token de reset somente em teste local | Sempre `false` |
| `VERIFY_TOKEN` | Verificação do webhook Meta | Segredo forte e único |
| `WHATSAPP_TOKEN` | Acesso à Cloud API | Gerenciador de segredos |
| `PHONE_NUMBER_ID` | Identifica o número na Meta | Obrigatória |
| `META_APP_SECRET` | Valida assinatura da Meta | Gerenciador de segredos |
| `GRAPH_API_VERSION` | Versão da API Graph | Conferir antes de publicar |
| `STORE_WHATSAPP_NUMBER` | Número que recebe alertas | Formato internacional |
| `STORE_NAME` | Nome exibido pelo bot | Surgery For Life |
| `RESERVATION_TTL_MINUTES` | Tempo da reserva criada pelo site | Inteiro entre 5 e 1440; padrão 30 |
| `BUSINESS_HOURS` | Horário operacional | Configurar |
| `DELIVERY_FEE` | Frete padrão | Configurar |
| `FREE_SHIPPING_FROM` | Limite de frete grátis | Configurar |
