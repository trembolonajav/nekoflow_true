# Nekoflow

Plataforma de animes e leituras construída a partir do protótipo do Claude Design.

| Camada   | Tecnologia                                         | Pasta       |
|----------|----------------------------------------------------|-------------|
| Frontend | React 18 + Vite + React Router                     | `frontend/` |
| Backend  | Java 17 + Spring Boot 3 (Web, Security, JDBC, Flyway) | `backend/` |
| Banco    | PostgreSQL 16                                      | (Docker)    |
| Infra    | Docker Compose (Postgres, API, nginx e Mailpit local) | raiz        |
| Design   | Arquivos originais exportados do Claude Design     | `design/`   |

## Subir tudo com Docker

```bash
docker compose up -d --build
```

- App: http://localhost:9080
- API: http://localhost:9090
- Postgres: localhost:9432 (usuário/senha `nekoflow`, veja `.env.example`)
- E-mails locais: http://localhost:9025 (Mailpit; não envia mensagens para a internet)

Contas de demonstração (criadas na primeira subida; senha em `NEKOFLOW_DEMO_PASSWORD`,
padrão `nekoflow2026`):

| Conta                  | Papel          | Para que serve                                         |
|------------------------|----------------|--------------------------------------------------------|
| `marina@nekoflow.local` | usuário        | biblioteca, histórico, avisos e pedidos do protótipo   |
| `kenji@nekoflow.local`  | usuário        | segundo usuário (apoia o pedido #1042)                 |
| `admin@nekoflow.local`  | administrador  | painel em `/admin`                                     |

Desligue as contas de demonstração com `NEKOFLOW_DEMO=false`.

## Desenvolvimento local

```bash
docker compose up -d postgres               # só o banco (host :9432)
cd backend && mvn spring-boot:run           # API em :9090
cd frontend && npm install && npm run dev   # app em :9073 (proxy de /api para :9090)
```

Verificações locais:

```bash
cd frontend && npm test && npm run build
cd backend && mvn test
```

## Telas e rotas

| Tela                       | Rota                        | Arquivo                               |
|----------------------------|-----------------------------|---------------------------------------|
| Home                       | `/`                         | `frontend/src/pages/Home.jsx`         |
| Animes                     | `/animes`                   | `pages/Explorar.jsx` (catálogo filtrado) |
| Calendário                 | `/calendario`               | `pages/Calendario.jsx`                |
| Explorar                   | `/explorar`                 | `pages/Explorar.jsx`                  |
| Leituras                   | `/leituras`                 | `pages/Leituras.jsx`                  |
| Obra (anime)               | `/animes/:slug`             | `pages/WorkRoute.jsx`                 |
| Obra (leitura)             | `/leituras/:slug`           | `pages/WorkRoute.jsx`                 |
| Leitor demonstrativo       | `/leitor?obra=ID&cap=N`     | `pages/Leitor.jsx`                    |
| Player demonstrativo       | `/player?obra=ID&ep=N`      | `pages/Player.jsx`                    |
| Conta / Minha biblioteca   | `/conta?aba=...` (privada)  | `pages/Conta.jsx`                     |
| Entrar / Criar conta       | `/entrar` e `/criar-conta` (`?next=` volta à origem) | `pages/Entrar.jsx` |
| Detalhe da solicitação     | `/solicitacoes/:id` (privada) | `pages/SolicitacaoDetalhe.jsx`      |
| Painel administrativo      | `/admin` (equipe)           | `pages/Admin.jsx`                     |
| Estudo das 3 direções da Home | `/estudos/home-direcoes` | `pages/HomeDirecoes.jsx`              |
| Página inexistente            | qualquer rota desconhecida | `pages/NotFound.jsx`                |

Atalhos: `/biblioteca`, `/continuar-assistindo`, `/continuar-lendo`, `/historico`,
`/solicitacoes`, `/notificacoes`, `/configuracoes` (levam às abas da Conta).
A Conta aceita filtros por link: `/conta?aba=lista&midia=anime&situacao=pausado`.
As rotas antigas `/obra` e `/obra-leitura` redirecionam para as fichas canônicas de Solo Leveling.

## Como as partes se integram

Uma única fonte para cada informação (detalhes em `docs/matriz-integracao.md`):

- **Catálogo** (`work`): uma linha por obra, com o id da AniList; títulos alternativos
  reconhecem pedidos e buscas da mesma obra. Obras cadastradas pela equipe recebem ids ≥ 900000000.
- **Biblioteca** (`library_entry`, `favorite`, `work_follow`): um registro por usuário e obra;
  situação, favorito e alertas são independentes. Remover da lista não apaga progresso nem histórico.
- **Progresso** (`progress`): posição por episódio/capítulo. Player e Leitor gravam aqui; Home,
  Conta, Leituras e as páginas das obras leem daqui. Gravações mais antigas que a última salva
  (outro dispositivo) são ignoradas; sem conexão, a posição fica pendente no navegador e é reenviada.
- **Histórico** (`activity`): o que aconteceu ("Aberto", "Assistido", "Lido"); abrir o player não
  conta como assistido.
- **Solicitações** (`content_request`, `request_supporter`, `request_history`): verificação de
  duplicidade (obra existente ou pedido aberto → "Também quero esta obra"), limite de 5 por dia,
  histórico auditável e aviso a solicitante e apoiadores a cada mudança.
- **Publicações** (`release_event`): única por obra e unidade; publicar de novo não duplica
  avisos. Atualiza o Calendário, avisa quem acompanha a obra e atende pedidos de "faltando".
- **Avisos** (`notification`): chave de evento única por usuário (idempotente); respeitam as
  preferências de notificação da conta.
- **Permissões** (validadas no servidor): moderador = solicitações; editor = + publicações e
  catálogo; administrador = + usuários e auditoria (`admin_audit`).
- **Autenticação**: Spring Security + Spring Session JDBC, cookie `HttpOnly`, CSRF, Argon2id,
  confirmação de e-mail e recuperação com tokens temporários de uso único. O React nunca guarda
  JWT ou senha no `localStorage`.

## Mobile

Abaixo de 768px: navegação inferior com as cinco seções (oculta no Leitor e no Player em tela
cheia), header compacto com busca em largura total, menus do sininho, da conta e dos cards
como painel inferior, abas da Conta roláveis e filtros do Explorar recolhidos. O desktop continua
igual ao design. As regras ficam em `frontend/src/styles/mobile.css`.

## Organização e origem do código

As telas foram convertidas dos `.dc.html` do Claude Design (`design/claude-design/`) e agora são
mantidas diretamente no código. O conversor legado gera somente uma prévia isolada em
`frontend/design-generated/`; ele recusa gravar em `src`, `public`, `backend` ou `design`.

```bash
cd frontend
npm run design:preview
```

Não copie uma tela gerada inteira sobre uma tela de produção. Consulte:

- `docs/architecture.md` — responsabilidades e dependências;
- `docs/design-workflow.md` — atualização segura do design;
- `docs/api-conventions.md` — cliente HTTP e contrato de erros;
- `docs/navigation-audit.md` — auditoria anterior às correções do Protocolo 02;
- `docs/protocol-02-integration.md` — rotas, limites e integração da navegação real;
- `docs/protocol-03-auth-audit.md` — linha de base anterior à autenticação completa;
- `docs/protocol-03-authentication.md` — contrato, segurança, configuração e resultados;
- `docs/visual-baseline.md` — rotas e viewports usados na verificação visual.

## O que ainda não existe

- Login com Google/OIDC, alteração de e-mail e MFA ainda não estão configurados; a interface os
  apresenta como indisponíveis, sem simular sucesso.
- Comentários do player e avaliações continuam simulados no navegador, como no protótipo.
- Acessibilidade (WCAG) ficou fora deste escopo.
