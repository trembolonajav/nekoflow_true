# Protocolo 04 — modelo de domínio aprovado para implementação

## Identidade central

A tabela existente `work` continua sendo a raiz agregada e mantém `id BIGINT` como chave interna para compatibilidade. Ela receberá `public_id UUID`, `slug`, `media_family`, `work_format`, `reading_category`, `presentation_format`, idioma/país, sinopses, situação narrativa, visibilidade, classificação, datas e timestamps.

Restrições principais:

- `public_id` único e imutável;
- `(media_family, slug)` único;
- `media_family`: `ANIMATION` ou `READING`;
- `visibility`: `DRAFT`, `PUBLISHED`, `HIDDEN` ou `ARCHIVED`;
- manhwa/webtoon é uma obra `READING`: categoria editorial e apresentação são dimensões separadas;
- cadastro ou existência de uma unidade não significa disponibilidade de reprodução/leitura.

## Entidades relacionadas

| Entidade | Decisão de integridade |
|---|---|
| `work_title` | títulos `PRIMARY`, `ORIGINAL`, `TRANSLATION` e `ALIAS`; normalização indexada, sem string concatenada como fonte oficial |
| `genre`, `work_genre` | vocabulário único por slug e relação N:N |
| `tag`, `work_tag` | temas separados de gêneros |
| `franchise`, `franchise_work` | agrupamento editorial, sem confundir com relação narrativa |
| `work_relation` | origem/destino direcionais, tipo explícito e par único; auto-relação proibida |
| `season` | pertence somente a animação; número editorial opcional e posição estável obrigatória |
| `episode` | pertence a temporada; rótulo público e posição estável; disponibilidade começa `UNAVAILABLE` |
| `work_edition` | idioma/mercado de uma leitura; identifica edição original ou tradução |
| `volume` | opcional e vinculado à obra/edição |
| `chapter` | rótulo como `2.5`, `Prólogo` ou `Extra`, com `sort_position NUMERIC`; volume opcional |
| `person`, `work_contributor` | pessoa/equipe e função editorial normalizada |
| `media_asset` | URL, tipo, proveniência e texto alternativo; sem armazenar binários na linha |
| `external_identifier` | `(provider, external_id)` único; base da importação idempotente |
| `catalog_import_run/item` | dry-run, origem, resultado e motivo por item |
| `catalog_audit_event` | ator, operação, entidade, antes/depois e data |

## Compatibilidade e API

- `/api/catalog/**` e `/api/content/**` permanecem durante a transição.
- A nova API pública será `/api/v1/works` e retornará somente `PUBLISHED`.
- Editores podem visualizar rascunhos pela API administrativa protegida.
- Respostas de lista são compactas e paginadas; detalhes carregam coleções por endpoints próprios.
- IDs públicos são UUIDs; `legacyId` será retornado enquanto biblioteca, progresso e rotas antigas dependem do `BIGINT`.
- URLs públicas continuam usando a seção e o slug canônico. Slugs antigos com sufixo de ID permanecem resolvíveis e redirecionáveis.

## Migração

Um importador controlado lerá os seeds preservados. `--dry-run` será o padrão conceitual e informará `created`, `updated`, `unchanged`, `rejected` e avisos. A chave de correspondência será identificador externo (AniList) + família, nunca apenas o título. Reexecução fará upsert sem duplicar. Campos ausentes permanecem nulos; nenhuma temporada, capítulo, data ou disponibilidade será inventada.

As 265 linhas atuais serão enriquecidas no lugar. Registros já existentes serão inicialmente `PUBLISHED` para preservar o catálogo visível; novas obras editoriais começam `DRAFT`. As unidades detalhadas serão importadas somente das duas fontes ricas quando houver identidade e dados explícitos, sempre com disponibilidade `UNAVAILABLE` neste protocolo.
