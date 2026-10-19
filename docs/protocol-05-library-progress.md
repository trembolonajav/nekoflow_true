# Protocolo 05 — Biblioteca pessoal, histórico e progresso sincronizado

## Resultado

O Java passou a ser a fonte oficial dos dados pessoais. Biblioteca, favoritos, acompanhamento,
progresso por episódio e por capítulo + edição, "Continuar assistindo/lendo" e histórico usam o mesmo
conjunto de tabelas e serviços. O React apenas apresenta; o `localStorage` não guarda mais registros
oficiais (só uma fila de reenvio isolada por conta).

Branch: `feat/protocolo-05-biblioteca-progresso`.

## 1. Modelo de dados e migrações

| Tabela | Papel |
| --- | --- |
| `library_entry` (V2, mantida) | Um registro por usuário + obra (`UNIQUE`), com a situação. Recebeu `CHECK` de valores. |
| `favorite`, `work_follow` (V2, mantidas) | Favorito e acompanhamento de lançamentos, independentes da situação. |
| `episode_progress` (V8) | Posição (ms), duração validada, tempo assistido limitado pelo relógio do servidor, `completed_at` + origem (`PLAYBACK`/`MANUAL`), versão, última sessão/sequência. `UNIQUE(user, episode)`. |
| `chapter_progress` (V8) | Capítulo **e edição** (FK composta), página **ou** segmento + deslocamento estável, porcentagem só para exibição, conclusão (`READER`/`MANUAL`), versão. `UNIQUE(user, chapter, edition)`. |
| `progress_sync_event` (V8) | Eventos aceitos (`user_id, event_id`) para idempotência e auditoria. |
| `activity_history` (V8) | Linha do tempo: `STARTED`, `RESUMED` (uma vez por sessão), `COMPLETED`, `MANUAL_COMPLETED`, `REOPENED`, com a origem. |
| `episode_source/chapter_source.reports_progress` (V8) | A fonte declara se informa progresso verificável. Links externos e embeds sem API ficam `false`. |

Registros pessoais referenciam episódio/capítulo/obra com `ON DELETE RESTRICT`: uma exclusão física no
catálogo não apaga dados de usuários (o catálogo arquiva/oculta). As tabelas antigas `progress` e
`activity` foram preservadas, mas não são mais lidas nem gravadas.

**Correção encontrada pelos testes:** a V6 (Protocolo 04) falhava em banco vazio porque dependia de
uma obra criada pelo `CatalogSeeder` depois do Flyway. A `V5_1__ensure_heavy_knight_anime.sql` cria a
linha mínima antes da V6; em bancos existentes ela roda fora de ordem (`spring.flyway.out-of-order`)
sem efeito. A V6 não foi alterada (checksum preservado).

## 2. Serviços Java

- `progress.ProgressService` — salvar/consultar progresso, conclusão manual, desmarcar, zerar.
- `progress.ResumeService` — retomada por obra e listas de continuidade (derivadas, sem tabela própria).
- `progress.HistoryService` — histórico paginado com filtros e remoção.
- `progress.UnitCatalog` — leitura das unidades com as regras públicas do catálogo.
- `library.PersonalLibraryService` — situação, remoção, favorito, acompanhamento, listagem filtrada e
  paginada, resumo.

Regras principais:
- Começar a consumir coloca a obra "Em andamento" só se estava "Planejado"; pausado, abandonado e
  concluído são respeitados.
- Concluir tudo o que foi publicado deixa a obra **"Em dia"** — nunca "Concluído" automaticamente.
- Conclusão pelo player exige posição ≥ 90% e tempo assistido ≥ 50% da duração; arrastar até o fim não
  conta. O tempo assistido declarado não cresce mais rápido que 2× o relógio do servidor.
- Fontes sem telemetria (o caso real Heavy Knight) aceitam apenas conclusão manual, identificada como tal.

## 3. Endpoints (`/api/v1/me`, usuário do Spring Security, CSRF obrigatório)

| Método | Rota | Função |
| --- | --- | --- |
| GET | `/library?media&status&favorite&q&sort&page&size` | Biblioteca filtrada e paginada |
| GET | `/library/summary` | Contadores por situação, favoritos, alertas, continuidade |
| GET/PUT/DELETE | `/library/{workId}` | Estado da obra · situação · remover (mantém progresso e histórico) |
| GET · PUT/DELETE | `/favorites` · `/favorites/{workId}` | Favoritos |
| GET · PUT/DELETE | `/follows` · `/follows/{workId}` | Acompanhar lançamentos |
| GET | `/continue-watching`, `/continue-reading` | Uma entrada por obra (`RESUME` ou `NEXT`) |
| GET | `/works/{workId}/progress` | Progresso de cada unidade da obra (ficha) |
| GET/PUT/DELETE | `/progress/episodes/{id}` | Consultar · salvar · zerar |
| PUT/DELETE | `/progress/episodes/{id}/completion` | Marcar · desmarcar conclusão manual |
| GET/PUT/DELETE | `/progress/chapters/{id}?editionId=` | Idem, sempre com a edição |
| PUT/DELETE | `/progress/chapters/{id}/completion?editionId=` | Idem |
| GET | `/history?media&workId&from&to&page&size` | Histórico |
| DELETE | `/history/{id}`, `/history?from&to` | Remover atividade ou período |

`{workId}` aceita o UUID público ou o id numérico (as telas do design usam o id da AniList).

Salvar posição (episódio):

```json
{ "positionMs": 822000, "durationMs": 1440000, "watchedDeltaMs": 15000, "completed": false,
  "sessionId": "…", "sequence": 18, "expectedVersion": 12, "eventId": "…" }
```

A resposta traz o estado **aceito** pelo servidor (posição, versão nova, `accepted`/`duplicate`).
Erros com código estável: `PROGRESS_VERSION_CONFLICT` e `STALE_PROGRESS_EVENT` (409, com `current`),
`PROGRESS_NOT_VERIFIABLE`, `PLAYBACK_COMPLETION_UNVERIFIED`, `READING_COMPLETION_UNVERIFIED` (422),
`SYNC_FIELDS_REQUIRED`, `INVALID_DURATION`, `INVALID_POSITION`, `EDITION_REQUIRED`, `INVALID_WORK_ID`,
`INVALID_REQUEST` (400). UUID malformado e corpo ilegível agora respondem 400 em vez de 500.

As rotas antigas `/api/me/*` continuam, delegando aos mesmos serviços; gravar progresso por número de
unidade responde **410 `LEGACY_PROGRESS_DISABLED`**.

## 4. Integrações React

- `features/library/libraryApi`, `features/progress/progressApi` + `progressSync`,
  `features/history/historyApi` são o único caminho para dados pessoais. Toda alteração dispara
  `nk:personal`, e Header, Home, Conta e a ficha recarregam.
- Home, Leituras, Conta (lista, continuar, histórico, perfil), Header, Explorar, Calendário, Entrar
  (boas-vindas) e as fichas do design usam a API v1.
- A ficha dinâmica do catálogo ganhou: situação, remover (com confirmação), favorito, acompanhar,
  retomada/"Em dia" e, por episódio/capítulo, "Assistido/Lido · marcado por você" com marcar/desmarcar.
- O player de episódio real mostra o estado e permite marcar como assistido; nada é inferido do embed.
- Correção herdada do Protocolo 03: o Header acompanha a sessão (antes ficava como visitante quando a
  página pública carregava antes da sessão).

## 5. Sincronização e conflitos

- Cada abertura do player/leitor tem um `sessionId`; a `sequence` cresce na ordem dos eventos.
- O cliente nunca tem dois envios em voo para a mesma unidade; a versão esperada é lida quando o envio
  sai da fila.
- 409 de versão: se a sessão está consumindo agora, a posição dela é reenviada sobre a versão do
  servidor (intenção mais recente); um evento antigo/offline nunca sobrescreve outro dispositivo.
- Retroceder a posição é aceito — não existe regra de "maior tempo".
- Sem conexão ou com sessão expirada: estado "pendente"/"login necessário", nunca "salvo"; o evento
  fica numa fila marcada com o id da conta e é reenviado (o `eventId` evita duplicar).
- Dois salvamentos simultâneos com a mesma versão: exatamente um é aceito (testado com concorrência real).

## 6. Dados antigos do `localStorage`

Revisados antes do descarte:
- `nk-pending-progress`, `nk-progress`, `nk-reader-progress`: eventos do player/leitor demonstrativos,
  sem vínculo com episódios reais → **descartados**, não são progresso pessoal legítimo.
- `nk-player`, `nk-reader-prefs`, `nk-reader-bm`: preferências do aparelho → mantidos.
- `nk-progress-v1-pending`: nova fila, isolada por conta; preservada no logout e reenviada só para a
  mesma conta.

A conta de demonstração "Marina" não recebe mais progresso nem histórico inventados; mantém apenas
situações da lista, favoritos, alertas, avisos e pedidos da demonstração.

## 7. Testes

- Java: 36 testes, incluindo 19 de integração em PostgreSQL isolado (Testcontainers, migrações V1–V8):
  unicidade da biblioteca, situação/favorito/alerta independentes, outro dispositivo, versão antiga,
  evento repetido, sequência antiga, retrocesso, conclusão por arraste recusada, fonte externa só manual,
  próximo episódio, "Em dia" sem concluir a obra, pausado respeitado, leitura por edição, histórico
  separado, remoção da lista sem perda, isolamento entre usuários, 401/403/400/404, obra oculta,
  rota legada desativada e concorrência simultânea.
- React: 27 testes (`npm test`), incluindo ordem dos envios, conflito ativo × antigo, reenvio offline,
  sessão expirada, fila de outra conta, agrupamento do histórico e ausência de progresso fictício.
- Docker: banco existente migrado de V7 para V8 sem perda (V5.1 aplicada fora de ordem sem efeito).

## 8. Evidências visuais

Validado no navegador (desktop e 375 px): ficha do Heavy Knight com o bloco "Minha biblioteca" e o
episódio "Assistido · marcado por você"; Conta › Histórico com as duas atividades reais no layout do
design; Conta › Continuar assistindo com "Aguardando próximo episódio · em dia"; Minha lista com
"Em dia · Ep. 1" e "Ainda não começou"; Home sem "Continuar assistindo" fictício. Sem rolagem
horizontal no celular e sem erros no console.

## 9. Commits

- `feat: add synchronized personal library and progress backend`
- `feat: expose per-work unit progress for work pages`
- `feat: connect personal library and progress across react pages`
- `fix: keep header session state and library card texts truthful`
- `docs: record protocol 05 completion`

## 10. Pendências para os Protocolos 06 e 07

- **06 — Player:** usar `progressApi.sync("episode", id)` com eventos reais (`timeupdate`, pausa, fim,
  troca de episódio, saída da página) a cada 15–30 s de reprodução efetiva, informando
  `watchedDeltaMs`; marcar a fonte com `reports_progress = true` só quando a telemetria for confiável.
  O embed do Animes Digital continua `EXTERNAL_LINK` até o provedor liberar o domínio.
- **07 — Leitor:** gravar `pageIndex` (paginado) ou `segmentKey` + `segmentOffset` (vertical) por edição;
  conversão de posição entre edições quando houver correspondência conhecida.
- Interface de filtros por período no Histórico (a API já aceita `from`/`to`).
- As páginas demonstrativas do design (Solo Leveling) seguem sem unidades reais no catálogo; o progresso
  delas só existirá quando os episódios/capítulos forem cadastrados.
