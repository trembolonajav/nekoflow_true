# Referência visual — Protocolo 01

Verificação executada em 19/10/2026 contra o ambiente Docker local.

## Viewports

- Desktop: 1280 px de largura.
- Celular: 390 × 844 px.

## Rotas verificadas

| Rota | Desktop | Celular | Imagens quebradas | Erro do runtime |
|---|---|---|---:|---:|
| `/` | sem overflow | sem overflow | 0 | 0 |
| `/explorar` | sem overflow | sem overflow | 0 | 0 |
| `/leituras` | sem overflow | sem overflow | 0 | 0 |
| `/calendario` | sem overflow | sem overflow | 0 | 0 |
| `/obra` | sem overflow | sem overflow | 0 | 0 |
| `/obra-leitura` | sem overflow | sem overflow | 0 | 0 |
| `/leitor?cap=111` | sem overflow | comportamento móvel já coberto pelo design | 0 | 0 |
| `/player?ep=16` | sem overflow | sem overflow | 0 | 0 |
| `/entrar` | sem overflow | sem overflow | 0 | 0 |
| rota desconhecida | página 404 | página 404 | 0 | 0 |

Também foram confirmados:

- ausência de mensagens de erro ou aviso no console;
- refresh direto de `/obra-leitura?aba=sobre` preservando a rota;
- fontes, cores, hierarquia e conteúdo das telas existentes sem alteração intencional;
- página 404 nova utilizando os tokens visuais existentes.

Este documento registra a checagem reproduzível. Capturas binárias não são versionadas para evitar
inflar o repositório; uma revisão deve repetir os mesmos viewports e rotas ao alterar JSX ou CSS.

## Verificação do Protocolo 02

Em 19/10/2026, desktop e o viewport 390 × 844 foram novamente verificados no Docker em `/`,
`/animes`, `/explorar?q=coração`, fichas básica e completa, rota antiga, obra inválida, área
privada e player demonstrativo. A pesquisa “solo leveling” distinguiu anime e manhwa.

Não foram observadas imagens quebradas, overflow horizontal, erros visíveis do runtime ou mudança
intencional na identidade visual. As fichas básicas reutilizam os componentes e tokens existentes.
