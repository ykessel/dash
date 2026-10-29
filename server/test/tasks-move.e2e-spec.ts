import type { DomainEvent } from '../src/common/domain-events'
import { isoDay } from '../src/common/dates'
import { createTestApp, resetAll, type TestApp } from './utils/app'
import { captureEvents } from './utils/events'
import { type Signed, twoTeams } from './utils/team'

describe('task moves', () => {
  let t: TestApp
  let events: DomainEvent[]
  let lin: Signed
  let nia: Signed
  let base: string
  let projectId: string
  beforeAll(async () => { t = await createTestApp(); events = captureEvents(t) })
  beforeEach(async () => {
    await resetAll(t)
    ;({ lin, nia, base } = await twoTeams(t))
    projectId = (await t.http.post(`${base}/projects`).set(lin.auth).send({ name: 'Tide', hue: 'teal', icon: 'leaf', due: '2026-12-01' })).body.id
    events.length = 0
  })
  afterAll(() => t.app.close())

  const create = async (title: string, status = 'todo') =>
    (await t.http.post(`${base}/tasks`).set(lin.auth).send({ title, project: projectId, status }).expect(201)).body
  const move = (id: string, body: object, who: Signed = lin) => t.http.post(`${base}/tasks/${id}/move`).set(who.auth).send(body)
  const column = async (status: string) =>
    ((await t.http.get(`${base}/tasks?status=${status}`).set(lin.auth).expect(200)).body as { title: string; order: number }[])

  /** Creates cards so the column reads top to bottom as `titles`. */
  const columnOf = async (titles: string[], status = 'todo') => {
    const made: Record<string, { id: string }> = {}
    for (const title of [...titles].reverse()) made[title] = await create(title, status)
    return made
  }

  it('moves before another card, to the top and to the end', async () => {
    const { a, b, c } = await columnOf(['a', 'b', 'c'])
    const res = await move(c.id, { status: 'todo', beforeId: b.id }).expect(200)
    expect(res.body).toMatchObject({ id: c.id, status: 'todo', version: 2 })
    expect((await column('todo')).map(x => x.title)).toEqual(['a', 'c', 'b'])
    await move(a.id, { status: 'todo', beforeId: null }).expect(200)
    expect((await column('todo')).map(x => x.title)).toEqual(['c', 'b', 'a'])
    await move(a.id, { status: 'todo', beforeId: 'top' }).expect(200)
    expect((await column('todo')).map(x => x.title)).toEqual(['a', 'c', 'b'])
  })

  it('60 drops into the same gap keep a strict, stable order', async () => {
    const { b, x } = await columnOf(['a', 'b', 'x'])
    for (let i = 0; i < 60; i++) {
      if (i % 2 === 0) await move(x.id, { status: 'todo', beforeId: b.id }).expect(200) // a, x, b
      else await move(b.id, { status: 'todo', beforeId: x.id }).expect(200) // a, b, x
    }
    const col = await column('todo')
    expect(col.map(c => c.title)).toEqual(['a', 'b', 'x'])
    for (let i = 1; i < col.length; i++) expect(col[i].order).toBeGreaterThan(col[i - 1].order)
  })

  it('moving into done sets doneAt and logs a status activity', async () => {
    const { a } = await columnOf(['a'])
    const res = await move(a.id, { status: 'done', beforeId: 'top' }, nia).expect(200)
    expect(res.body).toMatchObject({ status: 'done', doneAt: isoDay(t.clock.now()) })
    const rows = await t.db.query(`SELECT kind, from_status, to_status FROM task_activity WHERE task_id = $1 AND kind = 'status'`, [a.id])
    expect(rows).toEqual([{ kind: 'status', from_status: 'todo', to_status: 'done' }])
    const back = await move(a.id, { status: 'progress' }).expect(200)
    expect(back.body).not.toHaveProperty('doneAt')
  })

  it('a beforeId from another column is 400 invalid', async () => {
    const { a } = await columnOf(['a'])
    const other = await create('other', 'review')
    const res = await move(a.id, { status: 'todo', beforeId: other.id }).expect(400)
    expect(res.body).toMatchObject({ code: 'invalid', field: 'beforeId' })
  })

  it('a second client sees task.moved', async () => {
    const { a } = await columnOf(['a'])
    events.length = 0
    await move(a.id, { status: 'review' }).expect(200)
    expect(events.map(e => e.type)).toEqual(['task.moved'])
    expect(events[0].data.task).toMatchObject({ id: a.id, status: 'review' })
  })
})
