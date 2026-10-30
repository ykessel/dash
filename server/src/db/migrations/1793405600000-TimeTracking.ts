import type { MigrationInterface, QueryRunner } from 'typeorm'

/** Worklogs on tasks, remaining time, and per-project timesheet approval. New tables start empty. */
export class TimeTracking1793405600000 implements MigrationInterface {
  name = 'TimeTracking1793405600000'

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE worklogs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        work_date date NOT NULL,
        minutes int NOT NULL CHECK (minutes BETWEEN 1 AND 1440),
        comment text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
        deleted_at timestamptz
      )`)
    await q.query(`CREATE INDEX worklogs_user_day ON worklogs (workspace_id, user_id, work_date) WHERE deleted_at IS NULL`)
    await q.query(`CREATE INDEX worklogs_project_day ON worklogs (project_id, work_date) WHERE deleted_at IS NULL`)
    await q.query(`CREATE INDEX worklogs_task ON worklogs (task_id) WHERE deleted_at IS NULL`)
    await q.query(`
      CREATE TABLE timesheet_periods (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        period_start date NOT NULL,
        period_end date NOT NULL,
        period text NOT NULL CHECK (period IN ('week', 'month')),
        status text NOT NULL CHECK (status IN ('submitted', 'approved', 'rejected')),
        submitted_at timestamptz NOT NULL DEFAULT now(),
        reviewer_id uuid REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at timestamptz,
        comment text NOT NULL DEFAULT ''
      )`)
    await q.query(`CREATE UNIQUE INDEX timesheet_periods_key ON timesheet_periods (project_id, user_id, period_start)`)
    await q.query(`ALTER TABLE tasks ADD COLUMN remaining_minutes int CHECK (remaining_minutes >= 0)`)
    await q.query(`ALTER TABLE projects ADD COLUMN approval_enabled boolean NOT NULL DEFAULT false`)
    await q.query(`ALTER TABLE projects ADD COLUMN approval_period text NOT NULL DEFAULT 'week' CHECK (approval_period IN ('week', 'month'))`)
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE projects DROP COLUMN approval_period`)
    await q.query(`ALTER TABLE projects DROP COLUMN approval_enabled`)
    await q.query(`ALTER TABLE tasks DROP COLUMN remaining_minutes`)
    await q.query(`DROP TABLE timesheet_periods`)
    await q.query(`DROP TABLE worklogs`)
  }
}
