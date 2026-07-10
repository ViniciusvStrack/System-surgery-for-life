# Variáveis de ambiente

Copie `.env.example` para `.env`. Nunca envie `.env` ao GitHub.

| Variável | Finalidade | Produção |
|---|---|---|
| `PORT` | Porta HTTP | Obrigatória |
| `ENABLE_SIMULATOR` | Habilita o chat de teste | Use `false` |
| `ADMIN_TOKEN` | Protege a API do estoque | Segredo forte e único |
| `VERIFY_TOKEN` | Verificação do webhook Meta | Segredo forte e único |
| `WHATSAPP_TOKEN` | Acesso à Cloud API | Gerenciador de segredos |
| `PHONE_NUMBER_ID` | Identifica o número na Meta | Obrigatória |
| `META_APP_SECRET` | Valida assinatura da Meta | Gerenciador de segredos |
| `GRAPH_API_VERSION` | Versão da API Graph | Conferir antes de publicar |
| `STORE_WHATSAPP_NUMBER` | Número que recebe alertas | Formato internacional |
| `STORE_NAME` | Nome exibido pelo bot | Surgery For Life |
| `BUSINESS_HOURS` | Horário operacional | Configurar |
| `DELIVERY_FEE` | Frete padrão | Configurar |
| `FREE_SHIPPING_FROM` | Limite de frete grátis | Configurar |
