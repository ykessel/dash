import type { MigrationInterface, QueryRunner } from 'typeorm'

export class NoticesFocusPrefs1793405100000 implements MigrationInterface {
  name = 'NoticesFocusPrefs1793405100000'

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE notifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
        kind text NOT NULL,
        payload jsonb NOT NULL DEFAULT '{}',
        read_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )`)
    await q.query(`CREATE INDEX notifications_inbox ON notifications (workspace_id, recipient_id, created_at DESC)`)
    await q.query(`
      CREATE TABLE focus_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
        label text NOT NULL DEFAULT '',
        planned_sec int NOT NULL CHECK (planned_sec BETWEEN 60 AND 14400),
        actual_sec int CHECK (actual_sec >= 0),
        started_at timestamptz NOT NULL,
        ended_at timestamptz
      )`)
    await q.query(`CREATE INDEX focus_sessions_user ON focus_sessions (workspace_id, user_id, started_at)`)
    await q.query(`
      CREATE TABLE user_prefs (
        user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        notify jsonb NOT NULL DEFAULT '{}',
        session_min int,
        pause_min int,
        look jsonb NOT NULL DEFAULT '{}'
      )`)
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE user_prefs`)
    await q.query(`DROP TABLE focus_sessions`)
    await q.query(`DROP TABLE notifications`)
  }
}
