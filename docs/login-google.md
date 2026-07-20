# Login Google dos clientes

O modulo `src/customer-auth.js` implementa OAuth 2.0 Authorization Code com OpenID Connect. Ele nao substitui a autenticacao interna do painel de estoque (`src/auth.js`): clientes e funcionarios continuam em dominios de autenticacao separados.

## Configuracao no Google Cloud

1. Crie um cliente OAuth do tipo **Aplicativo da Web** na tela de credenciais do Google Cloud.
2. Cadastre exatamente a URI de callback usada pelo servidor. Em desenvolvimento, por exemplo: `http://localhost:3000/api/customer-auth/google/callback`.
3. Em producao, use somente HTTPS e cadastre o dominio real, sem curingas.
4. Preencha as variaveis abaixo no `.env` do servidor. Nunca coloque o client secret em HTML ou JavaScript publico.

```env
GOOGLE_OAUTH_CLIENT_ID=seu-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=seu-segredo-do-google
GOOGLE_OAUTH_CALLBACK_URL=https://www.surgeryforlife.com.br/api/customer-auth/google/callback
CUSTOMER_SESSION_TTL_DAYS=30
```

Se uma das tres variaveis `GOOGLE_OAUTH_*` estiver presente, as tres devem estar configuradas. Quando o login Google estiver desabilitado, o backend responde `503` de forma generica nas rotas OAuth, sem revelar configuracao interna. O checkout continua disponível como guest, com principal anônimo e limitação de tentativas; quando as credenciais forem ativadas, sessões Google passam a exigir CSRF nas escritas.

## API do modulo

Instanciacao sugerida (os endpoints devem ser conectados em `src/server.js`):

```js
const customerAuth = new CustomerAuthService({
  customersFile: path.join(config.root, "runtime/customers.json"),
  sessionsFile: path.join(config.root, "runtime/customer-sessions.json"),
  transactionsFile: path.join(
    config.root,
    "runtime/customer-oauth-transactions.json",
  ),
  clientId: config.googleOauthClientId,
  clientSecret: config.googleOauthClientSecret,
  callbackUrl: config.googleOauthCallbackUrl,
  sessionTtlMs: config.customerSessionTtlDays * 24 * 60 * 60_000,
  secureCookies: config.appEnv === "production",
});
```

- `beginLogin({ returnTo })` devolve `{ authorizationUrl, cookie }`. Responda com `302`, `Location: authorizationUrl` e `Set-Cookie: cookie`.
- `completeLogin({ code, state, cookieHeader })` devolve `{ user, csrf, returnTo, setCookies }`. Responda com `303` para `returnTo` e envie o array `setCookies` como dois headers `Set-Cookie`.
- `me(request)` devolve `{ user, csrf }` ou lanca erro `401`.
- `logout(request)` exige o cookie de sessao e `X-CSRF-Token`, devolve `{ ok, cookie }` e revoga a sessao. Envie o cookie retornado para o navegador.
- `requireCsrf(request)` deve proteger qualquer outra rota autenticada que altere carrinho persistido, enderecos, pedidos ou perfil.
- `sessionFrom(request)` permite identificar o cliente em rotas somente de leitura e retorna `null` quando nao autenticado.

O perfil persistido no servidor contem somente o identificador estavel `sub`, `email` e `name`. A rota publica `/me` devolve apenas `email` e `name`; foto, access token e ID token nao sao armazenados. `returnTo` aceita somente caminho local iniciado por uma unica `/`, tem limite de 1024 caracteres e nunca aceita host, protocolo, barra invertida ou caracteres de controle.

No callback, limpe o cookie transitorio inclusive em falhas. Em sucesso, redirecione ao `returnTo` por `303`, removendo `code` e `state` da barra do navegador; em falha, use um destino local fixo como `/loja?login=erro`. Nao coloque mensagens, codigos de autorizacao, state, nonce ou respostas do Google na URL de erro ou nos logs.

## Protecoes implementadas

- Escopos limitados a `openid email profile`; o fluxo nao pede acesso offline nem emite refresh token para a aplicacao.
- `state` vinculado a cookie transitorio aleatorio, `nonce` OIDC e PKCE `S256` em toda tentativa.
- Transacao de login com 10 minutos de validade e uso unico, consumida antes da chamada de rede.
- `redirect_uri` identica na autorizacao e na troca do codigo, conforme cadastrada no Google.
- Verificacao RSA/SHA-256 do `id_token` por JWKS usando `node:crypto`, com cache, TTL limitado e atualizacao controlada para rotacao de chave.
- Validacao estrita de `iss`, `aud`/`azp`, `exp`, `iat`, `nonce`, `email_verified`, `sub`, e-mail e nome.
- Cookie transitorio `sfl_customer_oauth`: `HttpOnly`, `SameSite=Lax`, 10 minutos e `Secure` em producao.
- Cookie `sfl_customer_session`: `HttpOnly`, `SameSite=Lax`, no maximo 90 dias e `Secure` em producao. `Lax` preserva navegacao normal vinda de links externos; CSRF continua obrigatorio em escritas.
- Tokens de sessao aleatorios de 256 bits; somente SHA-256 e persistido. Access token e ID token nunca sao armazenados.
- CSRF aleatorio em operacoes de escrita, logout com revogacao no servidor e cookies sem atributo `Domain`.
- Limites de tamanho para cookies, codigo, JWT, respostas do endpoint de token e JWKS.

## Operacao em producao

Nenhum software pode prometer risco zero. Antes do lancamento, use HTTPS/HSTS no proxy, mantenha Node e o sistema operacional atualizados, restrinja permissoes dos arquivos de `runtime`, proteja backups e aplique rate limit nos endpoints `/start` e `/callback`. Para mais de uma instancia do servidor, substitua os arquivos JSON por um armazenamento transacional compartilhado (por exemplo, PostgreSQL/Redis) com TTL e consumo atomico da transacao OAuth. Configure alertas sem registrar tokens ou dados completos do cliente.
