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
})
