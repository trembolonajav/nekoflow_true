# APIs de leitura externas

O NekoFlow expõe uma interface normalizada e somente leitura para catálogos externos. As rotas não aceitam URLs arbitrárias: cada provedor possui origem e caminhos fixos no backend.

## Provedores

| Código | Catálogo | Idioma | Integração | Conteúdo adulto | Estado atual |
| --- | --- | --- | --- | --- | --- |
| `tiamanhwa-ptbr` | TiaManhwa | pt-BR | API não oficial autorizada | Sim | Catálogo, ficha, capítulos e páginas; usa resolvedor TLS restrito ao domínio autorizado |
| `comix-en` | Comix | inglês | API não oficial | Classificado por obra | Catálogo, ficha e capítulos; páginas permanecem externas enquanto o token público do leitor não estiver mapeado |
| `manhwabuddy-en` | ManhwaBuddy | inglês | API não oficial autorizada | Classificado por obra | Catálogo, ficha, capítulos e páginas |

`adultCatalog` indica que o catálogo pode conter material adulto. A aplicação consumidora ainda deve aplicar autenticação, verificação etária e filtros editoriais próprios.

## Endpoints públicos

Base: `/api/v1/providers`

```text
GET /reading
GET /{provider}/health
GET /{provider}/series?page=1&size=24&search=termo
GET /{provider}/series/{seriesId}
GET /{provider}/series/{seriesId}/chapters
GET /{provider}/series/{seriesId}/chapters/{chapterId}
```

Exemplo:

```bash
curl http://localhost:9080/api/v1/providers/manhwabuddy-en/health
curl "http://localhost:9080/api/v1/providers/manhwabuddy-en/series?page=1&size=12"
curl http://localhost:9080/api/v1/providers/manhwabuddy-en/series/inside-my-sister-in-law/chapters
curl http://localhost:9080/api/v1/providers/manhwabuddy-en/series/inside-my-sister-in-law/chapters/chapter-50
```

O leitor retorna `externalOnly: false` quando `pages` contém as imagens do capítulo. Quando o provedor publica somente um leitor externo que ainda não foi normalizado, a resposta usa `externalOnly: true` e preserva a URL original.

## Saúde das integrações

O painel **Admin > Integrações** inventaria APIs oficiais, APIs não oficiais e parcerias autorizadas. Cada cartão mostra estado, latência, idioma, tipo de integração e a mensagem do último teste.

```text
GET  /api/admin/integrations
POST /api/admin/integrations/{code}/test
POST /api/admin/integrations/test-all
```

Essas rotas exigem perfil de moderador ou administrador. O backend também testa todas as integrações a cada 30 minutos. Um teste `DOWN` não remove obras nem fontes; ele apenas registra que a origem não respondeu corretamente naquele momento.

## Importação integral para o catálogo NekoFlow

As APIs normalizadas também alimentam importações administrativas assíncronas, idempotentes e retomáveis. Obras já existentes são mescladas pelo identificador externo ou título; a fonte nova vira edição/servidor alternativo e não cria uma cópia desnecessária.

```text
POST /api/admin/catalog/reading-providers/archive/sync
GET  /api/admin/catalog/reading-providers/archive/status

POST /api/admin/catalog/reading-providers/{provider}/archive/sync
GET  /api/admin/catalog/reading-providers/{provider}/archive/status
```

Use `?refresh=true` somente quando for necessário reprocessar inclusive itens concluídos. Sem esse parâmetro, uma nova execução reaproveita `catalog_import_run` e `catalog_import_item`, pula o que já foi gravado e tenta novamente apenas itens novos ou rejeitados.

- O Comix é enumerado pelo catálogo público completo, com todas as classificações. Ele entra com ficha e URL de origem; páginas permanecem externas.
- O ManhwaBuddy usa os oito sitemaps compactados como inventário autoritativo. Os capítulos encontrados neles são ligados ao leitor interno.
- O TiaManhwa usa paginação pública pelo adaptador autorizado, com controle de taxa e cookies persistentes.
- O estado inclui total, processados, criados, atualizados, capítulos, falhas, item atual e último erro.

## Operação e limites

- Os IDs aceitos são slugs seguros; não existe endpoint de proxy genérico.
- O cache padrão das páginas de catálogo é de 120 segundos.
- Timeouts e origens podem ser configurados pelas variáveis `READING_PROVIDERS_*`, `TIAMANHWA_ORIGIN`, `COMIX_ORIGIN` e `MANHWABUDDY_ORIGIN`.
- O TiaManhwa usa o gateway `tia-fetcher` do Docker Compose e o adaptador gerenciado `NekoFlow-TiaManhwa-Adapter` no Windows. O adaptador é necessário porque o domínio parceiro aceita a pilha TLS nativa do Windows e rejeita clientes Linux. Ele é registrado uma única vez pelo projeto, inicia automaticamente no login e reinicia em caso de falha. O gateway exige segredo compartilhado e aceita exclusivamente caminhos relativos de `https://tiamanhwa.com`; não funciona como proxy genérico.
- Mudanças no HTML de um provedor podem exigir atualização do adaptador.
- A saúde mede disponibilidade e validade mínima da resposta, não garante que todos os capítulos estejam completos.

