# Desenvolvimento

Este é um sistema proprietário da Surgery For Life. Mudanças devem ser revisadas e testadas antes de entrar na branch `main`.

## Fluxo recomendado

1. Crie uma branch curta a partir de `main`.
2. Não inclua dados reais, `.env` ou arquivos de `runtime/`.
3. Execute `npm test`.
4. Atualize a documentação quando alterar configurações ou fluxos.
5. Abra um pull request descrevendo impacto, testes e plano de reversão.

## Padrões

- Mensagens e interfaces voltadas ao cliente devem estar em português claro.
- Preço e estoque nunca devem ser inventados pelo chatbot.
- Toda baixa deve ser atômica e auditável.
- Novas integrações precisam validar autenticação, entrada e falhas externas.
