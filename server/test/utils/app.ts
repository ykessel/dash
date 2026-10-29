import type { AddressInfo } from 'node:net'
import type { INestApplication } from '@nestjs/common'
import { Test, type TestingModuleBuilder } from '@nestjs/testing'
import { ThrottlerStorage } from '@nestjs/throttler'
import request from 'supertest'
import { DataSource } from 'typeorm'
import { AppModule } from '../../src/app.module'
import { CLOCK } from '../../src/common/clock'
import { MAILER } from '../../src/mail/mailer'
import { configureApp } from '../../src/main'
import { FakeClock } from './fake-clock'
import { MemoryMailer } from './memory-mailer'

export interface TestApp {
  app: INestApplication
  http: ReturnType<typeof request>
  db: DataSource
  mailer: MemoryMailer
  clock: FakeClock
  /** Base URL of the listening server, for socket clients. */
  url: string
}

/**
 * Boots the real AppModule against the test database, with an in-memory
 * mailer and a movable clock. `overrides` swaps more providers (e.g. OAuth strategies);
 * `redisUrl` joins the instance to a Redis-backed Socket.IO cluster.
 */
export async function createTestApp(
  overrides?: (b: TestingModuleBuilder) => TestingModuleBuilder,
  opts: { redisUrl?: string } = {},
): Promise<TestApp> {
  const mailer = new MemoryMailer()
  const clock = new FakeClock()
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MAILER).useValue(mailer)
    .overrideProvider(CLOCK).useValue(clock)
  if (overrides) builder = overrides(builder)
  const moduleRef = await builder.compile()
  const app = moduleRef.createNestApplication()
  const io = configureApp(app)
  if (opts.redisUrl) await io.connectToRedis(opts.redisUrl)
  // Listen on a free port so socket.io clients can connect; supertest reuses the same server.
  await app.listen(0, '127.0.0.1')
  const { port } = app.getHttpServer().address() as AddressInfo
  return { app, http: request(app.getHttpServer()), db: app.get(DataSource), mailer, clock, url: `http://127.0.0.1:${port}` }
}

/** Empties every table except the migrations log. */
export async function resetDb(db: DataSource): Promise<void> {
  const rows: { tablename: string }[] = await db.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'migrations'`,
  )
  if (!rows.length) return
  await db.query(`TRUNCATE ${rows.map(r => `"${r.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`)
}

/** Fresh state between tests: empty tables, empty outbox, real time, no rate-limit counters. */
export async function resetAll(t: TestApp): Promise<void> {
  await resetDb(t.db)
  t.mailer.clear()
  t.clock.reset()
  // ThrottlerStorageService keeps counters in `storage` and hit times in `hitExpirations`.
  const store = t.app.get(ThrottlerStorage, { strict: false }) as unknown as { storage: Map<string, unknown>; hitExpirations: Map<string, unknown> }
  store.storage.clear()
  store.hitExpirations.clear()
}
