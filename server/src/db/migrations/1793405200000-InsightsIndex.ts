import type { MigrationInterface, QueryRunner } from 'typeorm'

/** Insights read "entered done" rows by workspace and time; this keeps that scan small. */
export class InsightsIndex1793405200000 implements MigrationInterface {
  name = 'InsightsIndex1793405200000'

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE INDEX task_activity_done ON task_activity (workspace_id, at) WHERE kind = 'status' AND to_status = 'done'`)
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX task_activity_done`)
  }
}
