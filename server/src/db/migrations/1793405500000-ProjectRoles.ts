import type { MigrationInterface, QueryRunner } from 'typeorm'

// Literal copies of DEFAULT_ROLES at the time of writing: a migration never imports app code.
const ADMINISTRATOR = [
  'project.browse', 'project.admin',
  'tasks.create', 'tasks.edit_own', 'tasks.edit_any', 'tasks.delete_own', 'tasks.delete_any', 'tasks.assign', 'tasks.transition',
  'comments.add', 'comments.delete_any',
  'time.log', 'time.edit_own', 'time.edit_any', 'time.delete_own', 'time.delete_any', 'time.view_all', 'time.approve',
]
const MEMBER = [
  'project.browse', 'comments.add',
  'tasks.create', 'tasks.edit_any', 'tasks.delete_any', 'tasks.assign', 'tasks.transition',
  'time.log', 'time.edit_own', 'time.delete_own',
]
const VIEWER = ['project.browse', 'comments.add']

/**
 * Jira-style project roles: a role is a named set of permissions, each person holds one per
 * project. Every workspace gets Administrator, Member and Viewer, and everyone on every project
 * (and the default for everyone else) becomes Member, which is exactly what members can do today.
 */
export class ProjectRoles1793405500000 implements MigrationInterface {
  name = 'ProjectRoles1793405500000'

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE project_roles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        key text,
        name text NOT NULL,
        description text NOT NULL DEFAULT '',
        permissions text[] NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`)
    await q.query(`CREATE UNIQUE INDEX project_roles_name ON project_roles (workspace_id, lower(name))`)
    await q.query(`CREATE UNIQUE INDEX project_roles_key ON project_roles (workspace_id, key) WHERE key IS NOT NULL`)
    for (const [key, name, perms] of [['administrator', 'Administrator', ADMINISTRATOR], ['member', 'Member', MEMBER], ['viewer', 'Viewer', VIEWER]] as const) {
      await q.query(`INSERT INTO project_roles (workspace_id, key, name, permissions) SELECT id, $1, $2, $3::text[] FROM workspaces`, [key, name, perms])
    }

    await q.query(`ALTER TABLE project_members ADD COLUMN role_id uuid REFERENCES project_roles(id)`)
    await q.query(`
      UPDATE project_members pm SET role_id = r.id
      FROM projects p JOIN project_roles r ON r.workspace_id = p.workspace_id AND r.key = 'member'
      WHERE p.id = pm.project_id`)
    await q.query(`ALTER TABLE project_members ALTER COLUMN role_id SET NOT NULL`)
    await q.query(`CREATE INDEX project_members_role ON project_members (role_id)`)

    await q.query(`ALTER TABLE projects ADD COLUMN default_role_id uuid REFERENCES project_roles(id)`)
    await q.query(`
      UPDATE projects p SET default_role_id = r.id
      FROM project_roles r WHERE r.workspace_id = p.workspace_id AND r.key = 'member'`)
    await q.query(`ALTER TABLE projects ALTER COLUMN default_role_id SET NOT NULL`)
    await q.query(`CREATE INDEX projects_default_role ON projects (default_role_id)`)
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE projects DROP COLUMN default_role_id`)
    await q.query(`ALTER TABLE project_members DROP COLUMN role_id`)
    await q.query(`DROP TABLE project_roles`)
  }
}
