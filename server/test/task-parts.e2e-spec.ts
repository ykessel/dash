import type { DomainEvent } from '../src/common/domain-events'
import { createTestApp, resetAll, type TestApp } from './utils/app'
import { captureEvents } from './utils/events'
import { type Signed, twoTeams } from './utils/team'

describe('subtasks and comments', () => {
  let t: TestApp
  let events: DomainEvent[]
  let lin: Signed
  let nia: Signed
  let kai: Signed
  let base: string
  let baseB: string
  let task: { id: string }
  beforeAll(async () => { t = await createTestApp(); events = captureEvents(t) })
  beforeEach(async () => {
    await resetAll(t)
    ;({ lin, nia, kai, base, baseB } = await twoTeams(t))
    const projectId = (await t.http.post(`${base}/projects`).set(lin.auth).send({ name: 'Tide', hue: 'teal', icon: 'leaf', due: '2026-12-01' })).body.id
    task = (await t.http.post(`${base}/tasks`).set(lin.auth).send({ title: 'Ship it', project: projectId })).body
    events.length = 0
  })
  afterAll(() => t.app.close())

  const sub = (sid = '') => `${base}/tasks/${task.id}/subtasks${sid ? `/${sid}` : ''}`
  const comments = (cid = '') => `${base}/tasks/${task.id}/comments${cid ? `/${cid}` : ''}`

  it('add, check, rename and remove a subtask; each returns the task with a higher version', async () => {
    const one = (await t.http.post(sub()).set(nia.auth).send({ title: 'Draft' }).expect(201)).body
    expect(one).toMatchObject({ id: task.id, version: 2, subtasks: [{ id: expect.any(String), title: 'Draft', done: false }] })
    const two = (await t.http.post(sub()).set(nia.auth).send({ title: 'Review' }).expect(201)).body
    expect(two.subtasks.map((s: { title: string }) => s.title)).toEqual(['Draft', 'Review'])
    const sid = one.subtasks[0].id
    const checked = (await t.http.patch(sub(sid)).set(lin.auth).send({ done: true }).expect(200)).body
    expect(checked).toMatchObject({ version: 4, subtasks: [{ id: sid, title: 'Draft', done: true }, { title: 'Review' }] })
    const renamed = (await t.http.patch(sub(sid)).set(lin.auth).send({ title: 'First draft' }).expect(200)).body
    expect(renamed.subtasks[0]).toEqual({ id: sid, title: 'First draft', done: true })
    const gone = (await t.http.delete(sub(sid)).set(lin.auth).expect(200)).body
    expect(gone).toMatchObject({ version: 6, subtasks: [{ title: 'Review' }] })
    expect(events.map(e => e.type)).toEqual(Array(5).fill('task.updated'))
    expect(events[4].data.task).toMatchObject({ id: task.id, version: 6 })
  })

  it('a comment has the frontend Comment shape and publishes comment.created', async () => {
    t.clock.advance(60_000)
    const before = t.clock.now().getTime()
    const res = await t.http.post(comments()).set(nia.auth).send({ text: 'Looks good' }).expect(201)
    expect(res.body).toEqual({ id: expect.any(String), who: nia.user.id, text: 'Looks good', at: expect.any(Number) })
    // `at` comes from the app clock (a minute ahead here), in milliseconds.
    expect(res.body.at).toBeGreaterThanOrEqual(before)
    expect(res.body.at).toBeLessThanOrEqual(t.clock.now().getTime())
    expect(events.map(e => e.type)).toEqual(['comment.created'])
    expect(events[0].data).toEqual({ taskId: task.id, comment: res.body })
    const view = (await t.http.get(`${base}/tasks/${task.id}`).set(lin.auth)).body
    expect(view.comments).toEqual([res.body])
  })

  it('the author deletes a comment; a member without comments.delete_any cannot', async () => {
    const c = (await t.http.post(comments()).set(lin.auth).send({ text: 'Mine' }).expect(201)).body
    expect((await t.http.delete(comments(c.id)).set(nia.auth).expect(403)).body.code).toBe('forbidden')
    await t.http.delete(comments(c.id)).set(lin.auth).expect(204)
    expect((await t.http.get(`${base}/tasks/${task.id}`).set(lin.auth)).body.comments).toEqual([])
    expect(events.map(e => e.type)).toEqual(['comment.created', 'task.updated'])
  })

  it('bad input is 400 with the field', async () => {
    expect((await t.http.post(sub()).set(lin.auth).send({ title: '' }).expect(400)).body.field).toBe('title')
    expect((await t.http.post(comments()).set(lin.auth).send({ text: 'x'.repeat(2001) }).expect(400)).body.field).toBe('text')
  })

  it('a subtask, comment or task of another workspace is 404', async () => {
    const projectB = (await t.http.post(`${baseB}/projects`).set(kai.auth).send({ name: 'B', hue: 'blue', icon: 'grid', due: '2026-12-01' })).body.id
    const taskB = (await t.http.post(`${baseB}/tasks`).set(kai.auth).send({ title: 'B', project: projectB })).body
    const subB = (await t.http.post(`${baseB}/tasks/${taskB.id}/subtasks`).set(kai.auth).send({ title: 'B1' }).expect(201)).body.subtasks[0].id
    const comB = (await t.http.post(`${baseB}/tasks/${taskB.id}/comments`).set(kai.auth).send({ text: 'hi' }).expect(201)).body.id
    expect((await t.http.post(`${base}/tasks/${taskB.id}/subtasks`).set(lin.auth).send({ title: 'x' }).expect(404)).body.code).toBe('task_not_found')
    expect((await t.http.patch(sub(subB)).set(lin.auth).send({ done: true }).expect(404)).body.code).toBe('subtask_not_found')
    expect((await t.http.delete(sub(subB)).set(lin.auth).expect(404)).body.code).toBe('subtask_not_found')
    expect((await t.http.delete(comments(comB)).set(lin.auth).expect(404)).body.code).toBe('comment_not_found')
    expect((await t.db.query(`SELECT done FROM subtasks WHERE id = $1`, [subB]))[0].done).toBe(false)
  })
})
