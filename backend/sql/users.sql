CREATE TABLE IF NOT EXISTS users (
    user_id       SERIAL PRIMARY KEY,
    username      VARCHAR(50) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          VARCHAR(20) NOT NULL DEFAULT 'analyst',
    -- Email of the user's Google account, for "Sign in with Google" (SSO).
    -- A Google login is only allowed when its verified email matches a row
    -- here, so this column doubles as the SSO allowlist. NULL = no Google login.
    email         VARCHAR(255) UNIQUE,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMP DEFAULT NOW()
);

-- Migration for an existing table:
--   ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;
