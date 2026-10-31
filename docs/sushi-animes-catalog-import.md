# Importação autorizada do Sushi Animes

Esta integração importa o catálogo de animação em português do Sushi Animes. Ela é separada das integrações de leitura do Manga Livre e do WeebCentral English.

## Origem e escopo

- Inventário: `sitemap.posts_*.xml` e `sitemap.episodes_*.xml` publicados pelo provedor.
- Metadados: ficha pública de cada obra, incluindo título, título alternativo, capa, sinopse, ano, duração, classificação, gêneros, áudio e títulos de episódios.
- Reprodução: a URL salva é a página oficial do episódio. O endereço do MP4 é resolvido pelo backend no momento da reprodução e não é persistido como se fosse estável.
- Autorização: uso do catálogo e do CDN confirmado pelo Sushi Animes ao responsável pelo NekoFlow em 28/10/2026.

## Mesclagem e servidores alternativos

O importador procura, nesta ordem:

1. identificador externo `SUSHI_ANIMES` já registrado;
2. slug equivalente;
3. título canônico e ano compatível.

Os sufixos `(Dublado)` e `(Legendado)` são removidos somente para localizar a obra canônica. As fontes continuam separadas por episódio, com seus idiomas preservados. Quando o episódio já possui outra fonte habilitada, o Sushi entra com prioridade 50 e o rótulo `alternativo`. Em obras novas, ele entra com prioridade 10.

## Executar e acompanhar

Os endpoints abaixo exigem papel editorial:

```http
POST /api/admin/catalog/sushi-animes/archive/sync?refresh=false
GET  /api/admin/catalog/sushi-animes/archive/status
```

`refresh=false` retoma a coleta, ignorando obras já concluídas em execuções anteriores. Use `refresh=true` para reler todas as fichas e atualizar o catálogo.

O status informa a fase, o total encontrado nos sitemaps, obras processadas, obras criadas ou mescladas, episódios e fontes importados, falhas de metadados e falhas de banco.

## Auditoria

Cada execução cria um registro em `catalog_import_run`. Cada obra gera um item em `catalog_import_item`, com a quantidade de episódios e fontes importadas ou a razão da rejeição. Ao final, um resumo é gravado em `catalog_audit_event` com a ação `SUSHI_ANIMES_ARCHIVE_SYNC`.

Se a ficha de uma obra falhar temporariamente, o importador ainda usa os dados de identidade do sitemap para não perder os episódios. A falha de enriquecimento aparece em `metadataFailures` e uma nova execução com `refresh=true` pode completá-la.
