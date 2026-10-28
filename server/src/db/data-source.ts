import 'reflect-metadata'
import { DataSource } from 'typeorm'

/** Used by the TypeORM CLI and the e2e global setup. Migrations go over the direct (non-pooled) URL. */
export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL,
  entities: [__dirname + '/../**/*.entity.{ts,js}'],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  migrationsTableName: 'migrations',
})
