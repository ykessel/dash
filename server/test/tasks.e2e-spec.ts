import type { DomainEvent } from '../src/common/domain-events'
import { isoDay } from '../src/common/dates'
import { createTestApp, resetAll, type TestApp } from './utils/app'
import { captureEvents } from './utils/events'
import { type Signed, twoTeams } from './utils/team'

describe('tasks', () => {
  let t: TestApp
  let events: DomainEvent[]
  let lin: Signed
  let nia: Signed
  let kai: Signed
  let base: string
  let baseB: string
  let projectId: string
  beforeAll(async () => { t = await createTestApp(); events = captureEvents(t) })
  beforeEach(async () => {
    await resetAll(t)
    ;({ lin, nia, kai, base, baseB } = await twoTeams(t))
    projectId = (await t.http.post(`${base}/projects`).set(lin.auth).send({ name: 'Tide', hue: 'teal', icon: 'leaf', due: '2026-12-01' })).body.id
    events.length = 0
  })
  afterAll(() => t.app.close())

  const url = (id = '') => `${base}/tasks${id ? `/${id}` : ''}`
  const create = async (body: object = {}, who: Signed = lin) =>
    (await t.http.post(url()).set(who.auth).send({ title: 'Ship it', project: projectId, ...body }).expect(201)).body

  it('a new task lands at the top of its column with version 1', async () => {
    const a = await create({ title: 'A' })
    expect(a).toMatchObject({
      title: 'A', project: projectId, assignee: '', status: 'todo', priority: 'medium', due: '', estimate: 1,
      subtasks: [], comments: [], version: 1,
    })
    expect(a).not.toHaveProperty('doneAt')
    const b = await create({ title: 'B' })
    expect(b.order).toBeLessThan(a.order)
    const list = (await t.http.get(url()).set(nia.auth).expect(200)).body
    expect(list.map((x: { title: string }) => x.title)).toEqual(['B', 'A'])
  })

  it('two people edit the same card: the second stale PATCH is 409 and the first change stays', async () => {
    const task = await create({ title: 'Ship it' })
    await t.http.patch(url(task.id)).set(lin.auth).send({ version: 1, title: 'Ship it today' }).expect(200)
    const res = await t.http.patch(url(task.id)).set(nia.auth).send({ version: 1, priority: 'urgent' }).expect(409)
    expect(res.body.code).toBe('version_conflict')
    expect((await t.http.get(url(task.id)).set(lin.auth)).body).toMatchObject({ title: 'Ship it today', priority: 'medium', version: 2 })
  })

  it('PATCH status to done sets doneAt, puts it on top of done and logs activity; back to todo clears doneAt', async () => {
    const old = await create({ title: 'Old', status: 'done' })
    const task = await create({ title: 'New' })
    const done = (await t.http.patch(url(task.id)).set(nia.auth).send({ version: 1, status: 'done' }).expect(200)).body
    expect(done).toMatchObject({ status: 'done', doneAt: isoDay(t.clock.now()), version: 2 })
    expect(done.order).toBeLessThan(old.order)
    const back = (await t.http.patch(url(task.id)).set(nia.auth).send({ version: 2, status: 'todo' }).expect(200)).body
    expect(back).not.toHaveProperty('doneAt')
    const activity = await t.db.query(`SELECT kind, from_status, to_status, actor_id FROM task_activity WHERE task_id = $1 ORDER BY at, id`, [task.id])
    expect(activity).toEqual([
      { kind: 'created', from_status: null, to_status: 'todo', actor_id: lin.user.id },
      { kind: 'status', from_status: 'todo', to_status: 'done', actor_id: nia.user.id },
      { kind: 'status', from_status: 'done', to_status: 'todo', actor_id: nia.user.id },
    ])
  })

  it('a project or assignee from another workspace is 400 invalid', async () => {
    const otherProject = (await t.http.post(`${baseB}/projects`).set(kai.auth).send({ name: 'B', hue: 'blue', icon: 'grid', due: '2026-12-01' })).body.id
    const p = await t.http.post(url()).set(lin.auth).send({ title: 'X', project: otherProject }).expect(400)
    expect(p.body).toMatchObject({ code: 'invalid', field: 'project' })
    const a = await t.http.post(url()).set(lin.auth).send({ title: 'X', project: projectId, assignee: kai.user.id }).expect(400)
    expect(a.body).toMatchObject({ code: 'invalid', field: 'assignee' })
    const task = await create()
    const e = await t.http.patch(url(task.id)).set(lin.auth).send({ version: 1, assignee: kai.user.id }).expect(400)
    expect(e.body).toMatchObject({ code: 'invalid', field: 'assignee' })
    expect((await t.db.query(`SELECT count(*)::int AS n FROM tasks`))[0].n).toBe(1)
  })

  it('a task from another workspace is 404 task_not_found', async () => {
    const otherProject = (await t.http.post(`${baseB}/projects`).set(kai.auth).send({ name: 'B', hue: 'blue', icon: 'grid', due: '2026-12-01' })).body.id
    const other = (await t.http.post(`${baseB}/tasks`).set(kai.auth).send({ title: 'B', project: otherProject }).expect(201)).body
    expect((await t.http.get(url(other.id)).set(lin.auth).expect(404)).body.code).toBe('task_not_found')
    expect((await t.http.get(url('nope')).set(lin.auth).expect(404)).body.code).toBe('task_not_found')
  })

  it('deleted tasks disappear from lists and GET; restore brings them back with subtasks and comments', async () => {
    const task = await create()
    await t.db.query(`INSERT INTO subtasks (task_id, title, done, position) VALUES ($1, 'Step', true, 0)`, [task.id])
    await t.db.query(`INSERT INTO task_comments (task_id, author_id, body) VALUES ($1, $2, 'Looks good')`, [task.id, nia.user.id])
    await t.http.delete(url(task.id)).set(nia.auth).expect(204)
    expect((await t.http.get(url(task.id)).set(lin.auth).expect(404)).body.code).toBe('task_not_found')
    expect((await t.http.get(url()).set(lin.auth)).body).toEqual([])
    const back = (await t.http.post(`${url(task.id)}/restore`).set(lin.auth).expect(200)).body
    expect(back).toMatchObject({
      id: task.id,
      subtasks: [{ id: expect.any(String), title: 'Step', done: true }],
      comments: [{ id: expect.any(String), who: nia.user.id, text: 'Looks good', at: expect.any(Number) }],
    })
    expect((await t.http.get(url()).set(lin.auth)).body).toHaveLength(1)
  })

  it('deleting a project with live tasks is 409 project_has_tasks', async () => {
    const task = await create()
    const res = await t.http.delete(`${base}/projects/${projectId}`).set(lin.auth).expect(409)
    expect(res.body.code).toBe('project_has_tasks')
    await t.http.delete(url(task.id)).set(lin.auth).expect(204)
    await t.http.delete(`${base}/projects/${projectId}`).set(lin.auth).expect(204)
  })

  it('a task of a deleted project cannot be restored: 409 project_deleted', async () => {
    const task = await create()
    await t.http.delete(url(task.id)).set(lin.auth).expect(204)
    await t.http.delete(`${base}/projects/${projectId}`).set(lin.auth).expect(204)
    expect((await t.http.post(`${url(task.id)}/restore`).set(lin.auth).expect(409)).body.code).toBe('project_deleted')
    expect((await t.http.get(url()).set(lin.auth)).body).toEqual([])
  })

  it('creating tasks while the project is deleted never leaves a live task in a deleted project', async () => {
    for (let i = 0; i < 15; i++) {
      const p = (await t.http.post(`${base}/projects`).set(lin.auth).send({ name: `R${i}`, hue: 'teal', icon: 'leaf', due: '2026-12-01' })).body.id
      await Promise.all([
        t.http.post(url()).set(nia.auth).send({ title: 'race', project: p }),
        t.http.delete(`${base}/projects/${p}`).set(lin.auth),
      ])
    }
    const [{ n }] = await t.db.query(
      `SELECT count(*)::int AS n FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.deleted_at IS NULL AND p.deleted_at IS NOT NULL`)
    expect(n).toBe(0)
  })

  it('filters: project, assignee, status and q', async () => {
    const other = (await t.http.post(`${base}/projects`).set(lin.auth).send({ name: 'Moss', hue: 'green', icon: 'leaf', due: '2026-12-01' })).body.id
    await create({ title: 'Write docs', assignee: nia.user.id })
    await create({ title: 'Fix login', status: 'progress' })
    await create({ title: 'DOCS review', project: other })
    const titles = async (qs: string) =>
      ((await t.http.get(`${url()}?${qs}`).set(lin.auth).expect(200)).body as { title: string }[]).map(x => x.title).sort()
    expect(await titles(`project=${other}`)).toEqual(['DOCS review'])
    expect(await titles(`assignee=${nia.user.id}`)).toEqual(['Write docs'])
    expect(await titles('status=progress')).toEqual(['Fix login'])
    expect(await titles('q=docs')).toEqual(['DOCS review', 'Write docs'])
  })

  it('bad input is 400 with the field', async () => {
    const cases: [object, string][] = [
      [{ title: '' }, 'title'],
      [{ status: 'later' }, 'status'],
      [{ priority: 'now' }, 'priority'],
      [{ due: '2026-02-30' }, 'due'],
      [{ estimate: 101 }, 'estimate'],
    ]
    for (const [body, field] of cases) {
      const res = await t.http.post(url()).set(lin.auth).send({ title: 'X', project: projectId, ...body }).expect(400)
      expect(res.body.field).toBe(field)
    }
    const task = await create()
    expect((await t.http.patch(url(task.id)).set(lin.auth).send({ title: 'Y' }).expect(400)).body.field).toBe('version')
  })

  it('publishes task.created / task.updated / task.deleted / task.restored', async () => {
    const task = await create()
    await t.http.patch(url(task.id)).set(lin.auth).send({ version: 1, title: 'Renamed' }).expect(200)
    await t.http.delete(url(task.id)).set(lin.auth).expect(204)
    await t.http.post(`${url(task.id)}/restore`).set(lin.auth).expect(200)
    expect(events.map(e => e.type)).toEqual(['task.created', 'task.updated', 'task.deleted', 'task.restored'])
    expect(events[0].data.task).toMatchObject({ id: task.id, version: 1 })
    expect(events[1].data.task).toMatchObject({ title: 'Renamed', version: 2 })
    expect(events[2].data).toEqual({ id: task.id })
    expect(events[3].data.task).toMatchObject({ id: task.id })
  })
})
