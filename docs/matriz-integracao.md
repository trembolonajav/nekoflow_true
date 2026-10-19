# Matriz de integração — Biblioteca, Solicitações e Mobile

## Situação após a implementação (18/10/2026)

| Área | Implementado | Pendente |
|---|---|---|
| Identidade | Login/cadastro reais (sessão + CSRF), papéis, sessão nova a cada login, limpeza de dados locais ao sair, rotas privadas com retorno à origem | E-mail de confirmação, recuperação de senha, Google |
| Catálogo | Tabela única `work` (id AniList), títulos alternativos, cadastro pela equipe sem duplicar | Gêneros/temas das obras novas no Explorar |
| Biblioteca | Situação, favorito e alertas independentes; menu ⋮ completo; remover mantém progresso/histórico; filtros por link | Busca, ordenação e paginação dentro da biblioteca |
| Progresso | Player e Leitor gravam no servidor; regra de retomada (posição, próxima unidade, "Em dia"); proteção contra gravação antiga; fila offline | — |
| Histórico | Eventos reais (Aberto / Assistido / Lido), remover item, apagar tudo | Filtro por período |
| Solicitações | Formulário ligado ao catálogo, duplicidade por obra e por pedido aberto, "Também quero", limite diário, detalhe com histórico, complementar/cancelar, entradas na busca, Explorar e páginas das obras | Denúncia de pedido abusivo |
| Administração | Painel `/admin`: fila com transições válidas, justificativa obrigatória na recusa, cadastro de obra, publicação idempotente, usuários e papéis, auditoria | — |
| Avisos | Gerados por publicação e por mudança de pedido, idempotentes, respeitam preferências | Avisos de comunidade (comentários) |
| Calendário | Publicações confirmadas entram na agenda; "Seguir" = alerta da obra | — |
| Mobile | Navegação inferior, header compacto, painéis inferiores, abas e filtros adaptados; sem rolagem horizontal em 375/768/1024px | Gestos do leitor/player além dos que o design já tinha |

A matriz original (antes da implementação) segue abaixo.

Confronto da especificação "Integração definitiva da Biblioteca, Solicitações e Mobile"
com o projeto em 18/10/2026. Acessibilidade (seção 5 da especificação) fica fora do escopo
por decisão do produto.

Legenda: **Existe** · **Parcial** · **Falta** · **Corrigir**

## Situação geral

O frontend é a cópia fiel do protótipo do Claude Design. Quase toda a **interface** das três
áreas já existe, mas o **comportamento** é simulado no navegador:

- não existe usuário real: o login é o flag `nk-guest` no localStorage e o perfil é fixo ("Marina");
- biblioteca, histórico, solicitações e notificações vêm de `conta.json` (somente leitura) e as
  alterações ficam só na memória da página — somem ao recarregar;
- progresso do player (`nk-progress`) e do leitor ficam no localStorage de cada tela, sem ligação
  com a Home, a Conta ou outro dispositivo;
- o backend só serve documentos JSON (`content_document`); não há entidades de domínio.

## 1. Biblioteca pessoal

| Item da especificação | Situação | Onde está hoje |
|---|---|---|
| Minha Biblioteca com filtro Todos/Animações/Leituras | Existe (UI) | `Conta.jsx` aba `lista` (`mediaChips`) |
| Filtro por situação com contagem | Existe (UI) | `Conta.jsx` `statusChips` |
| 5 situações (planejado, andamento, concluído, pausado, abandonado) | Existe (UI) | `Conta.jsx` constante `ST` |
| Menu ⋮: alterar situação, remover | Parcial | só altera o estado em memória |
| Menu ⋮: favoritar, alertas, atualizar progresso, ver obra | Falta | — |
| Remover sem apagar histórico/progresso | Parcial | apenas a mensagem; nada é persistido |
| Favorito independente da situação | Corrigir | "favoritos" do perfil = obras concluídas/em andamento |
| Pesquisa, ordenação, gêneros, paginação na biblioteca | Falta | — |
| Continuar assistindo/lendo calculado do progresso | Parcial | calculado de `conta.json`, não do progresso real |
| Estado "Em dia" (último episódio disponível) | Parcial | `waiting` (campo `done` fixo no JSON) |
| Regras de retomada (próximo ep/cap, pausado, indisponível) | Falta | — |
| Histórico em linha do tempo com filtros | Existe (UI) | `Conta.jsx` aba `historico` |
| Histórico gravado a partir do player/leitor | Falta | histórico é fixo no JSON |
| Distinguir "Aberto" de "Assistido" | Falta | — |
| Player salva progresso | Parcial | `Player.jsx` grava `nk-progress` no localStorage |
| Leitor salva progresso | Parcial | `Leitor.jsx` grava posição no localStorage |
| Home "Continuar assistindo" usa o mesmo progresso | Corrigir | lê `home.json` (`cont`), dado independente |
| Obra/ObraLeitura: adicionar à lista e acompanhar | Parcial | `listOpen`/`follow` só em memória |
| Calendário: seguir obra | Parcial | `follow` só em memória, sem ligação com a obra da lista |
| Menu do avatar com contagens | Parcial | `Header.jsx` conta a partir de `conta.json` |
| Sincronizar entre dispositivos / limpar dados ao sair | Falta | sem conta real |

## 2. Solicitar obra

| Item da especificação | Situação | Onde está hoje |
|---|---|---|
| Formulário (tipo de mídia + tipo de pedido + título) | Existe (UI) | `Conta.jsx` aba `solicitacoes` |
| Detecção de obra já existente no catálogo | Parcial | busca por texto em `explorar.json`; sem ID externo/títulos alternativos estruturados |
| Pedido ligado ao ID da obra (episódio, capítulo, tradução) | Falta | pedido guarda só texto |
| "Também quero esta obra" (duplicidade de pedidos) | Falta | — |
| Limite anti-spam / denúncia | Falta | — |
| Lista "Minhas solicitações" com etapas | Existe (UI) | `requests` com barra de etapas |
| Página de detalhes do pedido com histórico | Falta | — |
| 8 situações da especificação | Parcial | design usa 5: Recebida, Em análise, Aprovada, Atendida, Não atendida |
| Solicitar a partir da pesquisa global sem resultado | Parcial | link "Solicitar obra →" no `Header.jsx` aponta para `#` |
| Solicitar a partir do Explorar vazio / da página da obra | Falta | — |
| Painel administrativo (moderador/editor/admin) | Falta | não existe tela no design |
| Registro auditável de decisões | Falta | — |
| Notificação quando o pedido muda de situação | Falta | notificações são fixas no JSON |

## 3. Notificações (sininho)

| Item | Situação | Onde está hoje |
|---|---|---|
| Sininho com abas e contagem de não lidas | Existe (UI) | `Header.jsx` |
| Central de notificações | Existe (UI) | `Conta.jsx` aba `notificacoes` |
| Marcar como lida / todas | Parcial | localStorage `nk-read`, por navegador |
| Avisos gerados por publicação/solicitação | Falta | — |
| Sem duplicidade (eventos idempotentes) | Falta | — |

## 4. Mobile

| Item | Situação | Onde está hoje |
|---|---|---|
| Layouts para celular nas páginas comuns | Falta | design só para desktop (nenhum `@media`) |
| Ajustes estreitos pontuais | Parcial | `Obra` e `ObraLeitura` (<760px), `Player` (<720px), `Leitor` (≥760px) |
| Barra de navegação inferior | Falta | — |
| Busca em tela própria no celular | Falta | — |
| Painel inferior (bottom sheet) para ações da obra | Falta | — |
| Player/leitor ocultando a navegação no modo imersivo | Parcial | ambos já são telas cheias próprias |

## 5. Dados e backend

| Conceito da especificação | Situação |
|---|---|
| `User` (identidade, papéis) e autenticação | Falta |
| `Work` (obra com ID estável e títulos alternativos) | Falta — o catálogo é o documento `explorar.json` |
| `LibraryEntry`, `Favorite`, `WorkFollow` | Falta |
| `Progress` (por episódio/capítulo, com versão/data) | Falta |
| `ActivityHistory` | Falta |
| `Notification` | Falta |
| `ContentRequest` + `RequestHistory` | Falta |
| `ReleaseEvent` | Falta — calendário é o documento `calendario.json` |
| `UserPreferences` | Parcial — `nk-cfg` no localStorage |
| Autorização no servidor | Falta |

## Rotas

As telas pessoais hoje são abas de `/conta?aba=...` (`lista`, `assistindo`, `lendo`,
`historico`, `notificacoes`, `solicitacoes`, `configuracoes`). A especificação aceita qualquer
convenção desde que consistente e com link direto — essas rotas já cumprem isso; faltam
`/solicitacoes/:id` (detalhe) e o painel administrativo.
