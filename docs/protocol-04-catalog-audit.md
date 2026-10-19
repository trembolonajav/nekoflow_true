# Protocolo 04 — auditoria do catálogo existente

Linha de base: 2026-10-19, branch `feat/protocolo-04-catalogo`, criada de `feat/protocolo-03-autenticacao` (`af4ec78`). Nenhuma migração do Protocolo 04 havia sido executada na produção deste relatório.

## Fontes atuais

O catálogo já possui uma primeira estrutura real: a tabela `work`, criada em V2, é preenchida idempotentemente pelo `CatalogSeeder`. O seeder combina `explorar.json` com documentos de Home, Calendário, Leituras e as duas fichas ricas. Os 11 documentos continuam preservados em `content_document` e nos arquivos `backend/src/main/resources/seed`.

| Fonte | Estrutura/quantidade relevante |
|---|---|
| `explorar` | 160 obras; fonte mais completa para cards e filtros |
| `calendario` | 159 itens de animação e 70 de leitura, com sobreposição |
| `leituras` | 58 leituras |
| `home` | 5 heróis, 18 da temporada, 4 continuações e 8 recentes |
| `obra` | ficha rica de Solo Leveling anime; 2 temporadas |
| `leitura-obra` | ficha rica de Solo Leveling manhwa |
| `content_document` | 11 documentos JSON, aproximadamente 200 kB; deve permanecer disponível durante a transição |

Existem somente 15 assets locais do frontend (11 PNG e 4 JPG, principalmente leitor/identidade). Capas e banners do catálogo são URLs externas já referenciadas; nenhuma imagem será copiada ou considerada licenciada por esta migração.

## Estado do PostgreSQL

- 265 obras e 265 IDs distintos: 130 animes, 20 filmes, 55 mangás e 60 manhwas.
- 50 registros marcados como webtoon.
- 104 sem aliases, 104 sem situação, 104 sem ano, 119 sem total de unidades e 108 sem banner.
- Nenhuma capa ausente na amostra atual.
- 20 títulos aparecem duas vezes, sempre como identidades editoriais distintas entre animação e leitura: por exemplo `anime:151807` e `manhwa:105398` para Solo Leveling.
- Não foi encontrada duplicação de IDs.
- Existem 20 referências em `library_entry` e 144 em `progress`; a chave `BIGINT` atual não pode ser substituída ou renumerada.
- `release_event` está vazio. Hoje `available_units` é elevado por publicação e mistura metadado editorial com disponibilidade real.

## Backend atual

- `Work` é um record simples com tipo, título, aliases concatenados, imagens, ano e contagens.
- `WorkRepository.search` carrega todas as linhas e filtra em memória; não pagina e não escala.
- `CatalogController` expõe `/api/catalog/all`, busca e consulta por slug, sem versionamento ou visibilidade.
- O slug é calculado em Java como `titulo-id`; é estável pelo ID, mas não é persistido nem reservado.
- O painel editorial cria uma obra imediatamente visível, sem rascunho, histórico de revisão ou edição.
- “Publicar episódio/capítulo” apenas eleva `available_units`; não há entidade real de temporada, episódio, edição ou capítulo.
- Papéis do Protocolo 03 já protegem `/api/admin/works/**`, mas a rota de criação atual está em `/api/admin/works` e precisa evoluir para um contrato editorial versionado.

## Frontend atual

- Header, Home, Explorar e Leituras já consomem a tabela `work` indiretamente por `/api/catalog/all`, porém ainda misturam metadados vindos dos JSON de tela.
- `WorkRoute` consulta uma obra por slug. Somente os IDs 151807 e 105398 abrem as fichas ricas; os demais usam `BasicWorkDetail`.
- `Obra.jsx`, `ObraLeitura.jsx`, Player e Leitor contêm textos, episódios, capítulos e relações específicos de Solo Leveling oriundos de `/api/content`.
- O painel Admin possui cadastro mínimo, busca e publicação de uma unidade numérica.
- O mecanismo central de URLs do Protocolo 02 já distingue anime e leitura de mesmo nome e deve ser mantido.

## Linha de base

- Frontend: 14/14 testes aprovados.
- Build Vite aprovado; alerta conhecido de bundle principal com 696,31 kB.
- Backend: testes Maven aprovados.
- Git limpo antes da criação da branch.

## Riscos e decisão

Não haverá substituição destrutiva de `work`, exclusão de `content_document` ou importação por título. A implementação deve evoluir `work` de forma aditiva, manter o ID legado usado pelas FKs, adicionar UUID público e normalizar entidades relacionadas. `available_units` permanece apenas como compatibilidade até Player/Leitor usarem disponibilidades reais; episódios e capítulos novos começam indisponíveis.
