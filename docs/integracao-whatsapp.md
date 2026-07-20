# Integração oficial com o WhatsApp

Este projeto usa a API oficial WhatsApp Cloud API da Meta. Evite automações que imitam o WhatsApp Web: elas não são apropriadas para uma operação empresarial estável.

## Pré-requisitos da empresa

1. Empresa e marca definidas, com site, política de privacidade e canal de suporte.
2. Conta Meta Business e aplicativo empresarial no Meta for Developers.
3. Produto WhatsApp adicionado ao aplicativo e número comercial cadastrado.
4. Servidor público com HTTPS e domínio próprio.
5. Banco de dados e backups configurados.

## Configuração técnica

1. Publique a aplicação em um serviço que execute Node.js 20+.
2. Configure as variáveis de ambiente, nunca dentro do Git:

```env
ENABLE_SIMULATOR=false
VERIFY_TOKEN=um-segredo-criado-por-voce
WHATSAPP_TOKEN=token-permanente-de-usuario-do-sistema
PHONE_NUMBER_ID=id-do-numero-whatsapp
META_APP_SECRET=segredo-do-aplicativo-meta
GRAPH_API_VERSION=versao-atual-suportada
STORE_WHATSAPP_NUMBER=55DDDNUMERO
ADMIN_TOKEN=token-administrativo-longo
```

3. Na configuração de Webhooks da Meta, use `https://SEU-DOMINIO/webhook` e o mesmo `VERIFY_TOKEN`.
4. Assine o campo `messages`.
5. Faça um envio e confirme o recebimento, a resposta e a movimentação no estoque.
6. Cadastre e aprove modelos de mensagens necessários para contatos iniciados pela empresa fora da janela de atendimento permitida pela plataforma. Confirme as regras e preços vigentes na documentação da Meta no momento da implantação.

O servidor já implementa verificação do webhook, validação HMAC `X-Hub-Signature-256`, leitura de texto/botões/listas, marcação como lida e envio pela Graph API.

## Teste gradual recomendado

1. Número de teste fornecido pela Meta.
2. Número real com apenas a equipe interna.
3. Grupo pequeno de clientes convidados.
4. Operação assistida, com atendente acompanhando erros.
5. Liberação geral após revisar métricas e conversas não compreendidas.

## Links oficiais

- Meta — WhatsApp Cloud API: https://developers.facebook.com/docs/whatsapp/cloud-api/
- Meta — Webhooks: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks/
- Meta — Mensagens: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages/
