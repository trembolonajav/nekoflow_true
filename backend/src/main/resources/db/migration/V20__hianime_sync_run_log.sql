-- Itens encontrados em cada varredura. Mantém o histórico legível mesmo quando
-- o candidato é reprocessado ou muda de estado posteriormente.
CREATE TABLE hianime_sync_run_item (
    id BIGSERIAL PRIMARY KEY,
    run_id UUID NOT NULL REFERENCES hianime_sync_run(id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL REFERENCES hianime_sync_candidate(id) ON DELETE CASCADE,
    work_id BIGINT NOT NULL REFERENCES work(id) ON DELETE CASCADE,
    external_anime_id VARCHAR(180) NOT NULL,
    external_episode_id VARCHAR(180) NOT NULL,
    episode_number NUMERIC(12,3) NOT NULL,
    title VARCHAR(300),
    outcome VARCHAR(20) NOT NULL CHECK (outcome IN ('READY','REVIEW','PUBLISHED','FAILED')),
    is_new BOOLEAN NOT NULL DEFAULT TRUE,
    reason VARCHAR(600),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(run_id, candidate_id)
);

CREATE INDEX hianime_sync_run_item_run_idx
    ON hianime_sync_run_item(run_id, created_at, id);
