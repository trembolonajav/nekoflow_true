# Protocolo 04 — Catálogo dinâmico concluído

## Resultado

O catálogo normalizado do PostgreSQL é a identidade central das obras. Os documentos do Claude Design continuam preservados como curadoria visual e compatibilidade, mas Home, Header, Animes, Leituras, Explorar, pesquisa e fichas individuais reconciliam título, capa, tipo, ano, situação e URL com os registros de `work`.

O modelo mantém anime e leitura como obras distintas, com relações direcionadas, sem duplicar manhwa por ser webtoon. A migração v5 criou obras, títulos, gêneros, tags, franquias, relações, temporadas, episódios, edições, volumes, capítulos, profissionais, assets, identificadores externos, importações e auditoria. As migrações v6/v7 adicionaram fontes externas com proveniência e um caso real de aprovação.

## Caso de aprovação: Heavy Knight

- Anime: AniList `180136`, família `ANIMATION`, 26 episódios editoriais, 1 fonte disponibilizada.
- Mangá: AniList `150193`, família `READING`, distinto da light novel `150194`.
- Relação: adaptação entre os dois registros e franquia compartilhada.
- Metadados: títulos, sinopses, capas, gêneros e equipe provenientes da ficha pública do AniList; o AniList não fornece banner para essas duas entradas, portanto nenhum banner foi inventado.
- Episódio 1: fonte fornecida pelo proprietário do antigo Animes Digital. A validação encontrou bloqueio de incorporação fora do domínio de origem; por isso está registrada honestamente como `EXTERNAL_LINK`, não como embed funcional.
- Capítulo 1: link autorizado do Manga Livre, registrado como `EXTERNAL_LINK`; imagens não foram copiadas.

## Importação

`POST /api/admin/catalog/imports?dryRun=true` simula o documento legado do Explorar e relata criados, preservados e rejeitados. Com `dryRun=false`, a operação insere apenas IDs ausentes, mantém `content_document`, registra execução/itens e pode ser repetida sem duplicação.

## API pública

- `GET /api/v1/works` — paginação, busca e filtros.
- `GET /api/v1/works/{id}` e `/resolve` — ficha pública e resolução por família/slug.
- Temporadas, episódios, edições, volumes, capítulos, relações, equipe, gêneros e franquias ficam sob `/api/v1`.
- Fontes verificadas são consultadas por ID real de episódio/capítulo. Metadado cadastrado não basta para marcar uma unidade disponível.
- Rascunhos, ocultos e arquivados não aparecem na API pública.

## Administração

O painel existente cria toda obra como `DRAFT`. A API `/api/admin/catalog` permite editar metadados, criar temporadas/episódios/edições/capítulos, relacionar obras, publicar, ocultar, arquivar e consultar auditoria. A interface de Catálogo permite busca incluindo rascunhos, revisão de metadados/visibilidade e simulação/aplicação do importador. Todos os endpoints exigem `EDITOR`; exclusão definitiva não foi criada.

## Compatibilidade e pendências deliberadas

As rotas antigas `/api/content` e `/api/catalog` continuam ativas durante a transição. Player real, fontes de vídeo, leitor nativo, páginas de mangá, comentários e notificações completas continuam pertencendo aos Protocolos 06 e 07. O link de vídeo poderá voltar a ser `EMBED` quando o provedor autorizar tecnicamente o novo domínio.

## Validação

- Maven: testes aprovados.
- React: testes e build Vite aprovados; permanece apenas o aviso conhecido de bundle acima de 500 kB.
- Docker: imagens reconstruídas e Flyway aplicado sem perda, com schema v7.
- Navegador: ficha dinâmica exibiu capa, títulos, sinopse, gêneros, episódio, equipe e adaptação; a tentativa real de embed revelou o bloqueio e originou a correção v7.
