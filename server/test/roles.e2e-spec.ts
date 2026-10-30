import type { DomainEvent } from '../src/common/domain-events'
import { createTestApp, resetAll, type TestApp } from './utils/app'
import { captureEvents } from './utils/events'
import { type Signed, twoTeams } from './utils/team'

describe('roles', () => {
  let t: TestApp
  let events: DomainEvent[]
  let lin: Signed
  let wsA: string
  let base: string
  beforeAll(async () => { t = await createTestApp(); events = captureEvents(t) })
  beforeEach(async () => {
    await resetAll(t)
    ;({ lin, wsA, base } = await twoTeams(t))
    events.length = 0
  })
  afterAll(() => t.app.close())

  const project = async (who: Signed) =>
    (await t.http.post(`${base}/projects`).set(who.auth).send({ name: 'Tide', hue: 'teal', icon: 'leaf', due: '2026-12-01' }).expect(201)).body
  const roleIds = async (ws: string): Promise<Record<string, string>> => {
    const rows: { id: string; key: string }[] = await t.db.query(`SELECT id, key FROM project_roles WHERE workspace_id = $1 AND key IS NOT NULL`, [ws])
    return Object.fromEntries(rows.map(r => [r.key, r.id]))
  }

  it('a new workspace has Administrator, Member and Viewer', async () => {
    const rows = await t.db.query(`SELECT key, name FROM project_roles WHERE workspace_id = $1 ORDER BY key`, [wsA])
    expect(rows).toEqual([
      { key: 'administrator', name: 'Administrator' },
      { key: 'member', name: 'Member' },
      { key: 'viewer', name: 'Viewer' },
    ])
    const ids = await roleIds(wsA)
    const p = await project(lin)
    expect((await t.db.query(`SELECT default_role_id FROM projects WHERE id = $1`, [p.id]))[0].default_role_id).toBe(ids.member)
    expect((await t.db.query(`SELECT role_id FROM project_members WHERE project_id = $1 AND user_id = $2`, [p.id, lin.user.id]))[0].role_id).toBe(ids.member)
  })
})
