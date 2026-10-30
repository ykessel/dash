import { localToday, periodStart } from '../src/time/periods'
import { createTestApp, resetAll, type TestApp } from './utils/app'
import { type Signed, twoTeams } from './utils/team'

describe('timesheet and time reports', () => {
  let t: TestApp
  let lin: Signed
  let nia: Signed
  let kai: Signed
  let wsA: string
  let base: string
  let baseB: string
  beforeAll(async () => { t = await createTestApp() })
  beforeEach(async () => {
    await resetAll(t)
    ;({ lin, nia, kai, wsA, base, baseB } = await twoTeams(t))
  })
  afterAll(() => t.app.close())

  const today = () => localToday('UTC', t.clock.now())
  const shift = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
  const project = async (name: string) =>
    (await t.http.post(`${base}/projects`).set(lin.auth).send({ name, hue: 'teal', icon: 'leaf', due: '2026-12-01' }).expect(201)).body
  const task = async (projectId: string, title = 'Ship it') =>
    (await t.http.post(`${base}/tasks`).set(lin.auth).send({ title, project: projectId, assignee: nia.user.id }).expect(201)).body
  /** Worklogs straight into the table: reports read history, not the logging rules. */
  const worklog = (p: string, x: string, user: string, date: string, minutes: number) =>
    t.db.query(`INSERT INTO worklogs (workspace_id, project_id, task_id, user_id, work_date, minutes) VALUES ($1, $2, $3, $4, $5, $6)`,
      [wsA, p, x, user, date, minutes])
  const report = (who: Signed, q: Record<string, string>) =>
    t.http.get(`${base}/time-reports`).query({ from: shift(today(), -30), to: today(), ...q }).set(who.auth)

  it('my report by project per week sums my worklogs', async () => {
    const a = await project('Alpha')
    const b = await project('Beta')
    const xa = await task(a.id)
    const xb = await task(b.id)
    await worklog(a.id, xa.id, nia.user.id, today(), 60)
    await worklog(a.id, xa.id, nia.user.id, today(), 30)
    await worklog(b.id, xb.id, nia.user.id, today(), 45)
    await worklog(b.id, xb.id, lin.user.id, today(), 500)
    const res = (await report(nia, { groupBy: 'project', bucket: 'week', scope: 'me' }).expect(200)).body
    const wk = periodStart(today(), 'week')
    expect(res.total).toBe(135)
    expect(res.buckets).toContain(wk)
    expect(res.rows).toEqual([
      { key: a.id, label: 'Alpha', minutes: { [wk]: 90 }, total: 90 },
      { key: b.id, label: 'Beta', minutes: { [wk]: 45 }, total: 45 },
    ])
  })

  it("team scope needs time.view_all: a member sees only their own rows, the owner sees everyone's", async () => {
    const a = await project('Alpha')
    const x = await task(a.id)
    await worklog(a.id, x.id, nia.user.id, today(), 60)
    await worklog(a.id, x.id, lin.user.id, today(), 30)
    const mine = (await report(nia, { groupBy: 'user', bucket: 'day', scope: 'team' }).expect(200)).body
    expect(mine.total).toBe(0)
    const all = (await report(lin, { groupBy: 'user', bucket: 'day', scope: 'team' }).expect(200)).body
    expect(all.rows.map((r: { key: string; total: number }) => [r.key, r.total])).toEqual([[nia.user.id, 60], [lin.user.id, 30]])
  })

  it('approvedOnly keeps only approved periods', async () => {
    const a = await project('Alpha')
    const x = await task(a.id)
    const wk = periodStart(today(), 'week')
    const old = shift(wk, -7)
    await worklog(a.id, x.id, nia.user.id, shift(old, 1), 60)
    await worklog(a.id, x.id, nia.user.id, today(), 30)
    await t.db.query(`UPDATE projects SET approval_enabled = true WHERE id = $1`, [a.id])
    await t.db.query(
      `INSERT INTO timesheet_periods (workspace_id, project_id, user_id, period_start, period_end, period, status)
       VALUES ($1, $2, $3, $4, $5, 'week', 'approved')`, [wsA, a.id, nia.user.id, old, shift(old, 6)])
    expect((await report(nia, { groupBy: 'task', bucket: 'month', approvedOnly: 'true' }).expect(200)).body.total).toBe(60)
    expect((await report(nia, { groupBy: 'task', bucket: 'month' }).expect(200)).body.total).toBe(90)
  })

  it('worklogs of deleted tasks are left out', async () => {
    const a = await project('Alpha')
    const x = await task(a.id)
    await worklog(a.id, x.id, nia.user.id, today(), 60)
    await t.db.query(`UPDATE tasks SET deleted_at = now() WHERE id = $1`, [x.id])
    expect((await report(nia, { groupBy: 'task', bucket: 'day' }).expect(200)).body.total).toBe(0)
  })

  it('csv has the header and hours with 2 decimals', async () => {
    const a = await project('Alpha, Inc')
    const x = await task(a.id)
    await worklog(a.id, x.id, nia.user.id, today(), 50)
    const res = await t.http.get(`${base}/time-reports.csv`)
      .query({ from: today(), to: today(), groupBy: 'project', bucket: 'day' }).set(nia.auth).expect(200)
    expect(res.headers['content-type']).toContain('text/csv')
    expect(res.headers['content-disposition']).toContain(`pane-time-${today()}-${today()}.csv`)
    expect(res.text.split('\n')).toEqual(['group,period,hours', `"Alpha, Inc",${today()},0.83`])
  })

  it('a user from another workspace sees nothing', async () => {
    const a = await project('Alpha')
    const x = await task(a.id)
    await worklog(a.id, x.id, nia.user.id, today(), 60)
    const theirs = (await t.http.get(`${baseB}/time-reports`).query({ from: today(), to: today(), scope: 'team' }).set(kai.auth).expect(200)).body
    expect(theirs.total).toBe(0)
    const res = await t.http.get(`${base}/time-reports`).query({ from: today(), to: today() }).set(kai.auth)
    expect([403, 404]).toContain(res.status)
    const sheet = await t.http.get(`${base}/timesheet`).query({ from: today(), to: today() }).set(kai.auth)
    expect([403, 404]).toContain(sheet.status)
  })

  it('timesheet: me returns mine with tasks and periods; team returns only view_all projects', async () => {
    const a = await project('Alpha')
    const x = await task(a.id, 'Write docs')
    await worklog(a.id, x.id, nia.user.id, today(), 60)
    await worklog(a.id, x.id, lin.user.id, today(), 30)
    const mine = (await t.http.get(`${base}/timesheet`).query({ from: today(), to: today() }).set(nia.auth).expect(200)).body
    expect(mine.worklogs.map((w: { minutes: number }) => w.minutes)).toEqual([60])
    expect(mine.tasks).toEqual([{ id: x.id, title: 'Write docs', project: a.id, status: 'todo', assignee: nia.user.id }])
    expect(mine.periods).toEqual([])
    const team = (await t.http.get(`${base}/timesheet`).query({ from: today(), to: today(), user: 'team' }).set(nia.auth).expect(200)).body
    expect(team.worklogs).toEqual([])
    const lead = (await t.http.get(`${base}/timesheet`).query({ from: today(), to: today(), user: 'team' }).set(lin.auth).expect(200)).body
    expect(lead.worklogs).toHaveLength(2)
    const one = (await t.http.get(`${base}/timesheet`).query({ from: today(), to: today(), user: nia.user.id }).set(lin.auth).expect(200)).body
    expect(one.worklogs.map((w: { user: string }) => w.user)).toEqual([nia.user.id])
  })

  it('a range over the limit is 400 invalid on range', async () => {
    const sheet = await t.http.get(`${base}/timesheet`).query({ from: shift(today(), -70), to: today() }).set(nia.auth).expect(400)
    expect(sheet.body).toMatchObject({ code: 'invalid', field: 'range' })
    const rep = await report(nia, { from: shift(today(), -800) }).expect(400)
    expect(rep.body).toMatchObject({ code: 'invalid', field: 'range' })
  })
})
