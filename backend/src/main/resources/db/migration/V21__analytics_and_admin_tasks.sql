-- Painel administrativo (Admin.dc.html): presença, eventos de audiência e pendências.
-- Com iframe não há tempo de vídeo: o "tempo com player" é o batimento com a aba visível.

CREATE TABLE analytics_session (
    id            uuid PRIMARY KEY,
    user_id       bigint REFERENCES app_user(id) ON DELETE SET NULL,
    state         varchar(16)  NOT NULL DEFAULT 'browse',   -- browse | player | read
    path          varchar(300),
    work_id       bigint,
    episode_id    uuid,
    chapter_id    uuid,
    device        varchar(160),
    started_at    timestamptz  NOT NULL DEFAULT now(),
    last_seen_at  timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX analytics_session_seen_idx ON analytics_session (last_seen_at);
CREATE INDEX analytics_session_user_idx ON analytics_session (user_id, last_seen_at);

CREATE TABLE analytics_event (
    id           bigserial PRIMARY KEY,
    session_id   uuid        NOT NULL,
    user_id      bigint,
    type         varchar(32) NOT NULL,
    work_id      bigint,
    episode_id   uuid,
    chapter_id   uuid,
    data         jsonb       NOT NULL DEFAULT '{}'::jsonb,
    occurred_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analytics_event_time_idx ON analytics_event (occurred_at);
CREATE INDEX analytics_event_type_time_idx ON analytics_event (type, occurred_at);
CREATE INDEX analytics_event_work_idx ON analytics_event (work_id, type, occurred_at);
CREATE INDEX analytics_event_user_idx ON analytics_event (user_id, occurred_at);

-- Tarefas manuais e o estado das pendências automáticas (resolvida/ignorada) pela chave.
CREATE TABLE admin_task (
    id           bigserial PRIMARY KEY,
    task_key     varchar(200) UNIQUE,
    origin       varchar(10)  NOT NULL DEFAULT 'manual',   -- manual | auto
    priority     varchar(8)   NOT NULL DEFAULT 'low',      -- crit | med | low
    kind         varchar(40)  NOT NULL DEFAULT 'Manual',
    title        varchar(300) NOT NULL,
    detail       varchar(600),
    status       varchar(16)  NOT NULL DEFAULT 'open',     -- open | resolved
    created_by   bigint REFERENCES app_user(id) ON DELETE SET NULL,
    created_at   timestamptz  NOT NULL DEFAULT now(),
    resolved_by  bigint REFERENCES app_user(id) ON DELETE SET NULL,
    resolved_at  timestamptz
);
