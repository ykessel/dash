import type { DomainEvent } from '../src/common/domain-events'
import { localToday } from '../src/time/periods'
import { createTestApp, resetAll, type TestApp } from './utils/app'
import { captureEvents } from './utils/events'
import { type Signed, twoTeams } from './utils/team'

describe('worklogs', () => {
  let t: TestApp
  let lin: Signed
  let nia: Signed
  let kai: Signed
  let wsA: string
  let base: string
  let baseB: string
  let events: DomainEvent[]
  beforeAll(async () => { t = await createTestApp(); events = captureEvents(t) })
  beforeEach(async () => {
    await resetAll(t)
    ;({ lin, nia, kai, wsA, base, baseB } = await twoTeams(t))
    events.length = 0
  })
  afterAll(() => t.app.close())

  const today = () => localToday('UTC', t.clock.now())
  const shift = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
  const project = async (name = 'Tide') =>
    (await t.http.post(`${base}/projects`).set(lin.auth).send({ name, hue: 'teal', icon: 'leaf', due: '2026-12-01' }).expect(201)).body
  /** A task of `p` assigned to `who`, moved to `status`. */
  const task = async (projectId: string, who: Signed = nia, status = 'progress', estimate = 3) => {
    const x = (await t.http.post(`${base}/tasks`).set(lin.auth).send({ title: 'Ship it', project: projectId, assignee: who.user.id, estimate }).expect(201)).body
    if (status !== 'todo') await t.http.post(`${base}/tasks/${x.id}/move`).set(lin.auth).send({ status }).expect(200)
    return x
  }
  const log = (who: Signed, taskId: string, body: object) => t.http.post(`${base}/tasks/${taskId}/worklogs`).set(who.auth).send({ date: today(), ...body })
  const view = async (taskId: string) => (await t.http.get(`${base}/tasks/${taskId}`).set(lin.auth).expect(200)).body
  const roleIds = async (): Promise<Record<string, string>> => {
    const rows: { id: string; key: string }[] = await t.db.query(`SELECT id, key FROM project_roles WHERE workspace_id = $1 AND key IS NOT NULL`, [wsA])
    return Object.fromEntries(rows.map(r => [r.key, r.id]))
  }
  const give = (projectId: string, roleId: string) =>
    t.http.put(`${base}/projects/${projectId}/members/${nia.user.id}`).set(lin.auth).send({ roleId }).expect(200)

  it('the assignee logs time on a task in progress; the task view shows the totals', async () => {
    const p = await project()
    const x = await task(p.id)
    const res = await log(nia, x.id, { minutes: 90, comment: 'pairing' }).expect(201)
    expect(res.body.worklog).toMatchObject({ task: x.id, project: p.id, user: nia.user.id, date: today(), minutes: 90, comment: 'pairing' })
    expect(res.body.task).toMatchObject({ loggedMinutes: 90, remainingMinutes: 90 })
    expect(await view(x.id)).toMatchObject({ loggedMinutes: 90, remainingMinutes: 90 })
  })

  it('logging on a task in todo or done is 409 task_not_in_progress; review is allowed', async () => {
    const p = await project()
    expect((await log(nia, (await task(p.id, nia, 'todo')).id, { minutes: 30 }).expect(409)).body.code).toBe('task_not_in_progress')
    expect((await log(nia, (await task(p.id, nia, 'done')).id, { minutes: 30 }).expect(409)).body.code).toBe('task_not_in_progress')
    await log(nia, (await task(p.id, nia, 'review')).id, { minutes: 30 }).expect(201)
  })

  it("someone who isn't the assignee is 403 not_assignee", async () => {
    const p = await project()
    const x = await task(p.id)
    expect((await log(lin, x.id, { minutes: 30 }).expect(403)).body.code).toBe('not_assignee')
  })

  it("a viewer can't log: 403 forbidden", async () => {
    const p = await project()
    const x = await task(p.id)
    await give(p.id, (await roleIds()).viewer)
    expect((await log(nia, x.id, { minutes: 30 }).expect(403)).body.code).toBe('forbidden')
  })

  it("a future date is 400 future_date; the member's tz decides today", async () => {
    const p = await project()
    const x = await task(p.id)
    await t.db.query(`UPDATE memberships SET tz = 'Pacific/Kiritimati' WHERE workspace_id = $1 AND user_id = $2`, [wsA, nia.user.id])
    const hers = localToday('Pacific/Kiritimati', t.clock.now())
    await log(nia, x.id, { minutes: 30, date: hers }).expect(201)
    const res = await log(nia, x.id, { minutes: 30, date: shift(hers, 1) }).expect(400)
    expect(res.body).toMatchObject({ code: 'future_date', field: 'workDate' })
  })

  it('the day cap counts every project and ignores deleted ones', async () => {
    const a = await task((await project('A')).id)
    const b = await task((await project('B')).id)
    await log(nia, a.id, { minutes: 1000 }).expect(201)
    const onB = (await log(nia, b.id, { minutes: 400 }).expect(201)).body.worklog
    const res = await log(nia, b.id, { minutes: 100 }).expect(422)
    expect(res.body).toMatchObject({ code: 'day_over_24h', field: 'minutes' })
    await t.db.query(`UPDATE tasks SET deleted_at = now() WHERE id = $1`, [a.id])
    await log(nia, b.id, { minutes: 100 }).expect(201)
    expect((await t.http.patch(`${base}/worklogs/${onB.id}`).set(nia.auth).send({ minutes: 1400 }).expect(422)).body.code).toBe('day_over_24h')
  })

  it('minutes outside 1..1440 is 400 invalid on minutes', async () => {
    const x = await task((await project()).id)
    expect((await log(nia, x.id, { minutes: 0 }).expect(400)).body).toMatchObject({ code: 'invalid', field: 'minutes' })
    expect((await log(nia, x.id, { minutes: 1441 }).expect(400)).body).toMatchObject({ code: 'invalid', field: 'minutes' })
  })

  it('remaining: an explicit value is kept and later logs move it', async () => {
    const x = await task((await project()).id)
    expect((await log(nia, x.id, { minutes: 30, remaining: 60 }).expect(201)).body.task.remainingMinutes).toBe(60)
    const second = (await log(nia, x.id, { minutes: 30 }).expect(201)).body
    expect(second.task.remainingMinutes).toBe(30)
    await t.http.delete(`${base}/worklogs/${second.worklog.id}`).set(nia.auth).expect(204)
    expect((await view(x.id)).remainingMinutes).toBe(60)
  })

  it("without time.view_all you see only your own worklogs; totals count everyone's", async () => {
    const p = await project()
    const x = await task(p.id)
    await log(nia, x.id, { minutes: 30 }).expect(201)
    await t.db.query(
      `INSERT INTO worklogs (workspace_id, project_id, task_id, user_id, work_date, minutes) VALUES ($1, $2, $3, $4, $5, 45)`,
      [wsA, p.id, x.id, lin.user.id, today()])
    const mine = (await t.http.get(`${base}/tasks/${x.id}/worklogs`).set(nia.auth).expect(200)).body
    expect(mine.map((w: { user: string }) => w.user)).toEqual([nia.user.id])
    expect((await t.http.get(`${base}/tasks/${x.id}`).set(nia.auth).expect(200)).body.loggedMinutes).toBe(75)
    expect((await t.http.get(`${base}/tasks/${x.id}/worklogs`).set(lin.auth).expect(200)).body).toHaveLength(2)
  })

  it("editing your own needs edit_own; others' need edit_any", async () => {
    const p = await project()
    const x = await task(p.id)
    const w = (await log(nia, x.id, { minutes: 30 }).expect(201)).body.worklog
    const logOnly = (await t.http.post(`${base}/roles`).set(lin.auth).send({ name: 'Loggers', permissions: ['time.log'] }).expect(201)).body.id
    await give(p.id, logOnly)
    await t.http.patch(`${base}/worklogs/${w.id}`).set(nia.auth).send({ minutes: 40 }).expect(403)
    await t.http.delete(`${base}/worklogs/${w.id}`).set(nia.auth).expect(403)
    const res = await t.http.patch(`${base}/worklogs/${w.id}`).set(lin.auth).send({ minutes: 40, comment: 'fixed' }).expect(200)
    expect(res.body.worklog).toMatchObject({ minutes: 40, comment: 'fixed' })
    expect(res.body.task.loggedMinutes).toBe(40)
  })

  it('worklog events go to the author and to time holders only; the workspace hears time_changed', async () => {
    const x = await task((await project()).id)
    events.length = 0
    await log(nia, x.id, { minutes: 30 }).expect(201)
    const created = events.filter(e => e.type === 'worklog.created')
    expect(created.every(e => e.toUser)).toBe(true)
    expect(new Set(created.map(e => e.toUser))).toEqual(new Set([nia.user.id, lin.user.id]))
    const changed = events.filter(e => e.type === 'task.time_changed')
    expect(changed).toHaveLength(1)
    expect(changed[0].toUser).toBeUndefined()
    expect(changed[0].data).toMatchObject({ taskId: x.id, loggedMinutes: 30, remainingMinutes: 150 })
  })

  it("another workspace's worklog is 404 worklog_not_found", async () => {
    const x = await task((await project()).id)
    const w = (await log(nia, x.id, { minutes: 30 }).expect(201)).body.worklog
    expect((await t.http.patch(`${baseB}/worklogs/${w.id}`).set(kai.auth).send({ minutes: 10 }).expect(404)).body.code).toBe('worklog_not_found')
    await t.http.get(`${baseB}/tasks/${x.id}/worklogs`).set(kai.auth).expect(404)
  })

  it('a worklog of a deleted task is 404, and logging on it is 404', async () => {
    const x = await task((await project()).id)
    const w = (await log(nia, x.id, { minutes: 30 }).expect(201)).body.worklog
    await t.db.query(`UPDATE tasks SET deleted_at = now() WHERE id = $1`, [x.id])
    await log(nia, x.id, { minutes: 30 }).expect(404)
    await t.http.patch(`${base}/worklogs/${w.id}`).set(nia.auth).send({ minutes: 10 }).expect(404)
  })
})
