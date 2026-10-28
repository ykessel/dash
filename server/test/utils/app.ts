import type { INestApplication } from '@nestjs/common'
import { Test, type TestingModuleBuilder } from '@nestjs/testing'
import request from 'supertest'
import { DataSource } from 'typeorm'
import { AppModule } from '../../src/app.module'
import { configureApp } from '../../src/main'

export interface TestApp {
  app: INestApplication
  http: ReturnType<typeof request>
  db: DataSource
}

/** Boots the real AppModule against the test database. `overrides` swaps providers (mailer, clock, strategies). */
export async function createTestApp(overrides?: (b: TestingModuleBuilder) => TestingModuleBuilder): Promise<TestApp> {
  let builder = Test.createTestingModule({ imports: [AppModule] })
  if (overrides) builder = overrides(builder)
  const moduleRef = await builder.compile()
  const app = moduleRef.createNestApplication()
  configureApp(app)
  await app.init()
  return { app, http: request(app.getHttpServer()), db: app.get(DataSource) }
}

/** Empties every table except the migrations log. */
export async function resetDb(db: DataSource): Promise<void> {
  const rows: { tablename: string }[] = await db.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'migrations'`,
  )
  if (!rows.length) return
  await db.query(`TRUNCATE ${rows.map(r => `"${r.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`)
}
