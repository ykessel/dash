import type { MigrationInterface, QueryRunner } from 'typeorm'
import { PRIORITIES, STATUSES, sqlList } from '../../common/enums'

export class Tasks1793404900000 implements MigrationInterface {
  name = 'Tasks1793404900000'

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE tasks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        assignee_id uuid REFERENCES users(id) ON DELETE SET NULL,
        title text NOT NULL,
        status text NOT NULL DEFAULT 'todo' CHECK (status IN ${sqlList(STATUSES)}),
        priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ${sqlList(PRIORITIES)}),
        due_date date,
        estimate double precision NOT NULL DEFAULT 1,
        "order" double precision NOT NULL DEFAULT 0,
        done_at date,
        version int NOT NULL DEFAULT 1,
        created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz
      )`)
    await q.query(`CREATE INDEX tasks_board ON tasks (workspace_id, status, "order") WHERE deleted_at IS NULL`)
    await q.query(`CREATE INDEX tasks_project ON tasks (project_id) WHERE deleted_at IS NULL`)
    await q.query(`
      CREATE TABLE subtasks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        title text NOT NULL,
        done boolean NOT NULL DEFAULT false,
        position int NOT NULL DEFAULT 0
      )`)
    await q.query(`CREATE INDEX subtasks_task ON subtasks (task_id, position)`)
    await q.query(`
      CREATE TABLE task_comments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        author_id uuid REFERENCES users(id) ON DELETE SET NULL,
        body text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`)
    await q.query(`CREATE INDEX task_comments_task ON task_comments (task_id, created_at)`)
    await q.query(`
      CREATE TABLE task_activity (
        id bigserial PRIMARY KEY,
        task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
        kind text NOT NULL CHECK (kind IN ('created', 'status', 'deleted', 'restored')),
        from_status text,
        to_status text,
        at timestamptz NOT NULL DEFAULT now()
      )`)
    await q.query(`CREATE INDEX task_activity_ws ON task_activity (workspace_id, at)`)
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE task_activity`)
    await q.query(`DROP TABLE task_comments`)
    await q.query(`DROP TABLE subtasks`)
    await q.query(`DROP TABLE tasks`)
  }
}
