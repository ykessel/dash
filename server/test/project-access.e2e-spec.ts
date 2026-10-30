import { PERMISSIONS } from '../src/access/permissions'
import type { DomainEvent } from '../src/common/domain-events'
import { createTestApp, resetAll, type TestApp } from './utils/app'
import { captureEvents } from './utils/events'
import { signedIn } from './utils/seed'
import { type Signed, twoTeams } from './utils/team'

describe('project access', () => {
  let t: TestApp
  let lin: Signed
  let nia: Signed
  let wsA: string
  let base: string
  let events: DomainEvent[]
  beforeAll(async () => { t = await createTestApp(); events = captureEvents(t) })
  beforeEach(async () => {
    await resetAll(t)
    ;({ lin, nia, wsA, base } = await twoTeams(t))
    events.length = 0
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

  describe('membership with roles', () => {
    const setRole = (who: Signed, projectId: string, userId: string, roleId: string) =>
      t.http.put(`${base}/projects/${projectId}/members/${userId}`).set(who.auth).send({ roleId })
    /** nia leads a project where both her role and the default are Viewer; lin holds Administrator there. */
    const viewerLead = async () => {
      const ids = await roleIds()
      const p = await project(lin, { lead: nia.user.id })
      await t.db.query(`UPDATE projects SET default_role_id = $1 WHERE id = $2`, [ids.viewer, p.id])
      await t.db.query(`UPDATE project_members SET role_id = $1 WHERE project_id = $2 AND user_id = $3`, [ids.viewer, p.id, nia.user.id])
      await t.db.query(`UPDATE project_members SET role_id = $1 WHERE project_id = $2 AND user_id = $3`, [ids.administrator, p.id, lin.user.id])
      return { ids, p }
    }

    it("owner sets a member's role; the view shows it; access_changed is published", async () => {
      const ids = await roleIds()
      const p = await project(lin)
      events.length = 0
      const res = await setRole(lin, p.id, nia.user.id, ids.viewer).expect(200)
      expect(res.body.members.sort()).toEqual([lin.user.id, nia.user.id].sort())
      expect(res.body.roles).toEqual({ [lin.user.id]: ids.member, [nia.user.id]: ids.viewer })
      expect(res.body.defaultRole).toBe(ids.member)
      expect(events.map(e => e.type)).toEqual(['project.updated', 'project.access_changed'])
      expect(events[1].data).toEqual({ projectId: p.id })
      expect(await access(nia, p.id)).toEqual(['comments.add', 'project.browse'])
    })

    it("a plain-member lead can't grant, demote or default above themself", async () => {
      const { ids, p } = await viewerLead()
      const kim = await signedIn(t, 'kim@pane.app')
      await t.db.query(`INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'member')`, [wsA, kim.user.id])
      expect((await setRole(nia, p.id, kim.user.id, ids.administrator).expect(403)).body.code).toBe('forbidden')
      await setRole(nia, p.id, lin.user.id, ids.member).expect(403)
      await t.http.delete(`${base}/projects/${p.id}/members/${lin.user.id}`).set(nia.auth).expect(403)
      const v = (await t.http.get(`${base}/projects/${p.id}`).set(nia.auth)).body.version
      await t.http.patch(`${base}/projects/${p.id}`).set(nia.auth).send({ version: v, defaultRole: ids.administrator }).expect(403)
      await setRole(nia, p.id, kim.user.id, ids.viewer).expect(200)
    })

    it('changing the lead moves the lead powers', async () => {
      const { p } = await viewerLead()
      let v = (await t.http.patch(`${base}/projects/${p.id}`).set(nia.auth).send({ version: p.version, name: 'Tide 2' }).expect(200)).body.version
      v = (await t.http.patch(`${base}/projects/${p.id}`).set(lin.auth).send({ version: v, lead: lin.user.id }).expect(200)).body.version
      await t.http.patch(`${base}/projects/${p.id}`).set(nia.auth).send({ version: v, name: 'Tide 3' }).expect(403)
      expect(await access(nia, p.id)).not.toContain('project.admin')
    })

    it('a role from another workspace is 400 invalid on roleId', async () => {
      const p = await project(lin)
      const [{ id }] = await t.db.query(`SELECT r.id FROM project_roles r WHERE r.workspace_id <> $1 AND r.key = 'viewer'`, [wsA])
      expect((await setRole(lin, p.id, nia.user.id, id).expect(400)).body).toMatchObject({ code: 'invalid', field: 'roleId' })
    })

    it("a person from another workspace can't be added", async () => {
      const ids = await roleIds()
      const p = await project(lin)
      const kai = await t.db.query(`SELECT id FROM users WHERE email = 'kai@pane.app'`)
      expect((await setRole(lin, p.id, kai[0].id, ids.member).expect(400)).body.code).toBe('invalid')
    })

    it("the lead can't be removed from the members", async () => {
      const p = await project(lin)
      expect((await t.http.delete(`${base}/projects/${p.id}/members/${lin.user.id}`).set(lin.auth).expect(409)).body.code).toBe('lead_is_member')
    })

    it('owner removes a member and sets the default role', async () => {
      const ids = await roleIds()
      const p = await project(lin, { members: [nia.user.id] })
      const res = await t.http.delete(`${base}/projects/${p.id}/members/${nia.user.id}`).set(lin.auth).expect(200)
      expect(res.body.members).toEqual([lin.user.id])
      const patched = await t.http.patch(`${base}/projects/${p.id}`).set(lin.auth).send({ version: res.body.version, defaultRole: ids.viewer }).expect(200)
      expect(patched.body.defaultRole).toBe(ids.viewer)
      expect(await access(nia, p.id)).toEqual(['comments.add', 'project.browse'])
    })

    it("a viewer can't edit the project or its milestones", async () => {
      const ids = await roleIds()
      const p = await project(lin, { members: [nia.user.id] })
      await setRole(lin, p.id, nia.user.id, ids.viewer).expect(200)
      await t.http.patch(`${base}/projects/${p.id}`).set(nia.auth).send({ version: 1, name: 'x' }).expect(403)
      await t.http.post(`${base}/projects/${p.id}/milestones`).set(nia.auth).send({ title: 'Beta', due: '2026-12-01' }).expect(403)
    })

    it('editing or deleting a role tells every client to refetch access', async () => {
      const r = (await t.http.post(`${base}/roles`).set(lin.auth).send({ name: 'Lead', permissions: [] }).expect(201)).body
      events.length = 0
      await t.http.patch(`${base}/roles/${r.id}`).set(lin.auth).send({ permissions: ['time.approve'] }).expect(200)
      await t.http.delete(`${base}/roles/${r.id}`).set(lin.auth).expect(204)
      expect(events.map(e => [e.type, e.data.projectId])).toEqual([
        ['role.updated', undefined], ['project.access_changed', null], ['role.deleted', undefined], ['project.access_changed', null],
      ])
    })
  })
})
