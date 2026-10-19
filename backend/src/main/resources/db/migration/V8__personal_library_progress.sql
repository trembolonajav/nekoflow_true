-- Protocolo 05: progresso pessoal ligado às unidades reais do catálogo (episódio,
-- capítulo + edição), com versão por registro, sessão/sequência e deduplicação de eventos.
-- Migração apenas aditiva: library_entry, favorite e work_follow (V2) continuam sendo a
-- biblioteca; as tabelas antigas progress/activity são preservadas, mas deixam de ser lidas.

-- Fontes declaram se informam progresso verificável (player/leitor com telemetria real).
-- Links externos e embeds sem API continuam false: só aceitam conclusão manual.
ALTER TABLE episode_source ADD COLUMN reports_progress BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE chapter_source ADD COLUMN reports_progress BOOLEAN NOT NULL DEFAULT FALSE;

-- Registros pessoais não podem ser apagados em cascata por uma exclusão no catálogo
-- (o catálogo arquiva/oculta obras; a exclusão física fica bloqueada por RESTRICT).
CREATE TABLE episode_progress (
    id               BIGSERIAL PRIMARY KEY,
    user_id          BIGINT      NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    episode_id       UUID        NOT NULL REFERENCES episode (id) ON DELETE RESTRICT,
    position_ms      BIGINT      NOT NULL DEFAULT 0 CHECK (position_ms >= 0),
    duration_ms      BIGINT      CHECK (duration_ms > 0),
    watched_ms       BIGINT      NOT NULL DEFAULT 0 CHECK (watched_ms >= 0),
    completed_at     TIMESTAMPTZ,
    completion_source VARCHAR(12) CHECK (completion_source IN ('PLAYBACK', 'MANUAL')),
    version          BIGINT      NOT NULL CHECK (version > 0),
    last_session_id  UUID,
    last_sequence    BIGINT,
    started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, episode_id),
    CHECK ((completed_at IS NULL) = (completion_source IS NULL))
);
CREATE INDEX episode_progress_recent_idx ON episode_progress (user_id, last_activity_at DESC);

ALTER TABLE chapter ADD CONSTRAINT chapter_id_edition_uk UNIQUE (id, edition_id);

CREATE TABLE chapter_progress (
    id               BIGSERIAL PRIMARY KEY,
    user_id          BIGINT       NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    chapter_id       UUID         NOT NULL,
    edition_id       UUID         NOT NULL,
    -- referência estável de retomada: página (paginado) ou segmento + deslocamento (vertical)
    page_index       INT          CHECK (page_index >= 0),
    segment_key      VARCHAR(160),
    segment_offset   NUMERIC(7, 6) CHECK (segment_offset BETWEEN 0 AND 1),
    -- só para a barra visual; a retomada usa página/segmento
    percent_complete NUMERIC(6, 3) NOT NULL DEFAULT 0 CHECK (percent_complete BETWEEN 0 AND 100),
    completed_at     TIMESTAMPTZ,
    completion_source VARCHAR(12) CHECK (completion_source IN ('READER', 'MANUAL')),
    version          BIGINT       NOT NULL CHECK (version > 0),
    last_session_id  UUID,
    last_sequence    BIGINT,
    started_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_activity_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    FOREIGN KEY (chapter_id, edition_id) REFERENCES chapter (id, edition_id) ON DELETE RESTRICT,
    UNIQUE (user_id, chapter_id, edition_id),
    CHECK ((completed_at IS NULL) = (completion_source IS NULL))
);
CREATE INDEX chapter_progress_recent_idx ON chapter_progress (user_id, last_activity_at DESC);

-- Eventos aceitos (idempotência de reenvios e auditoria de sincronização).
CREATE TABLE progress_sync_event (
    user_id          BIGINT      NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    event_id         UUID        NOT NULL,
    media_type       VARCHAR(8)  NOT NULL CHECK (media_type IN ('EPISODE', 'CHAPTER')),
    target_id        UUID        NOT NULL,
    session_id       UUID        NOT NULL,
    sequence         BIGINT      NOT NULL CHECK (sequence >= 0),
    accepted_version BIGINT      NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, event_id)
);
CREATE INDEX progress_sync_event_created_idx ON progress_sync_event (created_at);

-- Histórico: linha do tempo de atividades relevantes (não é a posição de retomada).
CREATE TABLE activity_history (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT      NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    work_id       BIGINT      NOT NULL REFERENCES work (id) ON DELETE RESTRICT,
    episode_id    UUID        REFERENCES episode (id) ON DELETE RESTRICT,
    chapter_id    UUID        REFERENCES chapter (id) ON DELETE RESTRICT,
    edition_id    UUID        REFERENCES work_edition (id) ON DELETE RESTRICT,
    activity_type VARCHAR(20) NOT NULL
        CHECK (activity_type IN ('STARTED', 'RESUMED', 'COMPLETED', 'MANUAL_COMPLETED', 'REOPENED')),
    source        VARCHAR(10) NOT NULL CHECK (source IN ('PLAYER', 'READER', 'MANUAL')),
    session_id    UUID,
    occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((episode_id IS NOT NULL)::int + (chapter_id IS NOT NULL)::int = 1)
);
CREATE INDEX activity_history_user_recent_idx ON activity_history (user_id, occurred_at DESC);
CREATE INDEX activity_history_user_work_idx ON activity_history (user_id, work_id, occurred_at DESC);
-- "Retomado" no máximo uma vez por sessão de reprodução/leitura.
CREATE UNIQUE INDEX activity_history_resumed_once_uk ON activity_history (user_id, session_id, activity_type)
    WHERE activity_type IN ('STARTED', 'RESUMED') AND session_id IS NOT NULL;

-- Situações aceitas na biblioteca (os valores já usados pela aplicação).
ALTER TABLE library_entry ADD CONSTRAINT library_entry_status_ck
    CHECK (status IN ('andamento', 'planejado', 'concluido', 'pausado', 'abandonado'));
