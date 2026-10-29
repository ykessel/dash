import './env'
import dataSource from '../../src/db/data-source'

/** Brings the test database to the latest migration once per run. */
export default async function globalSetup() {
  await dataSource.initialize()
  await dataSource.runMigrations()
  await dataSource.destroy()
}
