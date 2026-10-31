-- Protocolo 03: evolução aditiva da identidade e sessões. BIGINT permanece como
-- chave relacional para preservar todas as FKs existentes; public_id é a identidade externa.
ALTER TABLE app_user ADD COLUMN public_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE app_user ADD CONSTRAINT app_user_public_id_uk UNIQUE (public_id);
ALTER TABLE app_user ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE app_user ADD COLUMN email_verified_at TIMESTAMPTZ;
ALTER TABLE app_user ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE app_user ADD COLUMN failed_login_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE app_user ADD COLUMN locked_until TIMESTAMPTZ;
UPDATE app_user SET email_verified_at = created_at WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX app_user_username_norm_uk ON app_user (lower(username));
CREATE UNIQUE INDEX app_user_email_norm_uk ON app_user (lower(email));

CREATE TABLE user_profile (
    user_id BIGINT PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
    avatar_url TEXT,
    banner_url TEXT,
    biography VARCHAR(500),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO user_profile(user_id) SELECT id FROM app_user ON CONFLICT DO NOTHING;

CREATE TABLE user_role (
    user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    role VARCHAR(16) NOT NULL,
    PRIMARY KEY(user_id, role)
);
INSERT INTO user_role(user_id, role) SELECT id, role FROM app_user ON CONFLICT DO NOTHING;

CREATE TABLE email_verification_token (
    id UUID PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX email_verification_user_idx ON email_verification_token(user_id, created_at DESC);

CREATE TABLE password_reset_token (
    id UUID PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX password_reset_user_idx ON password_reset_token(user_id, created_at DESC);

CREATE TABLE security_audit_event (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES app_user(id) ON DELETE SET NULL,
    event_type VARCHAR(40) NOT NULL,
    remote_address VARCHAR(64),
    detail VARCHAR(300),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX security_audit_user_idx ON security_audit_event(user_id, created_at DESC);

CREATE TABLE user_identity (
    id UUID PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    provider VARCHAR(40) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(provider, subject)
);

-- Estrutura oficial compatível com Spring Session JDBC/PostgreSQL.
CREATE TABLE SPRING_SESSION (
    PRIMARY_ID CHAR(36) NOT NULL,
    SESSION_ID CHAR(36) NOT NULL,
    CREATION_TIME BIGINT NOT NULL,
    LAST_ACCESS_TIME BIGINT NOT NULL,
    MAX_INACTIVE_INTERVAL INT NOT NULL,
    EXPIRY_TIME BIGINT NOT NULL,
    PRINCIPAL_NAME VARCHAR(100),
    CONSTRAINT SPRING_SESSION_PK PRIMARY KEY (PRIMARY_ID)
);
CREATE UNIQUE INDEX SPRING_SESSION_IX1 ON SPRING_SESSION (SESSION_ID);
CREATE INDEX SPRING_SESSION_IX2 ON SPRING_SESSION (EXPIRY_TIME);
CREATE INDEX SPRING_SESSION_IX3 ON SPRING_SESSION (PRINCIPAL_NAME);
CREATE TABLE SPRING_SESSION_ATTRIBUTES (
    SESSION_PRIMARY_ID CHAR(36) NOT NULL,
    ATTRIBUTE_NAME VARCHAR(200) NOT NULL,
    ATTRIBUTE_BYTES BYTEA NOT NULL,
    CONSTRAINT SPRING_SESSION_ATTRIBUTES_PK PRIMARY KEY (SESSION_PRIMARY_ID, ATTRIBUTE_NAME),
    CONSTRAINT SPRING_SESSION_ATTRIBUTES_FK FOREIGN KEY (SESSION_PRIMARY_ID)
      REFERENCES SPRING_SESSION(PRIMARY_ID) ON DELETE CASCADE
);
