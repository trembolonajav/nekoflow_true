# Protocolo 03 — autenticação e usuários

## Entrega

O fluxo normal deixou de usar identidade fictícia. Spring Security autentica contas do PostgreSQL,
Spring Session JDBC persiste e revoga sessões, e o navegador recebe apenas o cookie de sessão
`HttpOnly`. O cookie CSRF legível pelo React serve exclusivamente para o padrão double-submit e é
enviado no cabeçalho `X-XSRF-TOKEN` em mutações.

As migrações aditivas `V3__authentication_foundation.sql` e `V4__expand_password_hash.sql` criam
UUID público, estado da conta, perfil, papéis, tokens protegidos, identidades externas futuras,
auditoria e as tabelas oficiais do Spring Session. As chaves `BIGINT` existentes foram preservadas
para não destruir as relações de biblioteca, histórico e solicitações. `content_document` não foi
alterada.

## Endpoints

| Método | Caminho | Acesso |
|---|---|---|
| GET | `/api/auth/csrf` | público |
| POST | `/api/auth/register` | público; cria `PENDING` |
| POST | `/api/auth/verify-email` | público; token único de 24 h |
| POST | `/api/auth/resend-verification` | público; resposta uniforme |
| POST | `/api/auth/login` | público; cria sessão JDBC |
| POST | `/api/auth/logout` | sessão/CSRF |
| GET | `/api/auth/me` | público; visitante ou conta |
| POST | `/api/auth/forgot-password` | público; resposta uniforme |
| POST | `/api/auth/reset-password` | público; token único de 30 min |
| GET/PATCH | `/api/me` | autenticado; consulta/nome público |
| POST | `/api/me/change-password` | autenticado; revoga outras sessões |
| GET | `/api/me/sessions` | autenticado; identificadores opacos |
| DELETE | `/api/me/sessions/{id}` | autenticado; somente sessão própria |

## Regras de segurança

- Novos hashes usam Argon2id; bcrypt legado continua verificável para migração gradual.
- Frase-senha: 15 a 128 caracteres, espaços e Unicode aceitos.
- Cinco falhas bloqueiam temporariamente a conta por 15 minutos; respostas de login permanecem genéricas.
- Conta `PENDING`, `SUSPENDED`, removida ou temporariamente bloqueada não mantém acesso.
- Tokens aleatórios têm 256 bits; somente SHA-256 é persistido e cada token é consumido uma vez.
- Recuperação revoga todas as sessões anteriores e links de recuperação pendentes.
- Papéis `USER`, `MODERATOR`, `EDITOR` e `ADMIN` são aplicados pelo servidor. Cadastro sempre cria `USER`.
- Destinos pós-login aceitam apenas caminhos internos iniciados por `/` e rejeitam `//`.
- Sessão expira após sete dias de inatividade. Em produção, use HTTPS e `SESSION_COOKIE_SECURE=true`.

## E-mail e ambientes

`AuthMailService` separa o domínio do transporte. O Compose usa Mailpit em `localhost:9025`, de modo
que desenvolvimento testa entrega real sem enviar para terceiros. Produção deve definir host, porta,
credenciais, TLS e `NEKOFLOW_PUBLIC_URL`; uma falha de transporte é propagada e nunca vira falso sucesso.

Desative `NEKOFLOW_DEMO` em produção. O primeiro administrador só é criado quando
`NEKOFLOW_BOOTSTRAP_ADMIN=true` e as três variáveis de username, e-mail e senha são fornecidas; desligue
o bootstrap após a primeira execução. MFA continua obrigatório como pendência antes de expor um painel
administrativo privilegiado na internet.

## Validação executada

- Testes Maven: aprovados, incluindo Argon2id, contas pendentes/suspensas e bloqueio.
- Frontend: 14 testes; fluxo sem botões “Simular”, estado indisponível distinto de visitante e ausência de JWT local.
- Build Vite e imagens Docker: aprovados.
- Flyway aplicou V3 e V4 sobre o volume existente sem apagar dados.
- Ensaio HTTP local confirmou cadastro pendente, entrega Mailpit, confirmação única, login, sessão JDBC,
  recuperação uniforme, nova senha, revogação, CSRF e `USER` recebendo 403 em `/api/admin/users`.
- A tentativa de inspeção visual automatizada da aba local foi bloqueada pela política do navegador;
  o design foi preservado por alterações pontuais e o build responsivo passou, mas a conferência visual
  manual desktop/mobile permanece recomendada antes da aprovação final de UX.

## Limitações honestas

- Alteração de e-mail exige um fluxo de confirmação dupla e ficou desabilitada.
- Google OIDC e MFA não foram simulados; permanecem explicitamente indisponíveis.
- A gestão simples de nome, senha e sessões reutiliza a página atual e diálogos nativos; uma experiência
  visual dedicada pode ser criada posteriormente sem alterar o contrato seguro.
- Testes automatizados isolados com Testcontainers ainda são recomendados; o ensaio de integração desta
  entrega foi executado no PostgreSQL Docker local e a conta temporária foi removida ao final.
