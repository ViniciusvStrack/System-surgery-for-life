# Segurança

## Reportar vulnerabilidades

Não publique tokens, dados de clientes ou detalhes de vulnerabilidades em issues públicas. Envie o relato diretamente ao responsável técnico da Surgery For Life por um canal privado definido pela empresa.

Inclua uma descrição, forma de reprodução, impacto e possíveis medidas de correção. Não acesse, altere ou compartilhe dados reais de clientes durante testes.

## Segredos

- Credenciais ficam apenas em variáveis de ambiente ou gerenciador de segredos.
- `.env` e `runtime/*.json` nunca devem ser versionados.
- Um segredo exposto deve ser revogado e substituído imediatamente.
- O token local de desenvolvimento não deve ser reutilizado em produção.

## Produção

Antes de operar com clientes reais, use HTTPS, banco transacional, autenticação individual, menor privilégio, backups testados, monitoramento e processo de resposta a incidentes.
