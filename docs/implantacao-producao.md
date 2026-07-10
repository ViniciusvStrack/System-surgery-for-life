# Implantação da Surgery For Life no Brasil

## O que esta versão já entrega

- Chatbot, catálogo e estoque usando a mesma fonte de dados.
- Agrupamento de cores e tamanhos no catálogo.
- Reserva de estoque antes de registrar o pedido.
- Saída automática com motivo `Venda WhatsApp`, cliente e número do pedido.
- Controle de versão contra sobrescrita por tela desatualizada.
- Token administrativo, validação de dados e bloqueio de marcação HTML.
- Histórico de movimentações, pedidos, sessões e testes automatizados.

## Migração dos dados atuais

1. Inicie o servidor com `npm start`.
2. Se os dados foram cadastrados abrindo o HTML diretamente, abra novamente o mesmo arquivo no mesmo navegador. Ele preserva o `localStorage` dessa origem.
3. Informe o `ADMIN_TOKEN` quando solicitado. No ambiente local atual ele está no arquivo `.env`.
4. Se o estoque central estiver vazio, o painel enviará automaticamente os produtos e movimentações locais.
5. Depois da migração, use `http://localhost:3002/estoque`. O indicador deve mostrar `Estoque central: Sincronizado`.
6. Confira quantidades, preços e histórico antes de permitir pedidos.

Faça um backup/exportação antes da migração. Os produtos demonstrativos devem ser removidos ou substituídos pelos produtos reais.

## Antes de vender em produção

O armazenamento JSON é adequado para desenvolvimento e validação, mas deve ser substituído por PostgreSQL em produção. Use transações para reserva de estoque, índices únicos para SKU e idempotência para webhooks e pedidos. Redis/fila pode ser adicionado para sessões e processamento de mensagens.

Também são necessários:

- Login individual para funcionários, senhas com hash, funções e trilha de auditoria.
- HTTPS, firewall, limitação de requisições e origens CORS restritas.
- Backups automáticos, criptografados e testados por restauração.
- Monitoramento, alertas, logs sem tokens e plano de incidentes.
- Ambiente de homologação separado da produção.
- Política de privacidade, termos, retenção e exclusão de dados.
- Canal para solicitações de titulares e definição das responsabilidades da empresa.
- Validação contábil/fiscal do fluxo de pedidos, notas e operações brasileiras.

Dados de nome, telefone, endereço e histórico de compras são dados pessoais. A empresa deve definir finalidade, base legal, acesso, retenção e medidas de segurança com suporte jurídico especializado. Este documento é um roteiro técnico, não parecer jurídico ou contábil.

Referências oficiais:

- ANPD — Segurança para agentes de pequeno porte: https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-sobre-seguranca-da-informacao-para-agentes-de-tratamento-de-pequeno-porte
- ANPD — Resolução CD/ANPD nº 2/2022: https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-2-de-27-de-janeiro-de-2022
