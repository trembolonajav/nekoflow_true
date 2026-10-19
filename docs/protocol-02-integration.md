# Protocolo 02 — integração da navegação real

## Contrato de destinos

O PostgreSQL (`work`) é a fonte única de identidade das obras. O ID permanece estável e compõe
o slug para impedir colisões. Anime e leitura com o mesmo título recebem endereços diferentes:

- `/animes/solo-leveling-151807`
- `/leituras/solo-leveling-105398`

Java (`Work.href()`) e React (`features/catalog/workNavigation.js`) seguem o mesmo contrato.
Home, Header, Explorar, Leituras, Calendário e recomendações utilizam esse resolvedor.

## Rotas públicas

| Rota              | Comportamento                                                            |
| ----------------- | ------------------------------------------------------------------------ |
| `/`               | Home; cards e CTAs abrem a obra correta                                  |
| `/animes`         | Catálogo único filtrado para animes e filmes                             |
| `/leituras`       | Hub editorial de mangás, manhwas e webtoons                              |
| `/explorar`       | Catálogo unificado; busca e filtros permanecem na URL                    |
| `/calendario`     | Agenda editorial; títulos abrem fichas reais                             |
| `/animes/:slug`   | Ficha completa quando existente ou ficha básica com metadados reais      |
| `/leituras/:slug` | Ficha completa quando existente ou ficha básica com metadados reais      |
| `/entrar`         | Login; preserva o destino privado solicitado                             |
| `/criar-conta`    | Compatibilidade explícita com o modo de cadastro da tela de autenticação |

Rotas privadas: `/biblioteca`, `/historico`, `/conta`, `/configuracoes`, `/solicitacoes` e
`/notificacoes`. Visitantes são enviados ao login sem receber dados fictícios de Marina.

## Compatibilidade

- `/obra` → `/animes/solo-leveling-151807`
- `/obra-leitura` → `/leituras/solo-leveling-105398`
- Query strings antigas, como `?aba=sobre`, são preservadas.
- URLs de obra inválidas mostram “Obra não encontrada”; URLs fora do roteador mostram a 404.

## Busca e filtros

A busca do Header utiliza o catálogo completo e títulos alternativos. Resultados iguais de mídias
diferentes permanecem separados. `Enter` sem selecionar uma sugestão abre
`/explorar?q=...`; setas selecionam uma sugestão e `Escape` fecha o painel.

Explorar normaliza acentos e mantém na URL: mídia, texto, gêneros, temas, situação, origem,
década, nota, formato vertical, faixa de episódios e ordenação.

## Estados honestos

- Home não oferece “Assistir” para visitantes quando não existe progresso real; abre a ficha.
- Calendário não interpreta horário passado como mídia disponível; oferece “Ver obra”.
- Player e Leitor continuam como demonstrações visuais específicas e exibem essa condição.
- Fichas básicas mostram somente metadados existentes e informam quando faltam detalhes.
- Páginas institucionais ainda inexistentes não se apresentam como links funcionais.

## Preparação para próximos protocolos

O contrato aceita obras cadastradas pela equipe e já expõe resolução por slug na API. Um protocolo
de catálogo pode adicionar sinopse, relações e unidades sem refazer os links. A autenticação atual
já protege áreas pessoais; recuperação de senha, e-mail e OAuth continuam pendentes.
