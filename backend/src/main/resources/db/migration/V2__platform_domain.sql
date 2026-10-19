-- Domínio da plataforma: usuários, catálogo, biblioteca, progresso, histórico,
-- notificações, solicitações e publicações.

CREATE TABLE app_user (
    id            BIGSERIAL PRIMARY KEY,
    username      VARCHAR(20)  NOT NULL UNIQUE,
    email         VARCHAR(254) NOT NULL UNIQUE,
    display_name  VARCHAR(60)  NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    role          VARCHAR(16)  NOT NULL DEFAULT 'USER',
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Registro único de cada obra. O id é o id da AniList (estável e já usado em todo o design).
CREATE TABLE work (
    id              BIGINT PRIMARY KEY,
    kind            VARCHAR(10)  NOT NULL,
    title           VARCHAR(300) NOT NULL,
    alt_titles      TEXT         NOT NULL DEFAULT '',
    cover           TEXT,
    banner          TEXT,
    webtoon         BOOLEAN      NOT NULL DEFAULT FALSE,
    year            INT,
    total_units     INT,
    available_units INT,
    airing_status   VARCHAR(40),
    popularity      INT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Um registro de biblioteca por usuário e obra.
CREATE TABLE library_entry (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT      NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    work_id    BIGINT      NOT NULL REFERENCES work (id),
    status     VARCHAR(12) NOT NULL,
    added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, work_id)
);

CREATE TABLE favorite (
    user_id    BIGINT      NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    work_id    BIGINT      NOT NULL REFERENCES work (id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, work_id)
);

-- Acompanhar lançamentos (alertas). Independente de favorito e da biblioteca.
CREATE TABLE work_follow (
    user_id    BIGINT      NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    work_id    BIGINT      NOT NULL REFERENCES work (id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, work_id)
);

-- Última posição útil por unidade (episódio ou capítulo).
CREATE TABLE progress (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT      NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    work_id      BIGINT      NOT NULL REFERENCES work (id),
    unit         INT         NOT NULL,
    position_sec INT,
    duration_sec INT,
    pct          REAL        NOT NULL DEFAULT 0,
    completed    BOOLEAN     NOT NULL DEFAULT FALSE,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, work_id, unit)
);
CREATE INDEX progress_user_recent ON progress (user_id, updated_at DESC);

-- O que aconteceu (aberto, assistido, lido). Não é a posição de retomada.
CREATE TABLE activity (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    work_id     BIGINT      NOT NULL REFERENCES work (id),
    unit        INT         NOT NULL,
    action      VARCHAR(10) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX activity_user_recent ON activity (user_id, occurred_at DESC);

CREATE TABLE notification (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT       NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    category   VARCHAR(8)   NOT NULL,
    icon       VARCHAR(10),
    title      VARCHAR(200) NOT NULL,
    sub        VARCHAR(400),
    href       TEXT,
    cover      TEXT,
    event_key  VARCHAR(120) NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    read_at    TIMESTAMPTZ,
    UNIQUE (user_id, event_key)
);
CREATE INDEX notification_user_recent ON notification (user_id, created_at DESC);

CREATE TABLE content_request (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT       NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    request_kind VARCHAR(20)  NOT NULL,
    media        VARCHAR(10)  NOT NULL,
    title        VARCHAR(300) NOT NULL,
    title_norm   VARCHAR(300) NOT NULL,
    work_id      BIGINT REFERENCES work (id),
    details      TEXT,
    status       VARCHAR(16)  NOT NULL,
    reason       TEXT,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
ALTER SEQUENCE content_request_id_seq RESTART WITH 1043;
CREATE INDEX content_request_user ON content_request (user_id, created_at DESC);
CREATE INDEX content_request_status ON content_request (status, created_at);

-- "Também quero esta obra"
CREATE TABLE request_supporter (
    request_id BIGINT      NOT NULL REFERENCES content_request (id) ON DELETE CASCADE,
    user_id    BIGINT      NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (request_id, user_id)
);

CREATE TABLE request_history (
    id          BIGSERIAL PRIMARY KEY,
    request_id  BIGINT      NOT NULL REFERENCES content_request (id) ON DELETE CASCADE,
    from_status VARCHAR(16),
    to_status   VARCHAR(16) NOT NULL,
    actor_id    BIGINT REFERENCES app_user (id),
    note        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Publicação de episódio/capítulo. Única por obra e unidade (evento idempotente).
CREATE TABLE release_event (
    id           BIGSERIAL PRIMARY KEY,
    work_id      BIGINT      NOT NULL REFERENCES work (id),
    unit         INT         NOT NULL,
    unit_title   VARCHAR(200),
    published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_by BIGINT REFERENCES app_user (id),
    UNIQUE (work_id, unit)
);

CREATE TABLE user_preferences (
    user_id BIGINT PRIMARY KEY REFERENCES app_user (id) ON DELETE CASCADE,
    data    JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE admin_audit (
    id         BIGSERIAL PRIMARY KEY,
    actor_id   BIGINT       REFERENCES app_user (id),
    action     VARCHAR(40)  NOT NULL,
    target     VARCHAR(120) NOT NULL,
    detail     TEXT,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
