import { createTestApp, resetAll, type TestApp } from './utils/app'
import { dayAgo, daysAgo, finishedAt, focusAt, localAt, localToday } from './utils/history'
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
})
