# Convenções de API

## Cliente frontend

Todo acesso HTTP passa por `frontend/src/services/api/client.js`.

```js
import { api } from "../services/api";

const home = await api.get("/api/content/home");
const saved = await api.put("/api/me/preferences", values, { signal });
```

O cliente fornece:

- URL base opcional por `VITE_API_BASE_URL` em `frontend/.env.local`;
- cookies de sessão na mesma origem;
- cabeçalho CSRF nas operações de escrita;
- JSON de entrada e saída;
- timeout padrão de 12 segundos;
- cancelamento por `AbortSignal`;
- erros normalizados em `ApiError`.

## Envelope de erro

Erros novos do Spring Boot seguem este contrato:

```json
{
  "code": "RESOURCE_NOT_FOUND",
  "message": "Conteúdo não encontrado.",
  "requestId": "25c19336-48a0-4c8b-88be-9627f7672873",
  "status": 404
}
```

- `code` é estável e próprio para decisões da interface.
- `message` é seguro para apresentação ao usuário.
- `requestId` também é devolvido no cabeçalho `X-Request-ID` e permite localizar uma falha.
- detalhes internos, stack traces e mensagens de banco não são expostos.

## Compatibilidade

Os endpoints de documentos existentes mantêm seus corpos de sucesso sem envelope:

- `GET /api/content`;
- `GET /api/content/{key}`.

O envelope é usado para falhas. Endpoints de domínio existentes podem manter campos adicionais em
erros específicos durante a migração, desde que incluam `code`, `message` e `requestId`.

## Estados de interface

Uma tela que busca dados deve distinguir carregamento, vazio e erro. Neste protocolo o cliente foi
centralizado sem redesenhar os estados visuais existentes; a padronização visual será feita por fluxo
nos protocolos seguintes.
