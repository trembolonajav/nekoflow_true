-- Sincronização contínua HiAnime. Descoberta e publicação são separadas para que
-- toda decisão permaneça idempotente, revisável e auditável.
CREATE TABLE hianime_sync_run (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trigger_type VARCHAR(16) NOT NULL CHECK (trigger_type IN ('SCHEDULED', 'MANUAL')),
    status VARCHAR(16) NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED')),
    actor_id BIGINT REFERENCES app_user(id),
    checked_works INT NOT NULL DEFAULT 0,
    discovered_count INT NOT NULL DEFAULT 0,
    published_count INT NOT NULL DEFAULT 0,
    review_count INT NOT NULL DEFAULT 0,
    error_count INT NOT NULL DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX hianime_sync_run_recent_idx ON hianime_sync_run(created_at DESC);

CREATE TABLE hianime_sync_work (
    work_id BIGINT PRIMARY KEY REFERENCES work(id) ON DELETE CASCADE,
    season_id UUID REFERENCES season(id) ON DELETE SET NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    auto_publish BOOLEAN NOT NULL DEFAULT FALSE,
    interval_minutes INT NOT NULL DEFAULT 15 CHECK (interval_minutes BETWEEN 5 AND 1440),
    last_checked_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    last_error TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Somente obras que já possuem mídia HiAnime ativa foram validadas pelo seeder.
-- Associações colocadas em quarentena não entram em publicação automática.
INSERT INTO hianime_sync_work(work_id, season_id, enabled, auto_publish)
SELECT x.work_id,
       (SELECT s.id FROM season s WHERE s.work_id=x.work_id ORDER BY s.sort_position LIMIT 1),
       TRUE, TRUE
FROM external_identifier x
WHERE x.provider='HIANIME'
  AND EXISTS (
      SELECT 1 FROM season s JOIN episode e ON e.season_id=s.id
      JOIN episode_source es ON es.episode_id=e.id
      JOIN media_provider mp ON mp.id=es.provider_id
      WHERE s.work_id=x.work_id AND es.enabled AND mp.code='HIANIME_API_EMBED'
  )
ON CONFLICT (work_id) DO NOTHING;

CREATE TABLE hianime_sync_candidate (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_id BIGINT NOT NULL REFERENCES work(id) ON DELETE CASCADE,
    season_id UUID NOT NULL REFERENCES season(id) ON DELETE CASCADE,
    external_anime_id VARCHAR(180) NOT NULL,
    external_episode_id VARCHAR(180) NOT NULL,
    episode_number NUMERIC(12,3) NOT NULL,
    title VARCHAR(300),
    payload JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(20) NOT NULL CHECK (status IN ('READY', 'REVIEW', 'PUBLISHED', 'IGNORED', 'FAILED')),
    confidence INT NOT NULL DEFAULT 100 CHECK (confidence BETWEEN 0 AND 100),
    reason VARCHAR(80),
    discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at TIMESTAMPTZ,
    decided_by BIGINT REFERENCES app_user(id),
    UNIQUE(work_id, external_anime_id, external_episode_id)
);

CREATE INDEX hianime_sync_candidate_queue_idx
    ON hianime_sync_candidate(status, discovered_at DESC);

CREATE TABLE hianime_episode_binding (
    episode_id UUID PRIMARY KEY REFERENCES episode(id) ON DELETE CASCADE,
    work_id BIGINT NOT NULL REFERENCES work(id) ON DELETE CASCADE,
    external_anime_id VARCHAR(180) NOT NULL,
    external_episode_id VARCHAR(180) NOT NULL,
    payload_hash VARCHAR(64),
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(external_anime_id, external_episode_id)
);

CREATE TABLE hianime_provider_health (
    provider VARCHAR(40) PRIMARY KEY,
    status VARCHAR(16) NOT NULL CHECK (status IN ('HEALTHY', 'DEGRADED', 'DOWN', 'UNKNOWN')),
    latency_ms INT,
    message TEXT,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO hianime_provider_health(provider,status,message)
VALUES ('HIANIME','UNKNOWN','Ainda não verificado')
ON CONFLICT (provider) DO NOTHING;

CREATE TABLE hianime_sync_lock (
    name VARCHAR(40) PRIMARY KEY,
    owner VARCHAR(80),
    locked_until TIMESTAMPTZ
);

INSERT INTO hianime_sync_lock(name) VALUES ('HIANIME_RECENT') ON CONFLICT DO NOTHING;
