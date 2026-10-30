import { PERMISSIONS } from '../src/access/permissions'
import { createTestApp, resetAll, type TestApp } from './utils/app'
import { type Signed, twoTeams } from './utils/team'

describe('project access', () => {
  let t: TestApp
  let lin: Signed
  let nia: Signed
  let wsA: string
  let base: string
  beforeAll(async () => { t = await createTestApp() })
  beforeEach(async () => {
    await resetAll(t)
    ;({ lin, nia, wsA, base } = await twoTeams(t))
  })
  afterAll(() => t.app.close())

  const project = async (who: Signed, body: object = {}) =>
    (await t.http.post(`${base}/projects`).set(who.auth).send({ name: 'Tide', hue: 'teal', icon: 'leaf', due: '2026-12-01', ...body }).expect(201)).body
  const roleIds = async (): Promise<Record<string, string>> => {
    const rows: { id: string; key: string }[] = await t.db.query(`SELECT id, key FROM project_roles WHERE workspace_id = $1 AND key IS NOT NULL`, [wsA])
    return Object.fromEntries(rows.map(r => [r.key, r.id]))
  }
  const access = async (who: Signed, projectId: string): Promise<string[]> =>
    [...(await t.http.get(`${base}/access`).set(who.auth).expect(200)).body.projects[projectId]].sort()
  const MEMBER = ['project.browse', 'comments.add', 'tasks.create', 'tasks.edit_any', 'tasks.delete_any', 'tasks.assign', 'tasks.transition', 'time.log', 'time.edit_own', 'time.delete_own'].sort()

  it('owner sees every permission everywhere', async () => {
    const p = await project(nia)
    expect(await access(lin, p.id)).toEqual([...PERMISSIONS].sort())
  })

  it('a member off the list gets the default role', async () => {
    const p = await project(lin)
    expect(p.members).toEqual([lin.user.id])
    expect(await access(nia, p.id)).toEqual(MEMBER)
  })

  it('the lead gets lead permissions on top of Viewer', async () => {
    const ids = await roleIds()
    const p = await project(nia)
    await t.db.query(`UPDATE projects SET default_role_id = $1 WHERE id = $2`, [ids.viewer, p.id])
    await t.db.query(`UPDATE project_members SET role_id = $1 WHERE project_id = $2`, [ids.viewer, p.id])
    expect(await access(nia, p.id)).toEqual(['comments.add', 'project.admin', 'project.browse', 'time.approve', 'time.view_all'])
  })

  it('a member row beats the default', async () => {
    const ids = await roleIds()
    const p = await project(lin, { members: [nia.user.id] })
    await t.db.query(`UPDATE project_members SET role_id = $1 WHERE project_id = $2 AND user_id = $3`, [ids.viewer, p.id, nia.user.id])
    expect(await access(nia, p.id)).toEqual(['comments.add', 'project.browse'])
  })
})
