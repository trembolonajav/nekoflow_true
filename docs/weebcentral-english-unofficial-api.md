# API não oficial WeebCentral — conteúdo em inglês

## Escopo e idioma

Esta é uma API HTTP não oficial e somente leitura que normaliza páginas públicas do
`weebcentral.com`.

**Todo capítulo fornecido por este adaptador está em inglês.** O namespace termina em `-en` e as
respostas incluem `"language": "en"` para evitar confusão com a integração MangaLivre em
português. O campo `type` preserva a classificação publicada pela origem: `Manga`, `Manhwa`,
`Manhua` ou `OEL`. Portanto, “catálogo em inglês” descreve o idioma da tradução, não necessariamente
o país ou formato original da obra.

Base local padrão:

```text
http://localhost:9090/api/v1/providers/weebcentral-en
```

Não há download, cópia ou proxy das imagens. A API retorna as URLs HTTPS publicadas pela origem.
Esta integração não possui vínculo oficial com o WeebCentral e pode precisar de manutenção caso o
HTML público seja alterado. Quem operar uma instância é responsável por permissões, termos de uso,
direitos autorais, limites de acesso e disponibilidade da origem.

## Endpoints

### Saúde

```http
GET /health
```

```json
{"status":"UP","latencyMs":245,"language":"en"}
```

### Busca e catálogo em inglês

```http
GET /series?offset=0&limit=24&search=one%20piece&type=Manga&adult=Any
```

| Parâmetro | Padrão | Valores | Descrição |
|---|---:|---|---|
| `offset` | `0` | 0–1.000.000 | Posição inicial. |
| `limit` | `24` | 1–32 | Resultados por lote. |
| `search` | vazio | até 100 caracteres | Texto em inglês ou título romanizado. |
| `type` | vazio | `Manga`, `Manhwa`, `Manhua`, `OEL` | Tipo original publicado pela origem. |
| `adult` | `Any` | `Any`, `True`, `False` | Filtro de conteúdo adulto. |

Resposta resumida:

```json
{
  "items": [{
    "id": "01J76XY7E9FNDZ1DBBM6PBJPFK",
    "slug": "One-Piece",
    "title": "One Piece",
    "type": "Manga",
    "status": "Ongoing",
    "year": 1997,
    "authors": ["ODA Eiichiro"],
    "tags": ["Action", "Adventure", "Comedy"],
    "officialTranslation": true,
    "adultContent": null,
    "language": "en"
  }],
  "offset": 0,
  "limit": 24,
  "nextOffset": 24,
  "hasMore": true,
  "language": "en"
}
```

Use `nextOffset` enquanto `hasMore` for verdadeiro. `adultContent: null` em um resultado resumido
significa que a origem não exibiu essa informação no cartão; a ficha detalhada fornece o valor.

### Ficha da obra

```http
GET /series/{seriesId}
GET /series/01J76XYFD1Z4VFXGGTVR822H7C
```

Retorna título, capa, descrição em inglês, autores, tags, ano, status, tipo, tradução oficial,
adaptação em anime e indicação adulta. `seriesId` é o ULID de 26 caracteres publicado pelo
WeebCentral.

### Capítulos em inglês

```http
GET /series/{seriesId}/chapters
```

```json
{
  "seriesId": "01J76XYFD1Z4VFXGGTVR822H7C",
  "items": [{
    "id": "01M57EX8EFDFG9V93SNDRVYPSG",
    "label": "Chapter 160",
    "number": "160",
    "title": "",
    "url": "https://weebcentral.com/chapters/01M57EX8EFDFG9V93SNDRVYPSG",
    "publishedAt": "2026-10-18T12:13:44.272Z",
    "language": "en"
  }],
  "totalElements": 160,
  "language": "en"
}
```

### Leitor e páginas

```http
GET /chapters/{chapterId}
GET /chapters/01J76XYWSM8ZJ49XB2V51HC9J4
```

```json
{
  "id": "01J76XYWSM8ZJ49XB2V51HC9J4",
  "title": "Chapter 1",
  "chapterNumber": "1",
  "seriesId": "01J76XYA66JC7CVZCB226MRK9R",
  "seriesTitle": "Level E",
  "seriesUrl": "https://weebcentral.com/series/01J76XYA66JC7CVZCB226MRK9R/Level-E",
  "language": "en",
  "pages": [
    {"index":1,"imageUrl":"https://scans.example/manga/page-001.png","alt":"Page 1"}
  ]
}
```

Somente imagens HTTPS são retornadas, na ordem publicada pelo leitor. Os arquivos permanecem nos
servidores da origem/CDN; clientes devem tratar falhas e mudanças de URL.

## Configuração

| Variável | Padrão | Finalidade |
|---|---|---|
| `WEEBCENTRAL_EN_ENABLED` | `true` | Liga o adaptador em inglês. |
| `WEEBCENTRAL_EN_ORIGIN` | `https://weebcentral.com` | Origem pública consultada. |
| `WEEBCENTRAL_EN_API_TIMEOUT_SECONDS` | `20` | Timeout de cada consulta. |
| `WEEBCENTRAL_EN_CACHE_TTL_SECONDS` | `120` | Cache local de respostas válidas. |

O cache é local ao processo, limitado a 512 URLs e não armazena falhas. `/health` sempre consulta
a origem sem cache.

## Importação completa no NekoFlow

Uma sessão com papel `EDITOR` ou superior pode iniciar e acompanhar a importação das 10.870 obras:

```http
POST /api/admin/catalog/weebcentral-en/archive/sync
GET  /api/admin/catalog/weebcentral-en/archive/status
```

O `POST` aceita `refresh=true` para consultar novamente obras já concluídas. Sem esse parâmetro, o
processo retoma a carga e pula itens registrados com sucesso em execuções anteriores. O status
informa obras totais, processadas, criadas, atualizadas, reaproveitadas, falhas e capítulos.

Cada obra recebe uma edição separada chamada `English — WeebCentral`, com idioma `en`. Mangás usam
leitura paginada e direção RTL; manhwas e manhuas usam leitura vertical LTR. Os capítulos abrem no
leitor interno do NekoFlow, mas as imagens são resolvidas da origem somente quando o usuário abre o
capítulo — elas não são copiadas para o armazenamento local.

A carga usa uma fila HTTP conservadora, com intervalo global mínimo de 750 ms, respeito ao cabeçalho
`Retry-After` e espera progressiva quando o provedor responde `429`. Gravações são idempotentes e
sequenciais. Obras concluídas ficam registradas em `catalog_import_item`, permitindo retomar uma
execução interrompida sem repetir todo o acervo. Esse desenho prioriza completar a carga sem
sobrecarregar o site de origem; por isso a primeira importação pode levar algumas horas e continua
em segundo plano.

## Exemplo JavaScript

```js
const base = "http://localhost:9090/api/v1/providers/weebcentral-en";

const results = await fetch(`${base}/series?search=One%20Piece&type=Manga`)
  .then(response => {
    if (!response.ok) throw new Error(`WeebCentral English: HTTP ${response.status}`);
    return response.json();
  });

if (results.language !== "en") throw new Error("Idioma inesperado");

const chapters = await fetch(`${base}/series/${results.items[0].id}/chapters`)
  .then(response => response.json());
```

## Contratos públicos utilizados

1. `/search/data` para busca, filtros e paginação por offset.
2. `/series/{ULID}` para a ficha editorial.
3. `/series/{ULID}/full-chapter-list` para os capítulos.
4. `/chapters/{ULID}/images` para as páginas do leitor.

Os parsers possuem testes com amostras mínimas. Uma alteração incompatível na origem resulta em
`404` ou `502`, nunca em conteúdo inventado. Evite varreduras agressivas e respeite o cache e a
disponibilidade do serviço.
