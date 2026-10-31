-- Retrato completo da ficha do AniList (personagens, equipe, relações, recomendações, tags).
-- As fichas do design são montadas a partir dele e do catálogo; quando o AniList está fora
-- do ar, a ficha continua com o que o catálogo tem e a sincronização tenta de novo depois.
CREATE TABLE work_anilist_snapshot (
    work_id BIGINT PRIMARY KEY REFERENCES work(id) ON DELETE CASCADE,
    anilist_id BIGINT NOT NULL,
    payload JSONB NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

