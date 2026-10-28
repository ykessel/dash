import type { MigrationInterface, QueryRunner } from 'typeorm'

export class Identity1793232000000 implements MigrationInterface {
  name = 'Identity1793232000000'

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS citext`)
    await q.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`)
    await q.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email citext NOT NULL UNIQUE,
        email_verified_at timestamptz,
        password_hash text,
        name text NOT NULL,
        avatar_skin smallint NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now()
      )`)
    await q.query(`
      CREATE TABLE oauth_accounts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider text NOT NULL CHECK (provider IN ('google', 'github')),
        provider_user_id text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (provider, provider_user_id)
      )`)
    await q.query(`
      CREATE TABLE auth_tokens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        kind text NOT NULL CHECK (kind IN ('verify_email', 'reset_password', 'magic_link')),
        email citext NOT NULL,
        user_id uuid REFERENCES users(id) ON DELETE CASCADE,
        token_hash text NOT NULL,
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )`)
    await q.query(`CREATE UNIQUE INDEX auth_tokens_token_hash ON auth_tokens (token_hash)`)
    await q.query(`CREATE INDEX auth_tokens_email_kind ON auth_tokens (email, kind)`)
    await q.query(`
      CREATE TABLE refresh_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        family_id uuid NOT NULL,
        token_hash text NOT NULL,
        expires_at timestamptz NOT NULL,
        rotated_at timestamptz,
        revoked_at timestamptz,
        user_agent text NOT NULL DEFAULT '',
        ip text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now()
      )`)
    await q.query(`CREATE UNIQUE INDEX refresh_sessions_token_hash ON refresh_sessions (token_hash)`)
    await q.query(`CREATE INDEX refresh_sessions_family ON refresh_sessions (family_id)`)
    await q.query(`CREATE INDEX refresh_sessions_user ON refresh_sessions (user_id)`)
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE refresh_sessions`)
    await q.query(`DROP TABLE auth_tokens`)
    await q.query(`DROP TABLE oauth_accounts`)
    await q.query(`DROP TABLE users`)
  }
}
