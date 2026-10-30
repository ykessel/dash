import { localToday, periodEnd, periodStart } from '../src/time/periods'
import { createTestApp, resetAll, type TestApp } from './utils/app'
import { type Signed, twoTeams } from './utils/team'

describe('worklogs around tasks and people', () => {
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

  const today = () => localToday('UTC', t.clock.now())
  const project = async (name = 'Tide') =>
    (await t.http.post(`${base}/projects`).set(lin.auth).send({ name, hue: 'teal', icon: 'leaf', due: '2026-12-01' }).expect(201)).body
  const task = async (projectId: string) => {
    const x = (await t.http.post(`${base}/tasks`).set(lin.auth).send({ title: 'Ship it', project: projectId, assignee: nia.user.id }).expect(201)).body
    return (await t.http.post(`${base}/tasks/${x.id}/move`).set(lin.auth).send({ status: 'progress' }).expect(200)).body
  }
  const log = (taskId: string, minutes: number) =>
    t.http.post(`${base}/tasks/${taskId}/worklogs`).set(nia.auth).send({ minutes, date: today() }).expect(201)
  /** Turns approval on for the project and stores a period row for nia covering today. */
  const lockToday = async (projectId: string, status: 'submitted' | 'approved' = 'submitted') => {
    await t.db.query(`UPDATE projects SET approval_enabled = true WHERE id = $1`, [projectId])
    const start = periodStart(today(), 'week')
    await t.db.query(
      `INSERT INTO timesheet_periods (workspace_id, project_id, user_id, period_start, period_end, period, status)
       VALUES ($1, $2, $3, $4, $5, 'week', $6)`, [wsA, projectId, nia.user.id, start, periodEnd(start, 'week'), status])
  }
  const version = async (id: string) => (await t.http.get(`${base}/tasks/${id}`).set(lin.auth).expect(200)).body.version

  it('moving a task to another project moves its worklogs', async () => {
    const from = await project('A')
    const to = await project('B')
    const x = await task(from.id)
    await log(x.id, 30)
    await t.http.patch(`${base}/tasks/${x.id}`).set(lin.auth).send({ version: await version(x.id), project: to.id }).expect(200)
    const rows = await t.db.query(`SELECT project_id FROM worklogs WHERE task_id = $1`, [x.id])
    expect(rows.map((r: { project_id: string }) => r.project_id)).toEqual([to.id])
  })

  it("a task with time in a submitted period can't change project or be deleted: 409 task_has_locked_time", async () => {
    const from = await project('A')
    const to = await project('B')
    const x = await task(from.id)
    await log(x.id, 30)
    await lockToday(from.id)
    const moved = await t.http.patch(`${base}/tasks/${x.id}`).set(lin.auth).send({ version: await version(x.id), project: to.id }).expect(409)
    expect(moved.body.code).toBe('task_has_locked_time')
    expect((await t.http.delete(`${base}/tasks/${x.id}`).set(lin.auth).expect(409)).body.code).toBe('task_has_locked_time')
    expect((await t.http.get(`${base}/tasks/${x.id}`).set(lin.auth).expect(200)).body.project).toBe(from.id)
  })

  it('deleting a task hides its worklogs from the cap; restoring brings them back', async () => {
    const p = await project()
    const a = await task(p.id)
    const b = await task(p.id)
    await log(a.id, 1000)
    await t.http.post(`${base}/tasks/${b.id}/worklogs`).set(nia.auth).send({ minutes: 500, date: today() }).expect(422)
    await t.http.delete(`${base}/tasks/${a.id}`).set(lin.auth).expect(204)
    await log(b.id, 500)
    await t.http.post(`${base}/tasks/${a.id}/restore`).set(lin.auth).expect(200)
    expect((await t.http.get(`${base}/tasks/${a.id}`).set(lin.auth).expect(200)).body.loggedMinutes).toBe(1000)
  })

  it('someone who leaves keeps their worklogs and loses their pending submissions', async () => {
    const p = await project('A')
    const q = await project('B')
    const x = await task(p.id)
    await log(x.id, 30)
    await lockToday(p.id, 'submitted')
    await lockToday(q.id, 'approved')
    await t.http.delete(`${base}/members/${nia.user.id}`).set(nia.auth).expect(204)
    expect(await t.db.query(`SELECT 1 FROM worklogs WHERE user_id = $1`, [nia.user.id])).toHaveLength(1)
    const periods = await t.db.query(`SELECT status FROM timesheet_periods WHERE user_id = $1`, [nia.user.id])
    expect(periods.map((r: { status: string }) => r.status)).toEqual(['approved'])
  })
})
