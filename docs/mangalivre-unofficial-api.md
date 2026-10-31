# API não oficial MangaLivre

## Visão geral

O NekoFlow oferece uma API HTTP somente leitura que normaliza informações públicas do
`mangalivre.blog`. Ela serve como uma camada de adaptação: consumidores não precisam conhecer os
endpoints do WordPress, interpretar fragmentos HTML de capítulos ou extrair as imagens do leitor.

Esta integração não é uma API oficial do MangaLivre. Os contratos da origem podem mudar sem aviso.
Não há download, cópia ou proxy das páginas: as respostas contêm as URLs HTTPS publicadas pela
origem. Quem operar uma instância é responsável por permissões, termos de uso, direitos autorais,
limites de acesso e disponibilidade do provedor.

Base local padrão:

```text
http://localhost:9090/api/v1/providers/mangalivre
```

Todas as rotas são `GET`, públicas e retornam JSON. Erros seguem o envelope documentado em
`docs/api-conventions.md`.

## Endpoints

### Saúde e conectividade

```http
GET /health
```

Executa uma consulta sem cache à origem. `UP` confirma que o catálogo respondeu e informa latência
e quantidade atual de obras.

```json
{"status":"UP","latencyMs":186,"catalogSize":757}
```

O HTTP `502` significa que o backend está funcionando, mas a origem falhou, excedeu o timeout ou
mudou para um formato incompatível.

### Catálogo

```http
GET /manga?page=1&size=24&search=one%20piece
```

| Parâmetro | Padrão | Limite | Descrição |
|---|---:|---:|---|
| `page` | `1` | mínimo 1 | Página baseada em 1. |
| `size` | `24` | 1–100 | Obras por página. |
| `search` | vazio | 100 caracteres | Pesquisa textual processada pela origem. |

Resposta:

```json
{
  "items": [{
    "id": 575284,
    "slug": "one-piece",
    "title": "One Piece",
    "url": "https://mangalivre.blog/manga/one-piece/",
    "modifiedAt": "2026-09-28T13:54:28-03:00"
  }],
  "page": 1,
  "size": 24,
  "totalElements": 1,
  "totalPages": 1
}
```

O catálogo é dinâmico. Uma obra publicada na origem passa a aparecer sem alteração de código ou
seed no NekoFlow, respeitando o TTL de cache configurado.

### Detalhe da obra

```http
GET /manga/{mangaSlug}
GET /manga/one-piece
```

Retorna identificador da origem, título, sinopse, capa, URL canônica e total de capítulos. O slug
aceita letras ASCII, números, hífens e sequências UTF-8 percent-encoded que venham do próprio
WordPress; não é possível usar esse parâmetro para consultar outros hosts.

### Capítulos

```http
GET /manga/{mangaSlug}/chapters?offset=0&search=
GET /manga/one-piece/chapters?offset=1170
GET /manga/one-piece/chapters?search=112
```

A origem entrega até 30 capítulos por lote. Use `nextOffset` enquanto `hasMore` for `true`.

```json
{
  "items": [{
    "slug": "one-piece-capitulo-1196",
    "number": "1196",
    "title": "",
    "url": "https://mangalivre.blog/capitulo/one-piece-capitulo-1196/",
    "publishedLabel": "há 2 semanas"
  }],
  "offset": 0,
  "nextOffset": 30,
  "totalElements": 1196,
  "hasMore": true
}
```

`publishedLabel` é o texto relativo fornecido pela origem, não uma data normalizada. Consumidores
não devem usá-lo como identificador nem para ordenação.

### Leitor do capítulo

```http
GET /chapters/{chapterSlug}
GET /chapters/one-piece-capitulo-1196
```

Retorna obra, número, navegação e páginas na ordem de leitura. Somente URLs HTTPS são incluídas.

```json
{
  "slug": "one-piece-capitulo-1196",
  "title": "One Piece — Capítulo 1196",
  "mangaTitle": "One Piece",
  "mangaUrl": "https://mangalivre.blog/manga/one-piece/",
  "chapterNumber": "1196",
  "previousChapterUrl": "https://mangalivre.blog/capitulo/one-piece-capitulo-1195/",
  "nextChapterUrl": null,
  "pages": [
    {"index":1,"imageUrl":"https://mangalivre.blog/wp-content/uploads/.../pagina.webp","alt":"Página 1"}
  ]
}
```

As imagens não passam pelo NekoFlow. Hotlinking pode ser bloqueado pela origem; clientes devem
tratar falhas de imagem e não presumir permanência das URLs.

### Integração com o leitor do NekoFlow

Quando uma obra é sincronizada pelo endpoint administrativo, cada capítulo fica disponível na
rota interna `/leitor?chapter={chapterId}&edition={editionId}`. O manifesto do leitor consulta as
páginas do MangaLivre no momento da abertura, mantém a navegação entre capítulos e aceita somente
imagens HTTPS de hosts explicitamente autorizados no provedor `MANGA_LIVRE_CDN`.

As edições sincronizadas usam leitura vertical contínua, pois os arquivos de imagem podem ser
segmentos consecutivos da mesma página. O leitor mede a dimensão real de cada arquivo no navegador
e encosta os segmentos sem recorte ou espaçamento artificial.

O leitor permite trocar, na barra superior, entre `Contínuo`, `Página` e `Livro`. Página única e
livro duplo aceitam clique/toque nas laterais; no celular, também aceitam gesto horizontal. A
direção de avanço respeita a configuração oriental (RTL) ou ocidental (LTR), e a preferência fica
salva para a edição.

As imagens continuam hospedadas na origem; a sincronização salva metadados, URLs dos capítulos e
quantidade de páginas, mas não duplica os arquivos no armazenamento do NekoFlow.

## Configuração

| Variável | Padrão | Finalidade |
|---|---|---|
| `MANGALIVRE_ENABLED` | `true` | Liga ou desliga o adaptador. |
| `MANGALIVRE_ORIGIN` | `https://mangalivre.blog` | Origem consultada pelo backend. |
| `MANGALIVRE_API_TIMEOUT_SECONDS` | `20` | Timeout de conexão e resposta. |
| `MANGALIVRE_CACHE_TTL_SECONDS` | `120` | TTL das respostas bem-sucedidas. |

O cache é local a cada processo, limitado a 512 chaves e nunca armazena falhas. `/health` ignora o
cache. Em implantação com várias réplicas, cada processo mantém seu próprio cache.

## Exemplo de cliente

```js
const base = "http://localhost:9090/api/v1/providers/mangalivre";
const catalog = await fetch(`${base}/manga?page=1&size=24`).then(r => {
  if (!r.ok) throw new Error(`MangaLivre: HTTP ${r.status}`);
  return r.json();
});

const chapters = await fetch(`${base}/manga/${catalog.items[0].slug}/chapters?offset=0`)
  .then(r => r.json());
```

## Estratégia técnica e manutenção

O adaptador usa três contratos independentes da origem:

1. WordPress REST (`wp/v2/manga`) para catálogo e descoberta de obras novas.
2. SlimeRead REST (`slimeread/v1/chapters/{id}`) para paginação e busca de capítulos.
3. HTML público do leitor para as páginas, pois o REST de `chapter` não expõe as imagens.

Seletores e parsers possuem testes com amostras mínimas. Uma alteração da origem deve resultar em
resposta `404` ou `502`, nunca em dados inventados. Antes de atualizar um parser, valide pelo menos:

```bash
cd backend
mvn test
mvn -Dmangalivre.live=true -Dtest=MangaLivreLiveSmokeTest test
curl -f http://localhost:9090/api/v1/providers/mangalivre/health
curl -f "http://localhost:9090/api/v1/providers/mangalivre/manga/one-piece/chapters?offset=1170"
curl -f http://localhost:9090/api/v1/providers/mangalivre/chapters/one-piece-capitulo-1196
```

Não use varreduras agressivas. Percorra o catálogo e os capítulos sequencialmente, respeite o cache,
adicione espera entre lotes em sincronizações externas e interrompa a coleta quando a origem sinalizar
rate limit ou indisponibilidade.

## Sincronização editorial no NekoFlow

Editores podem vincular todos os capítulos de uma obra de leitura já cadastrada e inventariar a
quantidade de páginas de cada um:

```http
POST /api/admin/catalog/mangalivre/{mangaSlug}/sync
```

A operação exige sessão com papel `EDITOR` ou superior. Ela é idempotente, preserva capítulos já
publicados nativamente, cadastra os demais como fontes externas e atualiza os totais da obra. A
resposta inclui `chapterCount`, `totalPages`, mínimo, máximo, média e a lista `chapters` com
`pageCount`. Como a operação consulta cada leitor, ela pode levar alguns minutos em obras grandes.
Depois da sincronização, `GET /api/v1/works/{workId}/chapters` também expõe `page_count` em cada
capítulo, permitindo que clientes consultem o inventário sem repetir a varredura da origem.

### Importação do acervo completo

Para trazer ou atualizar todas as obras e capítulos do catálogo em segundo plano:

```http
POST /api/admin/catalog/mangalivre/archive/sync
GET  /api/admin/catalog/mangalivre/archive/status
```

As duas rotas exigem sessão com papel `EDITOR` ou superior. O `POST` inicia apenas uma execução por
processo; se outra já estiver ativa, devolve o estado dela. O `GET` informa `totalWorks`,
`processedWorks`, `createdWorks`, `updatedWorks`, `chaptersImported`, `failures`, a obra atual e os
horários da execução.

A importação é idempotente e mantém os arquivos na origem. Ela cadastra capa, sinopse, gêneros,
classificação etária, tipo de leitura e os metadados dos capítulos; as páginas são resolvidas pela
API somente quando alguém abre o leitor. Obras marcadas como `long-strip`, `web-comic` ou `pornhwa`
são tratadas como leitura vertical. Marcadores `hentai` e `pornhwa` geram classificação `EXPLICIT`,
`adulto` gera `ADULT` e `ecchi` gera `MATURE`. Uma falha isolada é registrada em
`catalog_import_item` e não interrompe o restante do acervo.
