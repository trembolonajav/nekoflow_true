# Auditoria e importação do Sushi Animes — 29/10/2026

## Resultado

| Medida | Resultado |
| --- | ---: |
| URLs de obras no sitemap | 679 |
| Identificadores de obra distintos | 622 |
| URLs de episódios no sitemap | 19.090 |
| URLs de episódio distintas | 19.087 |
| Obras canônicas do NekoFlow vinculadas | 513 |
| Episódios canônicos com fonte Sushi | 14.857 |
| Fontes Sushi ativas | 19.087 |
| Fontes adicionadas como servidor alternativo | 5.237 |
| Fontes em que o Sushi é o único servidor | 13.850 |
| Falhas finais de importação | 0 |

As diferenças entre URLs, identificadores e obras canônicas são esperadas. O provedor pode publicar mais de uma ficha para a mesma obra, por exemplo variantes dublada e legendada. O NekoFlow preserva cada URL como fonte distinta, mas reúne as variantes na obra e no episódio canônicos quando o título e o ano são compatíveis.

## Execuções

- Lote principal: `429cf408-f544-4fad-a648-847892350b81`
- Retomada: `27a29aac-fad4-43d3-a065-8acb33c1177d`

O lote principal processou 621 identificadores e rejeitou uma ficha cujo slug ultrapassava o limite do identificador externo. O importador foi corrigido para usar o identificador numérico estável do Sushi. A retomada importou a obra restante e seus 12 episódios sem falhas.

## Metadados incompletos

Seis fichas responderam HTTP 204 durante o enriquecimento: `481`, `500`, `716`, `1028`, `1033` e `1053`. Seus 192 episódios foram importados a partir do sitemap, com URLs reais e identidade de obra preservada. Uma execução futura com `refresh=true` pode tentar preencher novamente capa, sinopse e demais metadados dessas fichas.

## Convivência com outros servidores

O Sushi foi gravado com prioridade 50 quando o episódio já possuía outra fonte habilitada. Quando não havia outra fonte, recebeu prioridade 10. Uma falha anterior na quarentena do HiAnime desativava todas as fontes de um episódio rejeitado. A regra foi corrigida para desativar somente o provedor HiAnime; 4.535 fontes Sushi afetadas foram restauradas.

## Reprodução validada

O episódio 5 de Dororo foi reproduzido pelo endpoint interno do NekoFlow usando a página oficial do episódio como referência. O teste solicitou `bytes=0-1023` e recebeu:

- HTTP `206 Partial Content`
- 1.024 bytes
- `Content-Type: video/mp4`
- `Content-Range: bytes 0-1023/131788261`
- `Accept-Ranges: bytes`

O banco guarda a página oficial do episódio. O endereço temporário do MP4 é resolvido no momento da reprodução, com os cabeçalhos autorizados, sem presumir nomes de arquivo e sem persistir tokens temporários.

## Rastreamento

As execuções estão em `catalog_import_run`. O resultado por identificador está em `catalog_import_item`. O resumo final está em `catalog_audit_event` com a ação `SUSHI_ANIMES_ARCHIVE_SYNC`.
