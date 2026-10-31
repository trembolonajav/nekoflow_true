# Sincronização contínua HiAnime

## Objetivo

Após o snapshot sazonal criar e validar os vínculos iniciais, o NekoFlow consulta o HiAnime a cada
15 minutos e importa somente episódios ainda desconhecidos. A interface administrativa nunca chama
a origem diretamente; ela controla e observa o worker pelo backend.

## Componentes

- `HiAnime`: origem externa consultada pelos mesmos endpoints HTML/AJAX usados pelo site.
- `backend`: agenda, descobre, valida, publica e expõe os endpoints administrativos; o navegador
  nunca acessa a origem diretamente.
- `postgres`: mantém trava, configurações por obra, candidatos, histórico e vínculos idempotentes.

Configuração principal:

| Variável | Padrão | Finalidade |
|---|---:|---|
| `HIANIME_SYNC_ENABLED` | `true` | liga o worker e a execução manual |
| `HIANIME_ORIGIN` | `https://hianime.at` | origem externa consultada pelo backend |
| `HIANIME_SYNC_INTERVAL_MS` | `900000` | intervalo de 15 minutos |
| `HIANIME_SYNC_INITIAL_DELAY_MS` | `90000` | espera inicial após subir o backend |
| `HIANIME_SYNC_RECENT_PAGES` | `2` | páginas de atualizações consultadas |
| `HIANIME_API_TIMEOUT_SECONDS` | `20` | timeout por requisição |

## Regras de segurança e integridade

1. Apenas obras com identificador `HIANIME` e monitoramento habilitado são consideradas.
2. A carga inicial habilita publicação automática somente quando já existe uma fonte HiAnime ativa;
   vínculos em quarentena permanecem fora do worker.
3. Episódios são idempotentes pelo par anime/episódio externo e pela posição dentro da temporada.
4. Somente URLs HTTPS em hosts já autorizados no `media_provider` podem ser publicadas.
5. Host novo, nenhuma fonte ou erro de importação exige revisão humana.
6. `release_event` continua responsável por calendário e notificações sem duplicidade.
7. Uma trava com validade no PostgreSQL impede execuções concorrentes em vários backends.

## Painel

A aba `/admin?aba=sync` exige papel `EDITOR` e contém:

- indicadores de saúde, obras monitoradas, pendências e publicações do dia;
- confirmação da última consulta, previsão da próxima e mensagem explícita quando não há novidades;
- caixa de entrada com aprovação e descarte;
- configuração de monitoramento e publicação automática por obra;
- histórico de execuções agendadas e manuais;
- detalhes por execução com anime, episódio e resultado (publicado, revisão ou falha);
- botão **Buscar atualizações agora**.

O painel atualiza os dados operacionais a cada dez segundos enquanto está aberto. Isso não altera o
intervalo do worker.

## Endpoints

```text
GET  /api/admin/sync/dashboard
POST /api/admin/sync/runs
GET  /api/admin/sync/runs
GET  /api/admin/sync/candidates?status=
POST /api/admin/sync/candidates/{id}/approve
POST /api/admin/sync/candidates/{id}/ignore
GET  /api/admin/sync/works
PUT  /api/admin/sync/works/{workId}/settings
```

## Estados

- `READY`: possui ao menos uma fonte em host autorizado.
- `REVIEW`: fonte ausente ou host ainda não autorizado.
- `PUBLISHED`: episódio e fontes foram integrados e o evento de publicação foi criado.
- `FAILED`: a descoberta ocorreu, mas a importação falhou.
- `IGNORED`: decisão editorial de não publicar o candidato.
