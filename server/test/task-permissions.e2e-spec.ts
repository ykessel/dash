import { createTestApp, resetAll, type TestApp } from './utils/app'
import { type Signed, twoTeams } from './utils/team'

describe('task permissions', () => {
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
  const task = async (who: Signed, projectId: string, body: object = {}) =>
    (await t.http.post(`${base}/tasks`).set(who.auth).send({ title: 'Ship it', project: projectId, ...body }).expect(201)).body
  const roleIds = async (): Promise<Record<string, string>> => {
    const rows: { id: string; key: string }[] = await t.db.query(`SELECT id, key FROM project_roles WHERE workspace_id = $1 AND key IS NOT NULL`, [wsA])
    return Object.fromEntries(rows.map(r => [r.key, r.id]))
  }
  const customRole = async (permissions: string[]) =>
    (await t.http.post(`${base}/roles`).set(lin.auth).send({ name: `R${Math.random()}`.slice(0, 20), permissions }).expect(201)).body.id as string
  const give = (projectId: string, roleId: string) =>
    t.http.put(`${base}/projects/${projectId}/members/${nia.user.id}`).set(lin.auth).send({ roleId }).expect(200)

  it("a workspace member off the project's list can still do everything today's members can", async () => {
    const p = await project(lin)
    const x = await task(nia, p.id)
    const patched = await t.http.patch(`${base}/tasks/${x.id}`).set(nia.auth).send({ version: x.version, title: 'Ship it now', assignee: lin.user.id }).expect(200)
    await t.http.post(`${base}/tasks/${x.id}/move`).set(nia.auth).send({ status: 'progress' }).expect(200)
    await t.http.post(`${base}/tasks/${x.id}/comments`).set(nia.auth).send({ text: 'on it' }).expect(201)
    await t.http.post(`${base}/tasks/${x.id}/subtasks`).set(nia.auth).send({ title: 'step' }).expect(201)
    expect(patched.body.title).toBe('Ship it now')
    await t.http.delete(`${base}/tasks/${x.id}`).set(nia.auth).expect(204)
    await t.http.post(`${base}/tasks/${x.id}/restore`).set(nia.auth).expect(200)
  })

  it('a viewer can read and comment but not change', async () => {
    const ids = await roleIds()
    const p = await project(lin)
    const x = await task(lin, p.id)
    await give(p.id, ids.viewer)
    await t.http.get(`${base}/tasks/${x.id}`).set(nia.auth).expect(200)
    await t.http.post(`${base}/tasks/${x.id}/comments`).set(nia.auth).send({ text: 'looks good' }).expect(201)
    expect((await t.http.patch(`${base}/tasks/${x.id}`).set(nia.auth).send({ version: x.version, title: 'x' }).expect(403)).body.code).toBe('forbidden')
    await t.http.post(`${base}/tasks/${x.id}/move`).set(nia.auth).send({ status: 'done' }).expect(403)
    await t.http.delete(`${base}/tasks/${x.id}`).set(nia.auth).expect(403)
    await t.http.post(`${base}/tasks/${x.id}/subtasks`).set(nia.auth).send({ title: 'step' }).expect(403)
    await t.http.post(`${base}/tasks`).set(nia.auth).send({ title: 'mine', project: p.id }).expect(403)
    expect((await t.http.get(`${base}/tasks/${x.id}`).set(lin.auth)).body).toMatchObject({ title: 'Ship it', status: 'todo' })
  })

  it('edit_own lets a custom role edit only own tasks', async () => {
    const p = await project(lin)
    const linTask = await task(lin, p.id)
    await give(p.id, await customRole(['tasks.edit_own', 'tasks.create', 'tasks.transition']))
    const mine = await task(nia, p.id)
    await t.http.patch(`${base}/tasks/${mine.id}`).set(nia.auth).send({ version: mine.version, title: 'Mine' }).expect(200)
    await t.http.patch(`${base}/tasks/${linTask.id}`).set(nia.auth).send({ version: linTask.version, title: 'Theirs' }).expect(403)
  })

  it('moving a task into a project without tasks.create is 403 and leaves it', async () => {
    const ids = await roleIds()
    const from = await project(lin)
    const to = await project(lin, { name: 'Reef' })
    await give(to.id, ids.viewer)
    const x = await task(nia, from.id)
    await t.http.patch(`${base}/tasks/${x.id}`).set(nia.auth).send({ version: x.version, project: to.id }).expect(403)
    expect((await t.http.get(`${base}/tasks/${x.id}`).set(nia.auth)).body.project).toBe(from.id)
  })

  it('assigning needs tasks.assign', async () => {
    const p = await project(lin)
    await give(p.id, await customRole(['tasks.edit_any', 'tasks.create']))
    const x = await task(nia, p.id)
    await t.http.patch(`${base}/tasks/${x.id}`).set(nia.auth).send({ version: x.version, assignee: lin.user.id }).expect(403)
    await t.http.patch(`${base}/tasks/${x.id}`).set(nia.auth).send({ version: x.version, title: 'Renamed' }).expect(200)
  })

  it("creating a task assigned to someone needs tasks.assign", async () => {
    const p = await project(lin)
    await give(p.id, await customRole(['tasks.create']))
    await t.http.post(`${base}/tasks`).set(nia.auth).send({ title: 'x', project: p.id, assignee: lin.user.id }).expect(403)
    await t.http.post(`${base}/tasks`).set(nia.auth).send({ title: 'x', project: p.id }).expect(201)
  })

  it('creating a task assigned to yourself needs only tasks.create', async () => {
    const p = await project(lin)
    await give(p.id, await customRole(['tasks.create']))
    await t.http.post(`${base}/tasks`).set(nia.auth).send({ title: 'x', project: p.id, assignee: nia.user.id }).expect(201)
  })

  it("comments.delete_any lets the owner remove someone else's comment", async () => {
    const p = await project(lin)
    const x = await task(lin, p.id)
    const c = (await t.http.post(`${base}/tasks/${x.id}/comments`).set(nia.auth).send({ text: 'mine' }).expect(201)).body
    await t.http.delete(`${base}/tasks/${x.id}/comments/${c.id}`).set(lin.auth).expect(204)
  })

  it('a deleted task can only be restored with delete permission', async () => {
    const ids = await roleIds()
    const p = await project(lin)
    const x = await task(lin, p.id)
    await t.http.delete(`${base}/tasks/${x.id}`).set(lin.auth).expect(204)
    await give(p.id, ids.viewer)
    await t.http.post(`${base}/tasks/${x.id}/restore`).set(nia.auth).expect(403)
  })
})
