CREATE TABLE content_document (
    key        VARCHAR(64) PRIMARY KEY,
    payload    JSONB       NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
