import dataSource from './data-source'

/** Fly's release_command: brings the database to the latest migration over the direct URL, then exits. */
async function migrate() {
  await dataSource.initialize()
  const ran = await dataSource.runMigrations({ transaction: 'each' })
  console.log(JSON.stringify({ level: 'info', msg: 'migrations applied', ran: ran.map(m => m.name) }))
  await dataSource.destroy()
}

migrate().then(
  () => process.exit(0),
  (e: unknown) => {
    console.error(e)
    process.exit(1)
  },
)
