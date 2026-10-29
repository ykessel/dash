import type { MigrationInterface, QueryRunner } from 'typeorm'
import { EVENT_KINDS, HUES, sqlList } from '../../common/enums'

export class Calendar1793405000000 implements MigrationInterface {
  name = 'Calendar1793405000000'

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        title text NOT NULL,
        date date NOT NULL,
        start_min int NOT NULL CHECK (start_min BETWEEN 0 AND 1439),
        dur_min int NOT NULL CHECK (dur_min BETWEEN 5 AND 1440),
        location text NOT NULL DEFAULT '',
        kind text NOT NULL CHECK (kind IN ${sqlList(EVENT_KINDS)}),
        hue text NOT NULL CHECK (hue IN ${sqlList(HUES)}),
        project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
        created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz
      )`)
    await q.query(`CREATE INDEX events_range ON events (workspace_id, date) WHERE deleted_at IS NULL`)
    await q.query(`
      CREATE TABLE event_attendees (
        event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        PRIMARY KEY (event_id, user_id)
      )`)
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE event_attendees`)
    await q.query(`DROP TABLE events`)
  }
}
