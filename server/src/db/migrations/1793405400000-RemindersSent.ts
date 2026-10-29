import type { MigrationInterface, QueryRunner } from 'typeorm'

/** One row per reminder or digest already handed out, so every tick (and every instance) sends it once. */
export class RemindersSent1793405400000 implements MigrationInterface {
  name = 'RemindersSent1793405400000'

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE reminders_sent (
        kind text NOT NULL,
        ref text NOT NULL,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        sent_at timestamptz NOT NULL,
        PRIMARY KEY (kind, ref, user_id)
      )`)
    await q.query(`CREATE INDEX reminders_sent_at ON reminders_sent (sent_at)`)
    await q.query(`CREATE INDEX tasks_due_open ON tasks (due_date) WHERE deleted_at IS NULL AND status <> 'done' AND assignee_id IS NOT NULL`)
    await q.query(`CREATE INDEX events_date_live ON events (date) WHERE deleted_at IS NULL`)
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX events_date_live`)
    await q.query(`DROP INDEX tasks_due_open`)
    await q.query(`DROP TABLE reminders_sent`)
  }
}
