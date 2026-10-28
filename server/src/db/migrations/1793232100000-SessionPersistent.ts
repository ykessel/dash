import type { MigrationInterface, QueryRunner } from 'typeorm'

/** Whether the session came from "Keep me signed in"; rotation must keep the same cookie lifetime. */
export class SessionPersistent1793232100000 implements MigrationInterface {
  name = 'SessionPersistent1793232100000'

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE refresh_sessions ADD COLUMN persistent boolean NOT NULL DEFAULT true`)
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE refresh_sessions DROP COLUMN persistent`)
  }
}
