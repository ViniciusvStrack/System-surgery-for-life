# Checkout do site e continuidade no WhatsApp

## Fluxo transacional

`POST /api/store/orders` valida o carrinho novamente no servidor e grava, em uma única troca atômica de `runtime/inventory.json`:

- pedido;
- reserva/baixa do saldo disponível;
- movimentações;
- chave de idempotência.

O navegador não é autoridade para SKU, preço, nome do produto, subtotal, identidade do cliente ou número de destino. A variante e o preço são resolvidos a partir do estoque central. A mesma `Idempotency-Key` com o mesmo conteúdo devolve o mesmo pedido sem uma segunda baixa; reutilizá-la com outro conteúdo retorna conflito.

Clientes com sessão Google precisam enviar o CSRF da sessão. Enquanto OAuth não estiver configurado, visitantes podem fechar um pedido como guest. O servidor guarda somente um hash anônimo do contexto do visitante como principal do pedido; não aceita nome, e-mail ou telefone enviados pelo navegador como identidade confiável.

## Estoque inicial e variantes

`data/inventory.seed.json` é usado somente quando `runtime/inventory.json` está ausente ou não possui produtos. O seed contém os seis produtos do catálogo distribuídos por tamanho.

Por enquanto, cada SKU representa `productId + tamanho`. Cor e modelagem são customizações validadas contra `data/catalog.json`, mas não criam SKUs separados. Se a operação passar a manter saldo físico diferente por cor ou modelagem, cada combinação deverá ganhar `variantId` e SKU próprios antes da venda.

Um estoque existente, mas corrompido, nunca é substituído silenciosamente pelo catálogo de demonstração: as APIs falham fechadas com indisponibilidade.

## Contrato

```http
POST /api/store/orders
Content-Type: application/json
Idempotency-Key: 01J... ou UUID
X-CSRF-Token: necessário somente quando houver sessão Google válida
```

```json
{
  "items": [
    {
      "variantId": "JAL-001-M",
      "color": "Branco óptico",
      "model": "Essencial",
      "quantity": 1,
      "personalization": {
        "name": "Dra. Ana",
        "profession": "Cardiologia"
      }
    }
  ],
  "note": ""
}
```

Pedido novo retorna `201`; replay idempotente retorna `200` com `Idempotency-Replayed: true`. Conflitos de saldo ou idempotência retornam `409`. Configuração incompleta ou estoque indisponível retornam `503`.

`GET /api/store/config` expõe somente:

```json
{
  "whatsappAvailable": true,
  "whatsappUrl": "https://wa.me/...",
  "reservationTtlMinutes": 30,
  "guestCheckout": true
}
```

## Handoff assinado

O link devolvido ao checkout contém apenas código, total e um token HMAC opaco. Não contém nome, e-mail, endereço, personalização, cookie ou CSRF. Quando a mensagem chega pelo webhook oficial, o bot valida o token com comparação em tempo constante e vincula a reserva ao número remetente.

- o mesmo número pode repetir a mensagem com segurança;
- outro número não pode tomar a reserva;
- token adulterado ou expirado é recusado;
- vincular o WhatsApp não gera nova baixa;
- token e principal nunca aparecem no snapshot administrativo.

## Expiração

Pedidos começam como `reserved_whatsapp`. Se o cliente não fizer o handoff até `reservationExpiresAt`, a reserva muda uma única vez para `expired`, cada saldo é recomposto e são criadas movimentações de entrada auditáveis. Depois de um handoff válido, o status passa para `whatsapp_connected` e a baixa permanece mesmo após o prazo original, pois o cliente já confirmou a continuidade no WhatsApp. A chave idempotente continua apontando para pedidos expirados; para uma nova tentativa, o cliente deve gerar uma nova chave.

## Limite do armazenamento local

O agregado JSON oferece commit único e exclusão natural dentro de um único processo Node, adequado para operação local e homologação. Não oferece lock entre múltiplos processos ou servidores. Antes de escalar horizontalmente, migrar o mesmo contrato para PostgreSQL usando transação, índices únicos de SKU/idempotência e atualização condicional de saldo.
