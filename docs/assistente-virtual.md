# Assistente virtual da loja

O assistente do site responde dúvidas em português sem depender de uma API externa ou de uma chave de inteligência artificial. As respostas são montadas no servidor a partir do catálogo e do estoque atuais, das opções de personalização e da configuração pública da loja.

Ele é deliberadamente limitado ao atendimento comercial da Surgery For Life. Não cria pedidos, não altera estoque, não acessa o painel administrativo e não executa instruções fornecidas pelo visitante.

O mecanismo aceita pequenas trocas ou omissões de letras em palavras comerciais comuns, algo frequente em perguntas digitadas pelo celular. Ele também responde dúvidas gerais de compra, pagamento, entrega, troca, horário e conservação mesmo quando a leitura do catálogo está temporariamente indisponível.

## Endpoint

```http
POST /api/store/assistant
Content-Type: application/json
```

O corpo tem limite de 12 KiB e aceita somente:

```json
{
  "message": "Tem o Jaleco Axis no tamanho M?",
  "conversationId": "conversation_01J123456789"
}
```

- `message` é obrigatória, deve ser texto não vazio e pode ter no máximo 600 caracteres;
- `conversationId` é opcional e, quando enviado, deve ter de 8 a 80 caracteres alfanuméricos, `_` ou `-`;
- campos adicionais são recusados;
- se `conversationId` não for enviado, o servidor cria um identificador opaco e o devolve na resposta.

Resposta:

```json
{
  "reply": "Jaleco Axis está disponível no tamanho M neste momento...",
  "suggestions": ["Personalizar este produto", "Ver outro modelo"],
  "products": [
    {
      "id": "JAL-001",
      "name": "Jaleco Axis",
      "price": 589,
      "image": "/assets/sfl-coat.jpg",
      "stock": 20
    }
  ],
  "action": {
    "type": "product",
    "productId": "JAL-001",
    "label": "Personalizar Jaleco Axis"
  },
  "conversationId": "conversation_01J123456789"
}
```

`reply` e `conversationId` sempre estão presentes. `suggestions`, `products` e `action` aparecem somente quando ajudam a interface. `action.type` pode ser:

- `product`, com `productId`, para abrir o personalizador;
- `size-guide`, para abrir o guia de medidas;
- `whatsapp`, com uma URL HTTPS validada nos domínios oficiais `wa.me` ou `api.whatsapp.com`.

## Limites e erros

Há duas janelas de limitação em memória:

- até 60 solicitações por IP a cada 5 minutos;
- até 24 solicitações por combinação de cliente e conversa a cada 5 minutos.

Erros usam sempre o formato:

```json
{
  "error": {
    "code": "ASSISTANT_RATE_LIMITED",
    "message": "Muitas mensagens em pouco tempo. Aguarde alguns minutos."
  }
}
```

Os principais códigos são:

- `INVALID_CONTENT_TYPE` (`400`);
- `INVALID_JSON` (`400`);
- `INVALID_ASSISTANT_REQUEST` (`400`);
- `INVALID_CONVERSATION_ID` (`400`);
- `ASSISTANT_MESSAGE_TOO_LONG` (`400`);
- `ASSISTANT_PAYLOAD_TOO_LARGE` (`413`);
- `ASSISTANT_RATE_LIMITED` (`429`, com `Retry-After`);
- `ASSISTANT_UNAVAILABLE` (`500`, somente para uma falha interna inesperada).

Uma indisponibilidade isolada do catálogo não derruba mais a conversa: o endpoint devolve `200` com uma explicação segura, sugestões que continuam úteis e, quando configurado, o link oficial do WhatsApp. Nenhum preço, tamanho ou saldo é inventado durante essa degradação. Se o WhatsApp também estiver indisponível, a resposta continua válida e apenas omite `action`.

O estado operacional também aparece em `GET /health`:

```json
{
  "ok": true,
  "assistantAvailable": true,
  "assistantCatalogAvailable": true,
  "assistantMode": "local-read-only"
}
```

## Privacidade e segurança

- O contexto tem no máximo seis entradas, fica somente na memória do processo e expira após 30 minutos. O texto livre do visitante não é guardado: entram apenas IDs de produtos/intenção permitidos e respostas geradas pelo próprio assistente.
- No navegador, apenas o identificador opaco e a expiração ficam em `sessionStorage`; o texto das mensagens não é persistido e desaparece ao recarregar ou fechar a página.
- A conversa é isolada por uma impressão criptográfica do cliente e pelo `conversationId`; o identificador sozinho não recupera a conversa de outro cliente.
- E-mail, telefone, CPF, números longos e credenciais são detectados e removidos antes de qualquer entrada no histórico. O assistente orienta o visitante a não enviar esses dados.
- O conteúdo da conversa não é gravado em arquivos, pedidos, estoque ou logs pelo assistente.
- Tentativas comuns de prompt injection recebem uma resposta limitada; não existe um modelo externo com acesso a segredos ou ferramentas.
- URLs fornecidas pelo visitante nunca são usadas como destino de atendimento. O handoff vem exclusivamente de `CommerceService.publicConfig()` e passa por validação de protocolo e domínio.

## Limites de conhecimento

O assistente pode informar nomes, preços, imagens, saldo total, tamanhos com saldo, cores, modelagens, recursos e personalização cadastrados. Ele também explica o corte a laser de forma estrita aos dados do catálogo.

Não presume composição, gramatura, impermeabilidade, ação antimicrobiana, certificações, medidas corporais, formas de pagamento, prazo de entrega ou regras de troca. Quando uma informação oficial não existe na configuração, ele declara a limitação e oferece o WhatsApp oficial.

Antes de publicar novas alegações sobre tecido ou tecnologia, registre a ficha técnica aprovada no catálogo e amplie os testes correspondentes. Não coloque alegações de marketing apenas no texto do assistente.

## Diagnóstico local

O site deve ser aberto pela aplicação (`http://localhost:3000/loja`), e não diretamente como um arquivo `public/loja/index.html`. Uma página aberta por `file://` não possui a mesma origem do endpoint e não consegue conversar com o servidor.

Para confirmar o backend sem alterar estoque:

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://127.0.0.1:3000/api/store/assistant `
  -ContentType application/json `
  -Body '{"message":"Quais jalecos estão disponíveis?"}'
```

Alterações em `src/` exigem reiniciar o processo Node quando ele foi iniciado com `npm start`. Em desenvolvimento, `npm run dev` reinicia o processo automaticamente quando os arquivos mudam.
