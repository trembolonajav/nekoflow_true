# Protocolo 03 — auditoria inicial de autenticação

Data da linha de base: 2026-10-19. Branch de origem: `feat/protocolo-02-navegacao-real` (`d29325b`). Branch de trabalho: `feat/protocolo-03-autenticacao`.

## Versões e infraestrutura

- Java configurado no projeto: 17; Maven executado localmente com JDK 21.
- Spring Boot 3.3.4 e Spring Security 6.x, herdado pelo BOM do Boot.
- PostgreSQL 16, Flyway e migrações `V1`/`V2`.
- React 18, React Router 6 e Vite 5.4.8.
- Nginx entrega a SPA e encaminha `/api/` ao backend na mesma origem. Essa topologia é adequada para cookie de sessão e CSRF.
- Docker Compose mantém volume PostgreSQL não destrutivo. Não existe Mailpit nem serviço de e-mail configurado.

## O que já é real

- `app_user` persiste usuários no PostgreSQL, com e-mail e nome de usuário únicos.
- Spring Security autentica e autoriza `USER`, `MODERATOR`, `EDITOR` e `ADMIN` no servidor.
- Login, logout, cadastro, cookie `HttpOnly`, token CSRF e `/api/auth/me` existem.
- Rotas privadas preservam um destino interno por `?next=` e limpam caches `nk-*` na troca de conta.
- Recursos pessoais usam o usuário da sessão e consultas com `user_id`; testes já cobrem parte das permissões administrativas.

## Lacunas e riscos encontrados

- A sessão é a sessão servlet local; não há Spring Session JDBC nem revogação entre instâncias/dispositivos.
- O cadastro cria uma conta imediatamente ativa e já inicia sessão. Não há estado de conta ou confirmação de e-mail.
- Recuperação, redefinição e reenvio são apenas mudanças visuais; os botões chegam a dizer “Simular”.
- O Google visual gera um erro genérico, sem indicar claramente que OIDC não está configurado.
- Senhas aceitam 8 caracteres e usam o encoder delegante padrão (bcrypt para novos hashes), não Argon2id.
- Não há tokens protegidos/expiráveis, perfil separado, identidades externas, eventos específicos de segurança ou envio real de e-mail.
- Não há limitação persistente de tentativas. Usuários suspensos/inativos não são modelados.
- A página Conta anuncia alteração de nome/e-mail/senha, sessões e 2FA sem implementar as ações.
- Timeout atual de sessão é 30 dias, diferente da proposta conservadora de 7 dias.
- Cookie `Secure` não está parametrizado por ambiente.
- O perfil fictício Marina e um administrador são semeados quando `NEKOFLOW_DEMO=true`; isso precisa permanecer estritamente opcional e desativado em produção.
- IDs existentes são `BIGINT` e já possuem várias FKs. A evolução segura deve preservar essas chaves e adicionar UUID público, evitando uma migração destrutiva.

## Linha de base executada

- Frontend: 12/12 testes aprovados.
- Frontend: build de produção aprovado; alerta existente de bundle principal com 693,18 kB.
- Backend: testes Maven aprovados.
- Git estava limpo antes da criação da branch.

## Direção de implementação

Evoluir a estrutura existente, sem criar um segundo sistema: migração aditiva `V3`, Spring Session JDBC, Argon2id, contas pendentes/ativas/suspensas, tokens com hash, Mailpit em desenvolvimento, endpoints reais, integração das telas atuais e testes de segurança. O ID relacional `BIGINT` será mantido internamente e um UUID público será adicionado.
