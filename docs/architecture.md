# Arquitetura do NekoFlow

## Objetivo desta organização

O NekoFlow mantém a identidade visual importada do Claude Design, mas o código de produção não é
mais gerado automaticamente. A interface, a navegação, a comunicação HTTP e as regras do servidor
possuem limites explícitos.

## Camadas

### Frontend

- `frontend/src/app`: inicialização e catálogo central de rotas.
- `frontend/src/components`: componentes compartilhados vindos ou derivados do design.
- `frontend/src/pages`: telas de produção. A indicação `Origem: design/...` registra a referência
  visual, não significa que o arquivo possa ser sobrescrito.
- `frontend/src/services/api`: único ponto para comunicação HTTP, timeout, cancelamento e erros.
- `frontend/src/features`: serviços por fluxo de produto. `library`, `progress` e `history` são o
  único caminho para dados pessoais; `progress/progressSync` é o contrato do player e do leitor.
- `frontend/src/lib`: estado de sessão, progresso e adaptadores mantidos por compatibilidade.
- `frontend/src/ui`: moldura e tokens usados nas telas que não existiam no design original.
- `frontend/src/styles`: estilos globais e ajustes responsivos.
- `frontend/tests`: contratos que não dependem de renderização visual.

As páginas existentes ainda contêm parte da lógica herdada. A extração para `features/` deve ocorrer
por fluxo de produto nos próximos protocolos, sem uma movimentação em massa que arrisque o layout.

### Backend

- Pacotes de domínio (`auth`, `catalog`, `library`, `progress`, `media`, `notification`, `request`, `admin`)
  contêm os casos de uso já implementados. `media` resolve fontes de vídeo autorizadas, manifestos de
  páginas e a importação editorial — ver `docs/protocol-06-real-media.md`. `library` (biblioteca, favoritos, acompanhamento) e
  `progress` (progresso, continuidade, histórico) são a fonte oficial dos dados pessoais — ver
  `docs/protocol-05-library-progress.md`.
- `content` preserva os documentos JSON usados pelas telas legadas.
- `api` define o contrato transversal de erros e o identificador de requisição.
- Flyway é a única forma permitida de alterar o esquema PostgreSQL.

### Infraestrutura

- Nginx serve o bundle e encaminha `/api/` ao Spring Boot.
- O fallback `try_files ... /index.html` permite atualizar diretamente qualquer rota React.
- O PostgreSQL usa o volume nomeado `pgdata`. O Protocolo 01 não remove nem recria esse volume.
- Páginas importadas ficam no volume `media` (escrita pelo backend, leitura pelo Nginx em `/media/`,
  apenas com link assinado). Vídeos e imagens de provedores são carregados direto do CDN deles.

## Dependências entre camadas

```text
app/pages/components -> services/api -> /api -> controllers -> services/repositories -> PostgreSQL
         |                                                        |
         +---------------- design visual                          +-- Flyway
```

Componentes não devem chamar `fetch` diretamente. O backend nunca deve depender dos documentos ou
da estrutura do frontend. As rotas públicas do navegador ficam em `app/routePaths.js`; endpoints da
API permanecem próximos de cada serviço até existir um catálogo de endpoints que traga benefício real.

## Compatibilidade preservada

- `/api/content` e `/api/content/{key}` continuam disponíveis.
- `frontend/src/lib/api.js` reexporta o cliente central para não quebrar módulos existentes.
- `frontend/src/routes.jsx` reexporta o roteador central durante a migração.
- Mocks visuais continuam presentes onde ainda não há implementação real.
