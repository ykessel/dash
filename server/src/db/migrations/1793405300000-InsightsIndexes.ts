import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * "Entered done" now includes tasks created straight into done, and cycle/stale look rows up
 * by task: both need an index that matches.
 */
export class InsightsIndexes1793405300000 implements MigrationInterface {
  name = 'InsightsIndexes1793405300000'

  async up(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX task_activity_done`)
    await q.query(`CREATE INDEX task_activity_done ON task_activity (workspace_id, at) WHERE kind IN ('status', 'created') AND to_status = 'done'`)
    await q.query(`CREATE INDEX task_activity_task ON task_activity (task_id, at)`)
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX task_activity_task`)
    await q.query(`DROP INDEX task_activity_done`)
    await q.query(`CREATE INDEX task_activity_done ON task_activity (workspace_id, at) WHERE kind = 'status' AND to_status = 'done'`)
  }
}
