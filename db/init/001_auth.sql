-- Auth tables owned exclusively by the web container (Auth.js adapter connection).
-- The Python backend must never write these tables.
-- Domain tables live under Alembic migrations and reference users(id).

CREATE TABLE IF NOT EXISTS users (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    email         citext      NOT NULL UNIQUE,
    name          text,
    image         text,
    email_verified timestamptz,
    password_hash text        NOT NULL,
    role          text        NOT NULL DEFAULT 'learner'
                              CHECK (role IN ('learner', 'librarian', 'admin')),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Adapter-compatible OAuth tables. Unused while only the Credentials provider is
-- enabled, but present so an OAuth provider can be added without a schema break.
CREATE TABLE IF NOT EXISTS accounts (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type                text        NOT NULL,
    provider            text        NOT NULL,
    provider_account_id text        NOT NULL,
    refresh_token       text,
    access_token        text,
    expires_at          bigint,
    id_token            text,
    scope               text,
    session_state       text,
    token_type          text,
    UNIQUE (provider, provider_account_id)
);

CREATE TABLE IF NOT EXISTS verification_token (
    identifier text        NOT NULL,
    token      text        NOT NULL,
    expires    timestamptz NOT NULL,
    PRIMARY KEY (identifier, token)
);

-- Reusable updated_at trigger for later domain tables.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
