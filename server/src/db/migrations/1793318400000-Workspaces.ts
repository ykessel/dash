import type { MigrationInterface, QueryRunner } from 'typeorm'

const TEAMS = `('Product', 'Design', 'Engineering', 'Marketing')`

export class Workspaces1793318400000 implements MigrationInterface {
  name = 'Workspaces1793318400000'

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE workspaces (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        slug text NOT NULL UNIQUE,
        created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`)
    await q.query(`
      CREATE TABLE memberships (
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
        team text NOT NULL DEFAULT 'Product' CHECK (team IN ${TEAMS}),
        title text NOT NULL DEFAULT '',
        city text NOT NULL DEFAULT '',
        tz text NOT NULL DEFAULT 'UTC',
        capacity smallint NOT NULL DEFAULT 32 CHECK (capacity BETWEEN 1 AND 80),
        presence text NOT NULL DEFAULT 'away' CHECK (presence IN ('online', 'focus', 'meeting', 'away')),
        presence_note text,
        joined_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (workspace_id, user_id)
      )`)
    await q.query(`CREATE INDEX memberships_user ON memberships (user_id)`)
    await q.query(`
      CREATE TABLE invitations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        email citext NOT NULL,
        role text NOT NULL CHECK (role IN ('admin', 'member')),
        team text NOT NULL CHECK (team IN ${TEAMS}),
        title text NOT NULL DEFAULT '',
        token_hash text NOT NULL UNIQUE,
        invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
        expires_at timestamptz NOT NULL,
        accepted_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )`)
    await q.query(`CREATE INDEX invitations_workspace_email ON invitations (workspace_id, email)`)
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE invitations`)
    await q.query(`DROP TABLE memberships`)
    await q.query(`DROP TABLE workspaces`)
  }
}
