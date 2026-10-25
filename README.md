# Nekoflow

Plataforma de animes e leituras construída a partir do protótipo do Claude Design.

O projeto já funciona como uma aplicação integrada: catálogo normalizado, contas, biblioteca,
progresso sincronizado, player/leitor, painel editorial, importação de fontes externas e interface
multilíngue. O PostgreSQL é a fonte de verdade; os arquivos em `resources/seed` são snapshots
idempotentes usados para reconstruir e enriquecer o ambiente.

| Camada   | Tecnologia                                         | Pasta       |
|----------|----------------------------------------------------|-------------|
| Frontend | React 18 + Vite + React Router                     | `frontend/` |
| Backend  | Java 17 + Spring Boot 3 (Web, Security, JDBC, Flyway) | `backend/` |
| Banco    | PostgreSQL 16                                      | (Docker)    |
| Infra    | Docker Compose (Postgres, API, nginx e Mailpit local) | raiz        |
| Design   | Arquivos originais exportados do Claude Design     | `design/`   |

## Estado atual

- **Catálogo real:** obras, títulos alternativos, temporadas, episódios, edições, capítulos,
  relações e identificadores externos normalizados no PostgreSQL.
- **Home dinâmica:** destaques curados, novidades da temporada, continuações e episódios recentes
  vêm do backend, com paginação e atualização ao trocar o idioma.
- **Importação de anime:** catálogo FIB Anime e snapshot sazonal HiAnime integrados de forma
  idempotente, com validação de identidade, quarentena de associações divergentes e auditoria.
- **Metadados editoriais:** AniList fornece identidade, títulos, sinopse, banner, personagens,
  elenco, relações e recomendações; Jikan/MAL e TVMaze complementam episódios quando há vínculo.
- **Player real:** HLS, MP4, links e embeds externos, múltiplas versões/servidores, preferência
  lembrada por dispositivo, troca de fonte, idiomas e reporte de falha.
- **Leitor real:** capítulos publicados com páginas importadas ou fornecidas por provedor,
  navegação contínua e progresso persistente.
- **Conta e biblioteca:** cadastro, sessão segura, favoritos, acompanhamento, listas, histórico,
  continuar assistindo/lendo e sincronização entre dispositivos.
- **Administração:** solicitações, publicações, catálogo, importação editorial, usuários e auditoria,
  com permissões de moderador, editor e administrador validadas no servidor.
- **Idiomas:** interface, fichas e episódios em português do Brasil, inglês e espanhol, mantendo
  idioma do site separado das preferências de áudio e legenda.
- **Responsividade:** navegação e fluxos principais adaptados para desktop, tablet e celular.

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
| Leitor                     | `/leitor?chapter=UUID&edition=UUID` | `pages/Leitor.jsx`             |
| Player                     | `/player?episode=UUID`       | `pages/Player.jsx`                    |
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

## Catálogo, fontes e integridade

O NekoFlow não usa o título como identidade definitiva. Cada obra possui um ID interno e pode ter
identificadores AniList, MAL, FIB Anime e HiAnime. Títulos em romaji permanecem canônicos; nomes em
inglês, japonês e sinônimos são aliases pesquisáveis.

Os seeders podem ser executados repetidamente sem duplicar obras, episódios ou fontes. Antes de
publicar mídia, eles verificam vínculos externos e compatibilidade entre obra e temporada. Dados
ambíguos são ignorados ou colocados em quarentena, em vez de anexar episódios ao anime errado.

Fontes de mídia preservam tipo, provedor, prioridade, idioma de áudio, idioma de legenda,
proveniência e estado. O NekoFlow não copia vídeos de provedores externos: HLS/MP4 autorizados são
reproduzidos no player e embeds continuam hospedados pelo respectivo provedor.

### Importação HiAnime

`tools/import_hianime_season_csv.py` combina uma lista sazonal, AniList e a API não oficial HiAnime.
O resultado versionado é `backend/src/main/resources/seed/hianime-catalog.json`, aplicado no boot
pelo `HiAnimeCatalogSeeder`. A importação atual é um snapshot auditado; sincronização periódica por
worker e operação pelo painel administrativo são a próxima etapa.

Consulte `docs/hianime-season-import.md` para parâmetros, limites e política de idiomas.

## Localização e traduções

Há três dimensões independentes:

1. **Idioma do site:** `pt-BR`, `en` ou `es`, escolhido no globo do cabeçalho/rodapé e persistido no
   navegador.
2. **Áudio preferido:** usado para ordenar versões disponíveis no player.
3. **Legenda preferida:** usada para escolher legendas sem alterar o idioma da interface.

O frontend traduz navegação, filtros, conta, fichas, player, leitor e mensagens de erro. No backend,
`work_translation` e `episode_translation` guardam textos localizados com fonte e estado de revisão.
Quando não existe tradução, a aplicação mostra o texto original e informa isso ao usuário.

O pipeline `tools/catalog_localization_pipeline.py`:

- associa obras com AniList/MAL sem confiar apenas no primeiro resultado textual;
- obtém títulos, sinopses, datas e imagens reais de episódios quando a fonte existe;
- traduz sinopses localmente para PT-BR e espanhol;
- protege títulos próprios e nomes durante a tradução;
- nunca reutiliza capa ou banner da obra como miniatura falsa de episódio;
- produz um relatório de cobertura antes de gerar o snapshot;
- grava o resultado em `backend/src/main/resources/seed/catalog-localizations.json`.

O `CatalogLocalizationSeeder` aplica o snapshot sem sobrescrever traduções editoriais revisadas.
Casos revisados manualmente ficam em migrações Flyway, como Boku no Hero e Black Clover 2. O
`CatalogIntegritySeeder` normaliza nomes genéricos de temporada e remove previews falsos de forma
reversível.

Caches, modelos locais de tradução, planilhas e saídas de auditoria vivem em `.artifact-work/` e
`audit/` e não são enviados ao Git. Eles podem ser reconstruídos pelas ferramentas em `tools/`.

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
- `docs/protocol-04-completion.md` — catálogo dinâmico e fluxo editorial;
- `docs/protocol-05-library-progress.md` — biblioteca, histórico e progresso sincronizado;
- `docs/protocol-06-real-media.md` — reprodução, leitura e importação editorial;
- `docs/fibanime-cobertura.md` — cobertura e critérios da integração FIB Anime;
- `docs/visual-baseline.md` — rotas e viewports usados na verificação visual;
- `docs/hianime-season-import.md` — importação sazonal por CSV, AniList e HiAnime.

## O que ainda não existe

- Login com Google/OIDC, alteração de e-mail e MFA ainda não estão configurados; a interface os
  apresenta como indisponíveis, sem simular sucesso.
- Comentários do player e avaliações continuam simulados no navegador, como no protótipo.
- Acessibilidade (WCAG) ficou fora deste escopo.
- A sincronização contínua de novos episódios ainda não possui worker; HiAnime é importado por
  snapshot auditado.
