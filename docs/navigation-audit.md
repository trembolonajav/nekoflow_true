# Auditoria de navegação — Protocolo 02

Estado auditado em 19/10/2026, no início da branch
`feat/protocolo-02-navegacao-real`, a partir do Protocolo 01 concluído.

## Diagnóstico inicial

- O roteador possuía 20 caminhos, contando aliases e a rota `*`, mas não havia `/animes`,
  `/criar-conta`, `/animes/:slug` ou `/leituras/:slug`.
- Foram encontrados 20 `href="#"`. Três pertencem à rota interna de estudo
  `/estudos/home-direcoes`; os outros 17 apareciam em Footer, Calendário, Entrar e nas duas
  fichas de Solo Leveling.
- Home, Header e Leituras possuíam três implementações diferentes para resolver uma obra.
  Somente os IDs `151807` e `105398` abriam fichas; as demais obras voltavam à pesquisa.
- Explorar enviava somente esses dois IDs a páginas reais e produzia `#` para todos os outros
  resultados.
- O backend repetia a mesma exceção em `Work.href()` e vinculava player/leitor diretamente a
  esses dois IDs.
- `/obra` e `/obra-leitura` eram páginas fixas. Player e Leitor também eram experiências
  demonstrativas específicas desses registros.
- O Header começava corretamente como visitante quando não havia sessão. A conta Marina existe
  como dado de desenvolvimento, mas não é tratada como sessão autenticada por padrão.
- A autenticação, biblioteca, notificações e solicitações já possuem endpoints reais no estado
  atual do repositório. Portanto, elas devem ser preservadas, não substituídas por mocks.

## Classificação das ações

| Área | Estado inicial | Classificação e correção prevista |
| --- | --- | --- |
| Header | Animes em `#`; busca devolvia pesquisa para quase todas as obras | Navegação interna; usar catálogo e destino canônico |
| Home | Cards voltavam à busca; CTA prometia “Assistir” | Navegação interna; abrir ficha e só retomar mídia quando houver progresso real |
| Explorar | Quase todos os cards em `#` | Navegação interna; toda obra cadastrada recebe ficha canônica |
| Leituras | Cards voltavam à busca | Navegação interna; abrir ficha canônica de leitura |
| Calendário | Títulos em `#`; “Assistir/Ler” baseado apenas no horário | Demonstração editorial; abrir ficha e identificar disponibilidade |
| Conta e sininho | Reais somente com sessão | Ação autenticada; visitante deve ser enviado ao login preservando intenção |
| Footer | Sete links em `#` | Rotas existentes serão ligadas; páginas institucionais ficarão explicitamente indisponíveis |
| Entrar | Termos, privacidade e ajuda em `#` | Funcionalidade pendente; remover aparência de link ativo |
| Obra/ObraLeitura | Recomendações em `#`; IDs fixos | Usar destinos do catálogo; itens sem identidade ficam não interativos |
| Player/Leitor | Experiência visual específica de Solo Leveling | Manter somente nas unidades cadastradas e marcar como demonstração de interface |
| HomeDirecoes | Três links em `#` | Estudo visual interno, fora da navegação pública; mantido intencionalmente |

## Fonte de verdade disponível

O PostgreSQL já possui a tabela `work`, abastecida pelo `CatalogSeeder` com os dados existentes
de Explorar, Home, Leituras, Calendário e das duas fichas completas. O ID da AniList é a
identidade estável. O título, títulos alternativos, tipo, capa, banner, ano, estado e quantidade
de unidades são os metadados atualmente disponíveis.

O Protocolo 02 utilizará esse catálogo único. Não será criado um segundo cadastro e não serão
inventadas sinopses, episódios, capítulos ou fontes de mídia.
