-- Saúde dos servidores medida pelo uso real do player (iframes não dizem se o vídeo tocou).
-- Sinal: a pessoa abriu um servidor e trocou para outro da MESMA versão (dublado → dublado);
-- trocar de versão é escolha de idioma, não falha. Mais os reports "vídeo não carrega".
-- Dois níveis: host (ordena os servidores) e link (embed quebrado vai para o fim e vira pendência).

CREATE OR REPLACE FUNCTION nk_host(url text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
    SELECT lower(substring(url from '^[a-zA-Z][a-zA-Z0-9+.-]*://(?:www\.)?([^/:?#]+)'))
$$;

CREATE TABLE server_health (
    host        varchar(255) PRIMARY KEY,
    sessions    int NOT NULL DEFAULT 0,
    away        int NOT NULL DEFAULT 0,
    reports     int NOT NULL DEFAULT 0,
    status      varchar(8) NOT NULL CHECK (status IN ('good', 'warn', 'bad', 'unknown')),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE source_health (
    episode_source_id  uuid PRIMARY KEY REFERENCES episode_source(id) ON DELETE CASCADE,
    sessions           int NOT NULL DEFAULT 0,
    away               int NOT NULL DEFAULT 0,
    reports            int NOT NULL DEFAULT 0,
    suspect            boolean NOT NULL DEFAULT false,
    last_evidence_at   timestamptz,
    updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX source_health_suspect_idx ON source_health(suspect) WHERE suspect;
