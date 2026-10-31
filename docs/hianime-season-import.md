# Importação sazonal HiAnime

O arquivo `tools/import_hianime_season_csv.py` combina três fontes sem misturar
suas responsabilidades:

- o CSV define quais obras pertencem às temporadas de 2026;
- o AniList fornece ID, título canônico em romaji, títulos alternativos, capa,
  sinopse e metadados editoriais;
- a API não oficial HiAnime fornece a correspondência de catálogo, os episódios
  publicados e os players externos disponíveis.

O importador compara os títulos normalizados e aplica um limiar mínimo. Um
resultado de busca nunca é aceito apenas por aparecer primeiro. Obras repetidas
no CSV são consolidadas antes da coleta.

## Executar

Com a API `ryanwtf7/hianime-api` disponível na porta 5000:

```powershell
python tools\import_hianime_season_csv.py `
  "C:\caminho\Anime_2026_Temporadas.csv" `
  --api-base http://localhost:5000 `
  --workers 4 `
  --max-episodes 40
```

O resultado é gravado em
`backend/src/main/resources/seed/hianime-catalog.json`. O
`HiAnimeCatalogSeeder` aplica o snapshot de forma idempotente no boot do
backend. Obras sem episódio publicado entram no catálogo; episódios só ficam
reproduzíveis quando ao menos uma fonte válida foi retornada.

## Idiomas

A bandeira do cabeçalho altera somente o idioma da interface e a tradução
editorial solicitada ao backend. Áudio e legenda são preferências separadas.
Nos cards, `CC` informa legenda e o microfone informa áudio. O importador não
declara PT-BR em fontes HiAnime que só oferecem áudio/legenda em inglês.

Os players são `EMBED`: o NekoFlow não hospeda nem retransmite os arquivos. O
provedor externo continua responsável por qualidade, fullscreen, legendas
internas e disponibilidade.
