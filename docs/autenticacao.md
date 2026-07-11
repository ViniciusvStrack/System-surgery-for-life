# Autenticação do painel

## Primeiro acesso local

As credenciais iniciais ficam somente no `.env` e não são enviadas ao GitHub:

```env
BOOTSTRAP_ADMIN_EMAIL=admin@surgeryforlife.com.br
BOOTSTRAP_ADMIN_PASSWORD=defina-uma-senha-inicial-forte
AUTH_ENCRYPTION_KEY=defina-uma-chave-aleatoria-longa
```

No primeiro login, o administrador é obrigado a cadastrar a chave exibida em um aplicativo TOTP, como Google Authenticator, Microsoft Authenticator ou 1Password, e confirmar o código de seis dígitos. Guarde o dispositivo e estabeleça um procedimento interno de recuperação.

## Perfis

- `admin`: estoque, usuários, auditoria e configurações; 2FA obrigatório.
- `stock`: cadastro, ajuste e movimentação de produtos.
- `support`: consulta de produtos, saldos e histórico; somente leitura.

## Proteções implementadas

- Senhas com `scrypt`, salt aleatório de 16 bytes e comparação em tempo constante.
- Sessões aleatórias de 256 bits armazenadas no servidor.
- Cookie `HttpOnly`, `SameSite=Strict` e `Secure` em produção.
- Expiração de sessão em oito horas e revogação no logout/reset de senha.
- CSRF token para operações de escrita.
- Limite de tentativas de login e bloqueio temporário.
- TOTP de seis dígitos para administradores.
- Tokens de recuperação aleatórios, armazenados como hash, válidos por 30 minutos e de uso único.
- Auditoria de criação de usuário, login, logout, 2FA, recuperação e alterações de estoque.
- Content Security Policy e bloqueio de iframe.

## Recuperação de senha

Em desenvolvimento, o token temporário é mostrado na interface para permitir testes. Em produção, `APP_ENV=production` impede essa exibição. Antes do lançamento, integre um provedor transacional de e-mail; a resposta pública continua genérica para não revelar se uma conta existe.

## Produção

Troque as credenciais iniciais, gere uma chave de criptografia forte, habilite HTTPS e migre usuários/sessões/auditoria para PostgreSQL/Redis. Proteja backups e nunca reutilize chaves entre homologação e produção.

Referências:

- https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html
