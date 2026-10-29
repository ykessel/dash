import type { MigrationInterface, QueryRunner } from 'typeorm'
import { HUES, PROJECT_ICONS, PROJECT_STATUSES, sqlList } from '../../common/enums'

export class Projects1793404800000 implements MigrationInterface {
  name = 'Projects1793404800000'

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE projects (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name text NOT NULL,
        description text NOT NULL DEFAULT '',
        hue text NOT NULL CHECK (hue IN ${sqlList(HUES)}),
        icon text NOT NULL CHECK (icon IN ${sqlList(PROJECT_ICONS)}),
        status text NOT NULL DEFAULT 'planning' CHECK (status IN ${sqlList(PROJECT_STATUSES)}),
        start_date date NOT NULL,
        due_date date NOT NULL,
        lead_id uuid REFERENCES users(id) ON DELETE SET NULL,
        version int NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz
      )`)
    await q.query(`CREATE INDEX projects_workspace ON projects (workspace_id) WHERE deleted_at IS NULL`)
    await q.query(`
      CREATE TABLE project_members (
        project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        PRIMARY KEY (project_id, user_id)
      )`)
    await q.query(`
      CREATE TABLE project_user_prefs (
        project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        pinned boolean NOT NULL DEFAULT false,
        starred boolean NOT NULL DEFAULT false,
        PRIMARY KEY (project_id, user_id)
      )`)
    await q.query(`
      CREATE TABLE milestones (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title text NOT NULL,
        due_date date NOT NULL,
        done boolean NOT NULL DEFAULT false,
        position int NOT NULL DEFAULT 0
      )`)
    await q.query(`CREATE INDEX milestones_project ON milestones (project_id, position)`)
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE milestones`)
    await q.query(`DROP TABLE project_user_prefs`)
    await q.query(`DROP TABLE project_members`)
    await q.query(`DROP TABLE projects`)
  }
}
