import { createTestApp, resetAll, type TestApp } from './utils/app'
import { createdAt, dayAgo, daysAgo, finishedAt, focusAt, localAt, localToday } from './utils/history'
import { type Signed, twoTeams } from './utils/team'

describe('insights', () => {
  let t: TestApp
  let lin: Signed
  let nia: Signed
  let kai: Signed
  let wsA: string
  let wsB: string
  let base: string
  let baseB: string
  let projectId: string
  beforeAll(async () => { t = await createTestApp() })
  beforeEach(async () => {
    await resetAll(t)
    ;({ lin, nia, kai, wsA, wsB, base, baseB } = await twoTeams(t))
    projectId = (await t.http.post(`${base}/projects`).set(lin.auth).send({ name: 'Tide', hue: 'teal', icon: 'leaf', due: '2026-12-01' })).body.id
  })
  afterAll(() => t.app.close())

  const task = async (title: string, body: object = {}, root = base, who: Signed = lin, project = projectId) =>
    (await t.http.post(`${root}/tasks`).set(who.auth).send({ title, project, ...body }).expect(201)).body as { id: string }
  const insights = async (range?: string, who: Signed = lin) =>
    (await t.http.get(`${base}/insights${range ? `?range=${range}` : ''}`).set(who.auth).expect(200)).body

  describe('window and daily series', () => {
    it('range defaults to 30d; days run oldest → today in my tz', async () => {
      const r = await insights()
      expect(r.range).toBe(30)
      expect(r.days).toHaveLength(30)
      expect(r.days[29]).toBe(dayAgo(0))
      expect(r.days[0]).toBe(dayAgo(29))
      expect(r.throughput).toEqual({ current: Array(30).fill(0), previous: Array(30).fill(0), total: 0, previousTotal: 0 })
      expect((await insights('7d')).days).toHaveLength(7)
      expect((await insights('90d')).days).toHaveLength(90)
    })

    it('a bad range is 400 invalid on field range', async () => {
      for (const bad of ['14d', 'abc', '7']) {
        const res = await t.http.get(`${base}/insights?range=${bad}`).set(lin.auth).expect(400)
        expect(res.body).toMatchObject({ code: 'invalid', field: 'range' })
      }
    })

    it('throughput counts each task once per day it entered done; deleted tasks do not count', async () => {
      const a = await task('a')
      const b = await task('b')
      const c = await task('c')
      await finishedAt(t, a.id, lin.user.id, daysAgo(0, 9))
      await finishedAt(t, a.id, lin.user.id, daysAgo(0, 11)) // reopened and closed again the same day
      await finishedAt(t, b.id, nia.user.id, daysAgo(0, 10))
      await finishedAt(t, c.id, nia.user.id, daysAgo(1))
      await finishedAt(t, c.id, nia.user.id, daysAgo(0))
      await t.http.delete(`${base}/tasks/${c.id}`).set(lin.auth).expect(204)
      const r = await insights('7d')
      expect(r.throughput.current).toEqual([0, 0, 0, 0, 0, 0, 2])
      expect(r.throughput.total).toBe(2)
    })

    it('a task finished 23:30 in America/Havana counts on the local day', async () => {
      const tz = 'America/Havana'
      await t.db.query(`UPDATE memberships SET tz = $1 WHERE user_id = $2`, [tz, lin.user.id])
      const today = await localToday(t, tz)
      const day = new Date(Date.parse(`${today}T00:00:00Z`) - 2 * 86_400_000).toISOString().slice(0, 10)
      const late = await localAt(t, day, '23:30', tz)
      expect(late.toISOString().slice(0, 10)).not.toBe(day) // the UTC date is already the next day
      const a = await task('a')
      await finishedAt(t, a.id, lin.user.id, late)
      const r = await insights('7d')
      expect(r.days[6]).toBe(today)
      expect(r.days[4]).toBe(day)
      expect(r.throughput.current[4]).toBe(1)
      expect(r.throughput.total).toBe(1)
    })

    it('previous period covers the n days before the window', async () => {
      const a = await task('a')
      await finishedAt(t, a.id, lin.user.id, daysAgo(8))
      const r = await insights('7d')
      expect(r.throughput.total).toBe(0)
      expect(r.throughput.previous).toEqual([0, 0, 0, 0, 0, 1, 0]) // days 13..7 ago; 8 ago is index 5
      expect(r.throughput.previousTotal).toBe(1)
    })

    it('focus hours are the team’s finished sessions per local day', async () => {
      await focusAt(t, wsA, lin.user.id, daysAgo(0, 9), 5400)
      await focusAt(t, wsA, nia.user.id, daysAgo(0, 10), 1800)
      await focusAt(t, wsA, nia.user.id, daysAgo(1), 900)
      await t.db.query(`INSERT INTO focus_sessions (workspace_id, user_id, planned_sec, started_at) VALUES ($1, $2, 1500, $3)`, [wsA, lin.user.id, daysAgo(0, 11)]) // still running
      const r = await insights('7d')
      expect(r.focus.current.slice(5)).toEqual([0.3, 2])
      expect(r.focus.total).toBe(2.3)
    })

    it('another workspace’s activity and focus never count', async () => {
      const pB = (await t.http.post(`${baseB}/projects`).set(kai.auth).send({ name: 'B', hue: 'blue', icon: 'grid', due: '2026-12-01' })).body.id
      const b = await task('b', {}, baseB, kai, pB)
      await finishedAt(t, b.id, kai.user.id, daysAgo(0))
      await focusAt(t, wsB, kai.user.id, daysAgo(0), 3600)
      const r = await insights('7d')
      expect(r.throughput.total).toBe(0)
      expect(r.focus.total).toBe(0)
    })
  })

  describe('finished work', () => {
    it('on-time rate counts finished tasks with a due date; late means finished after the due day', async () => {
      const late = await task('late', { due: dayAgo(2) })
      const ok = await task('ok', { due: dayAgo(0) })
      const noDue = await task('no due')
      for (const x of [late, ok, noDue]) await finishedAt(t, x.id, lin.user.id, daysAgo(0))
      expect((await insights('7d')).onTime).toEqual({ total: 2, late: 1, rate: 50 })
    })

    it('cycle time is the average days from created to done, per period', async () => {
      const a = await task('a')
      const b = await task('b')
      const old = await task('old')
      await createdAt(t, a.id, daysAgo(4))
      await finishedAt(t, a.id, lin.user.id, daysAgo(2))
      await createdAt(t, b.id, daysAgo(5))
      await finishedAt(t, b.id, lin.user.id, daysAgo(1))
      await createdAt(t, old.id, daysAgo(10))
      await finishedAt(t, old.id, lin.user.id, daysAgo(9))
      expect((await insights('7d')).cycle).toEqual({ avgDays: 3, previousAvgDays: 1 })
    })

    it('project share is finished tasks per live project, most first, without zeros', async () => {
      const moss = (await t.http.post(`${base}/projects`).set(lin.auth).send({ name: 'Moss', hue: 'green', icon: 'leaf', due: '2026-12-01' })).body.id
      await t.http.post(`${base}/projects`).set(lin.auth).send({ name: 'Empty', hue: 'pink', icon: 'grid', due: '2026-12-01' })
      for (const p of [moss, moss, projectId]) await finishedAt(t, (await task('x', {}, base, lin, p)).id, lin.user.id, daysAgo(1))
      expect((await insights('7d')).byProject).toEqual([{ project: moss, finished: 2 }, { project: projectId, finished: 1 }])
    })

    it('an empty team gets nulls and empty lists, not errors', async () => {
      const r = await insights('90d')
      expect(r.onTime).toEqual({ total: 0, late: 0, rate: null })
      expect(r.cycle).toEqual({ avgDays: null, previousAvgDays: null })
      expect(r.byProject).toEqual([])
    })

    it('another workspace’s finished tasks never count', async () => {
      const pB = (await t.http.post(`${baseB}/projects`).set(kai.auth).send({ name: 'B', hue: 'blue', icon: 'grid', due: '2026-12-01' })).body.id
      const b = await task('b', { due: dayAgo(3) }, baseB, kai, pB)
      await finishedAt(t, b.id, kai.user.id, daysAgo(0))
      const r = await insights('7d')
      expect(r.onTime.total).toBe(0)
      expect(r.cycle.avgDays).toBeNull()
      expect(r.byProject).toEqual([])
    })
  })

  describe('load today', () => {
    it('workload is open hours per member against capacity, most loaded first', async () => {
      await t.db.query(`UPDATE memberships SET capacity = 10 WHERE user_id = $1`, [nia.user.id])
      await task('l1', { assignee: lin.user.id, estimate: 8 })
      await task('l2', { assignee: lin.user.id, estimate: 4.5 })
      const done = await task('l3', { assignee: lin.user.id, estimate: 20 })
      await finishedAt(t, done.id, lin.user.id, daysAgo(0))
      const gone = await task('l4', { assignee: lin.user.id, estimate: 50 })
      await t.http.delete(`${base}/tasks/${gone.id}`).set(lin.auth).expect(204)
      await task('n1', { assignee: nia.user.id, estimate: 6 })
      await task('nobody', { estimate: 9 })
      expect((await insights()).workload).toEqual([
        { person: nia.user.id, openHours: 6, capacity: 10 },
        { person: lin.user.id, openHours: 12.5, capacity: 32 },
      ])
    })

    it('a member with nothing open shows 0 hours', async () => {
      expect((await insights()).workload).toEqual(expect.arrayContaining([{ person: nia.user.id, openHours: 0, capacity: 32 }]))
    })

    it('stale lists the 3 open tasks quiet the longest, in days since their last activity', async () => {
      const ten = await task('ten')
      const three = await task('three')
      const moved = await task('moved')
      const five = await task('five')
      const done = await task('done')
      await createdAt(t, ten.id, daysAgo(10))
      await createdAt(t, three.id, daysAgo(3))
      await createdAt(t, moved.id, daysAgo(20))
      await t.db.query(`INSERT INTO task_activity (task_id, workspace_id, actor_id, kind, from_status, to_status, at) VALUES ($1, $2, $3, 'status', 'todo', 'progress', $4)`, [moved.id, wsA, lin.user.id, daysAgo(1)])
      await t.db.query(`UPDATE tasks SET status = 'progress' WHERE id = $1`, [moved.id])
      await createdAt(t, five.id, daysAgo(5))
      await createdAt(t, done.id, daysAgo(30))
      await finishedAt(t, done.id, lin.user.id, daysAgo(29))
      expect((await insights()).stale).toEqual([
        { task: ten.id, days: 10 },
        { task: five.id, days: 5 },
        { task: three.id, days: 3 },
      ])
    })
  })

  describe('review fixes', () => {
    it('a task created straight into done counts as finished today', async () => {
      await task('born done', { status: 'done', due: dayAgo(0) })
      const r = await insights('7d')
      expect(r.throughput.current[6]).toBe(1)
      expect(r.onTime).toEqual({ total: 1, late: 0, rate: 100 })
      expect(r.byProject).toEqual([{ project: projectId, finished: 1 }])
      expect(r.cycle.avgDays).toBe(0)
    })

    it('a task closed on two days of the window counts once, on the last day, matching byProject', async () => {
      const a = await task('a')
      await finishedAt(t, a.id, lin.user.id, daysAgo(1))
      await finishedAt(t, a.id, lin.user.id, daysAgo(0))
      const r = await insights('7d')
      expect(r.throughput.current).toEqual([0, 0, 0, 0, 0, 0, 1])
      expect(r.throughput.total).toBe(1)
      expect(r.byProject).toEqual([{ project: projectId, finished: 1 }])
    })

    it('task_activity is indexed by task so cycle and stale lookups do not scan the table', async () => {
      const rows = await t.db.query(`SELECT indexdef FROM pg_indexes WHERE tablename = 'task_activity'`)
      expect(rows.map((r: { indexdef: string }) => r.indexdef).join('\n')).toMatch(/\(task_id, at\)/)
    })

    it('open hours are rounded to one decimal', async () => {
      await task('x', { assignee: nia.user.id, estimate: 0.1 })
      await task('y', { assignee: nia.user.id, estimate: 0.2 })
      expect((await insights()).workload).toEqual(expect.arrayContaining([{ person: nia.user.id, openHours: 0.3, capacity: 32 }]))
    })
  })

  describe('CSV export', () => {
    it('downloads date, finished, previous_period and focus_hours for each day of the window', async () => {
      const a = await task('a')
      await finishedAt(t, a.id, lin.user.id, daysAgo(0))
      await focusAt(t, wsA, nia.user.id, daysAgo(0), 5400)
      const res = await t.http.get(`${base}/insights.csv?range=7d`).set(lin.auth).expect(200)
      expect(res.headers['content-type']).toBe('text/csv; charset=utf-8')
      expect(res.headers['content-disposition']).toBe('attachment; filename="pane-insights-7d.csv"')
      const lines = res.text.split('\n')
      expect(lines).toHaveLength(8)
      expect(lines[0]).toBe('date,finished,previous_period,focus_hours')
      expect(lines[1]).toBe(`${dayAgo(6)},0,0,0`)
      expect(lines[7]).toBe(`${dayAgo(0)},1,0,1.5`)
    })

    it('a bad range is 400 on the CSV route too', async () => {
      const res = await t.http.get(`${base}/insights.csv?range=abc`).set(lin.auth).expect(400)
      expect(res.body).toMatchObject({ code: 'invalid', field: 'range' })
    })
  })
})
