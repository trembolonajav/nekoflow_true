-- Camada de identidade: cada fonte deixa de criar a sua própria obra. Duplicatas são fundidas
-- na obra canônica; a obra antiga fica oculta apontando para ela (nada de usuário é apagado).

ALTER TABLE work ADD COLUMN merged_into_id bigint REFERENCES work(id);
CREATE INDEX work_merged_into_idx ON work(merged_into_id) WHERE merged_into_id IS NOT NULL;

-- Histórico de cada fusão: quem, quando, o plano aplicado e o que foi movido.
CREATE TABLE work_merge (
    id              bigserial PRIMARY KEY,
    target_work_id  bigint NOT NULL REFERENCES work(id),
    source_work_id  bigint NOT NULL REFERENCES work(id),
    mode            varchar(10) NOT NULL CHECK (mode IN ('FULL', 'PARTIAL')),
    plan            text NOT NULL,
    summary         text NOT NULL,
    merged_by       bigint REFERENCES app_user(id) ON DELETE SET NULL,
    merged_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX work_merge_target_idx ON work_merge(target_work_id);

-- Episódio/capítulo da obra antiga que passou a valer como outro (links antigos continuam abrindo).
CREATE TABLE merged_unit (
    old_id      uuid PRIMARY KEY,
    new_id      uuid NOT NULL,
    unit_type   varchar(10) NOT NULL CHECK (unit_type IN ('EPISODE', 'CHAPTER')),
    merge_id    bigint NOT NULL REFERENCES work_merge(id),
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- "Não são a mesma obra": o par não volta para a fila de revisão.
CREATE TABLE work_identity_decision (
    low_work_id   bigint NOT NULL REFERENCES work(id),
    high_work_id  bigint NOT NULL REFERENCES work(id),
    decision      varchar(10) NOT NULL CHECK (decision IN ('DISTINCT')),
    decided_by    bigint REFERENCES app_user(id) ON DELETE SET NULL,
    decided_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (low_work_id, high_work_id),
    CHECK (low_work_id < high_work_id)
);
