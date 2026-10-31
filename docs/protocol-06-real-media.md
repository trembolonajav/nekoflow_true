# Protocolo 06 — Reprodução de anime e leitura reais

## Resultado

O Player e o Leitor deixaram de simular. Com `?episode=<id>` o Player toca um stream real no
elemento `<video>`. Com `?chapter=<id>&edition=<id>` o Leitor mostra as páginas reais do capítulo.
Os dois usam os IDs do catálogo (Protocolo 04) e o progresso do Protocolo 05, mantendo a interface do
design. Sem esses parâmetros, as páginas demonstrativas do design continuam como estavam,
identificadas como demonstração.

Branch: `feat/protocolo-06-midia-real`, criada a partir de `feat/protocolo-05-biblioteca-progresso`,
que ainda aguarda merge no PR #1.

### Caso Heavy Knight (pendências apontadas pelo usuário)

| Item | Antes | Agora |
| --- | --- | --- |
| Sinopse | Tradução escrita à mão na V6 | Puxada do AniList pelo `AniListSyncService`, com atribuição ("AniList · fonte original: Crunchyroll" / "K MANGA"). Sincroniza sozinha no boot e pelo botão "Puxar sinopse do AniList" no painel |
| Episódio 1 | Só "Assistir no provedor ↗" (o embed exige o domínio antigo) | Stream HLS original do Animes Digital tocando no player do NekoFlow (H.264 1080p, AAC, 23:40). O link do site virou fonte alternativa |
| Capítulo 1 | Só link externo | 38 páginas reais no Leitor, em paginação oriental (dir. → esq.), com as páginas duplas 3 e 34 marcadas |

Validação feita antes de cadastrar:
- O manifesto HLS e os segmentos respondem com `Access-Control-Allow-Origin: *` e são MPEG-TS comuns
  (a extensão `.webp` é só o nome do arquivo).
- As imagens do capítulo carregam sem exigir referenciador.
- As dimensões vieram do cabeçalho WebP de cada página.

## 1. Arquitetura

```text
React Player ── GET /episodes/{id}/playback ──> Java (valida publicação, janela, provedor, host)
     │          POST …/sources/{id}/access ──> URL efetiva + expiração
     └── <video> + hls.js ───────────────────> CDN do provedor (bytes nunca passam pelo Java)

React Leitor ── GET /chapters/{id}/editions/{id}/manifest ──> Java (lote publicado, ordem, dimensões)
     └── <img> ─────> CDN do provedor  |  Nginx /media (arquivos importados, link assinado)

Player e Leitor ── /api/v1/me/progress/* ──> Protocolo 05 (sessão, sequência, versão, histórico)
```

- PostgreSQL guarda só metadados e referências; nenhum vídeo ou imagem fica no banco.
- O Java não transmite mídia. Arquivos importados ficam num volume servido pelo Nginx com
  `secure_link`: 403 sem assinatura e 410 com o link vencido.

## 2. Bibliotecas

- **hls.js 1.5.17**, carregado só quando o player real abre (pacote separado de cerca de 120 kB gzip).
  Safari e iOS usam o HLS nativo.
- **Shaka Player não foi adotado**: não existe fonte DASH nem DRM. O tipo DASH está no modelo, mas o
  player o marca como incompatível até haver necessidade real.

## 3. Modelo de dados — `V9__real_media_playback_reading.sql`

| Tabela / coluna | Função |
| --- | --- |
| `media_provider` | Provedores autorizados com `allowed_hosts`. Fonte ou página fora da lista não é entregue |
| `episode_source` + `provider_id, label, priority, audio_language, max_height, available_from/until` | Tipos `HLS`, `DASH`, `MP4`, `EMBED`, `EXTERNAL_LINK`, com prioridade e janela de disponibilidade |
| `media_subtitle_track` | Legendas WebVTT separadas por fonte |
| `episode_marker` | Abertura, encerramento, recapitulação e prévia (pular abertura e "próximo") |
| `media_issue_report` | "Reportar problema" de episódio ou página, sem tokens nem URLs |
| `work_edition.reading_mode/reading_direction` | O mesmo leitor atende mangá, manhwa e webtoon |
| `chapter_import` | Lote de páginas: `PROCESSING → READY → PUBLISHED` (ou `FAILED`/`DISCARDED`/`REPLACED`); só um publicado por capítulo e edição |
| `chapter_page` | ID estável, posição, `LOCAL` (chave no storage) ou `PROVIDER` (URL), dimensões, tipo, checksum, situação |
| `work.synopsis_source/synopsis_language/anilist_synced_at` | Atribuição e controle da sinopse do AniList |

Regras de disponibilidade:
- Um episódio é reproduzível quando tem uma fonte `HLS`/`MP4`/`DASH` habilitada, dentro da janela e com
  provedor válido.
- Um capítulo é legível quando tem lote publicado.
- Só metadados não bastam: a ficha mostra "Indisponível".

## 4. Endpoints

| Método | Rota | Acesso |
| --- | --- | --- |
| GET | `/api/v1/episodes/{id}/playback` | público (obra publicada) |
| POST | `/api/v1/episodes/{id}/playback/sources/{sourceId}/access` | público, CSRF |
| GET | `/api/v1/chapters/{id}/editions/{editionId}/manifest` | público (lote publicado) |
| POST | `/api/v1/me/media-issues` | conta, máx. 20 por hora |
| GET | `/api/admin/catalog/media/works/{id}/chapters` | EDITOR |
| GET/POST | `/api/admin/catalog/media/chapters/{id}/imports?editionId=` | EDITOR (multipart) |
| GET/DELETE | `/api/admin/catalog/media/imports/{id}` | EDITOR |
| POST | `/api/admin/catalog/media/imports/{id}/publish` | EDITOR |
| GET | `/api/admin/catalog/media/issues` | EDITOR |
| POST | `/api/admin/catalog/works/{id}/anilist-sync` | EDITOR |

Novos códigos de erro:

| Código | Status |
| --- | --- |
| `SOURCE_UNAVAILABLE`, `CHAPTER_PAGES_UNAVAILABLE` | 404 |
| `SOURCE_NOT_PLAYABLE`, `IMPORT_NOT_READY`, `IMPORT_INCOMPLETE`, `IMPORT_NOT_DISCARDABLE` | 422 |
| `INVALID_ISSUE_CATEGORY`, `INVALID_ISSUE_TARGET` | 400 |
| `TOO_MANY_ISSUE_REPORTS` | 429 |
| `ANILIST_UNAVAILABLE` | 502 |

## 5. Adaptadores de fonte

| Tipo | Comportamento |
| --- | --- |
| `HLS` | hls.js ou HLS nativo. Qualidade, áudio e legendas listam só as faixas reais do manifesto. Erros fatais de rede e mídia têm até 2 tentativas de recuperação |
| `MP4` | `<video src>`. A URL temporária é renovada antes de expirar, mantendo a posição |
| `DASH` | Modelado; o player o marca como incompatível neste navegador |
| `EMBED` | Só com provedor e host autorizados. Sem adaptador de API: sem busca, sem progresso |
| `EXTERNAL_LINK` | Abre no provedor; a conclusão é manual |

A troca de fonte é manual, com a posição preservada. Depois de uma falha definitiva, o player oferece
"Tentar outra fonte".

## 6. Leitor com páginas reais

- **Modos:** vertical, página única e página dupla. A capa e as páginas duplas ficam sozinhas no
  modo duplo.
- **Direção:** direita → esquerda ou esquerda → direita. A edição define o padrão, e a escolha da
  pessoa vale só para aquela edição.
- **Ajuste e outros recursos:** largura ou altura, zoom de 50–200%, tela cheia, seletor de capítulos,
  marcadores e próximo capítulo disponível.
- **Altura reservada:** cada página reserva a altura pelas dimensões antes de carregar (sem saltos).
- **Carregamento limitado:** no vertical, sob demanda (as 3 primeiras imediatas); no paginado,
  pré-carrega 1 página anterior e 4 seguintes.
- **Erro de imagem:** a página mostra "recarregar". Se o link assinado venceu, o manifesto é renovado.
- **Troca de modo:** preserva a página atual, não a porcentagem.

## 7. Importação editorial

O fluxo fica em Admin › Catálogo › Revisão editorial › Páginas dos capítulos:

1. Escolher a obra e o capítulo.
2. Enviar ZIP ou imagens.
3. O Java valida.
4. Pré-visualizar.
5. Publicar ou descartar.

Validações:
- Tipo real pelos bytes (JPEG, PNG ou WebP). Um executável com nome `.jpg` reprova o lote.
- Até 20 MB por arquivo, 400 MB no total, 400 páginas e 1000 entradas no ZIP. A descompactação
  aborta acima do limite, contra arquivos-bomba.
- Caminhos com `..`, absolutos ou com unidade reprovam o lote; `__MACOSX` e arquivos ocultos são
  ignorados.
- Ordem natural pelo nome (`2` antes de `10`). Nome repetido reprova.

Comportamento do lote:
- Qualquer erro deixa o lote `FAILED`, sem páginas e sem arquivos. Nada é publicado automaticamente.
- Um novo lote só substitui o anterior quando é publicado.
- Lote publicado não é apagado.
- Toda ação vai para `catalog_audit_event`.
- As imagens são guardadas como enviadas (sem recompressão), para não degradar o texto.

## 8. Integração com o progresso

| Situação | Player | Leitor |
| --- | --- | --- |
| Abrir | recupera a posição e pergunta "Continuar de mm:ss?" | recupera página ou segmento e pergunta |
| Durante o uso | envia a cada 20 s de reprodução real | envia 1,5 s depois de parar de navegar |
| Pausa, busca do usuário, troca de fonte ou saída da página | envia (melhor esforço) | envia na saída |
| Tempo assistido | só avanço contínuo do vídeo; buscas, pausas e ajustes internos do hls.js não contam | — |
| Posição salva | posição real + duração real do vídeo | `pageIndex`; no vertical, também `segmentKey` (ID estável da página) + `segmentOffset` |
| Conclusão | só com ≥90% da posição e ≥50% assistido (o servidor revalida) | só ao chegar ao fim (≥95%) |
| Abrir sem consumir | não grava nada | não grava nada |

- Sem conta: tudo funciona, e o aviso diz "Entre para salvar seu progresso".
- Retomada, Continuar e Histórico agora apontam para `/player?episode=…` e `/leitor?chapter=…&edition=…`.

## 9. Testes

- **Java: 51 testes.**
  - 9 de integração de mídia em PostgreSQL isolado: fontes, acesso, host e provedor não autorizados,
    janela vencida, obra oculta, progresso só com telemetria, manifesto, progresso de leitura,
    importação com ZIP, executável disfarçado, caminho malicioso, permissões e relatos.
  - Regras unitárias: hosts, assinatura compatível com o Nginx, tipo de imagem pelos bytes, ordem
    natural e limpeza da sinopse do AniList.
  - Os 19 testes do Protocolo 05 continuam passando.
- **React: 33 testes.** Incluem compatibilidade de fontes, escolha de fonte, medição do tempo
  assistido e a garantia de que o player e o leitor reais não usam contador nem capas como páginas.
- **Ponta a ponta no Docker (rascunho técnico, já arquivado):**
  - Login de editor e envio de ZIP.
  - Lote `READY` na ordem 1, 2, 10.
  - Imagem servida pelo Nginx com link assinado: 200 `image/png`.
  - Sem assinatura ou adulterada: 403.
  - Obra em rascunho sem manifesto público: 404.
  - Lote descartado: arquivo some (404).

## 10. Evidências (navegador)

- **Player (desktop):**
  - O Heavy Knight toca o episódio 1 real: `videoWidth` 1920 × 1080, duração 23:40 lida do vídeo.
  - Chips reais: "Áudio Japonês", "Sem legenda separada", "Automática · 1080p", "Animes Digital · HLS".
  - O PostgreSQL recebeu a posição de 33 s, a duração de 1.420.117 ms e 33 s assistidos.
- **Leitor (desktop):** páginas 1 e 3 (dupla) do capítulo 1 em ordem oriental; progresso salvo na
  página 5 (10,8%) em um único envio.
- **Celular (375 px):**
  - O player sem rolagem horizontal.
  - O leitor ajusta a página à largura.
  - No modo vertical, as 38 páginas reservam a altura e 17 carregaram sob demanda.
- **Ficha da obra:** sinopse do AniList com "Sinopse: AniList · fonte original: Crunchyroll · texto
  original em inglês" e o episódio com "Reprodução no NekoFlow".

## 11. Antes × depois

| | Antes | Depois |
| --- | --- | --- |
| Tempo do player | `setInterval` somando 0,25 s | `currentTime`/`duration` do `<video>` |
| Qualidade, áudio e legenda | Listas fixas (1080/720/480, PT/JA) | Faixas reais da mídia; "Única qualidade disponível" quando é o caso |
| Comentários no player | Comentários de exemplo | Ocultos no player real (pertencem ao protocolo de Comunidade) |
| Páginas do leitor | Capa, banner e personagens repetidos | Páginas do manifesto, na ordem editorial |

O visual, os controles e as animações são os mesmos do design.

## 12. Commits e limitações

Commits:
- `feat: add authorized media sources, chapter pages and editorial import`
- `feat: sync work synopsis from AniList with attribution`
- `feat: play authorized episode streams in the real player`
- `feat: read published chapter pages in the real reader`
- `feat: open player and reader from work pages with AniList attribution`
- `feat: add editorial chapter page import and AniList sync to the admin panel`
- `docs: record protocol 06 real media`

Limitações conhecidas:
- **Direitos do capítulo 1:** as páginas são uma tradução de fãs ("Cat Manias") hospedada pelo Manga
  Livre. Ficou registrado como autorizado pelo responsável do Manga Livre, conforme informado.
  Confirme que essa autorização cobre a exibição no NekoFlow.
- **Sinopse em inglês:** o AniList só oferece o texto em inglês, e ele é exibido como veio, com aviso.
  Uma tradução editorial para PT-BR pode ser cadastrada à parte.
- **Fonte de vídeo:** sem marcações de abertura e encerramento cadastradas ("Pular abertura" só aparece
  com marcação) e sem faixas de legenda separadas. O episódio informa "Sem legenda separada".
- **URL do CDN de terceiros:** é pública e não pode ser assinada pelo NekoFlow. O `expiresAt` controla
  só a revalidação pelo Java.
- **Fora do escopo:** DASH, DRM e adaptadores de embed com API (`postMessage`) não foram implementados,
  porque nenhuma fonte atual precisa deles.
- **Desempenho:** não foi medido em Android intermediário e iPhone físico, só com emulação de 375 px.
- **Toque no leitor:** na emulação de toque, o toque no centro nem sempre abre os controles (o botão e
  o teclado funcionam). É herdado do design e precisa de verificação num aparelho real.
