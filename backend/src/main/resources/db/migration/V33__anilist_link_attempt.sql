-- Vínculo automático de leituras ao AniList (só correspondência segura). Guarda cada tentativa
-- para não repetir a busca e para revisar as ambíguas (mais de uma obra do AniList com o mesmo nome).
CREATE TABLE anilist_link_attempt (
    work_id     bigint PRIMARY KEY REFERENCES work(id) ON DELETE CASCADE,
    status      varchar(10) NOT NULL CHECK (status IN ('MATCHED', 'AMBIGUOUS', 'NONE', 'REJECTED')),
    anilist_id  bigint,
    query       varchar(300),
    candidates  text,
    reason      varchar(300),
    tried_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX anilist_link_attempt_status_idx ON anilist_link_attempt(status);
