import type { DomainEvent } from '../src/common/domain-events'
import { createTestApp, resetAll, type TestApp } from './utils/app'
import { captureEvents } from './utils/events'
import { type Signed, twoTeams } from './utils/team'

describe('focus sessions', () => {
  let t: TestApp
  let events: DomainEvent[]
  let lin: Signed
  let nia: Signed
  let kai: Signed
  let base: string
  let baseB: string
  beforeAll(async () => { t = await createTestApp(); events = captureEvents(t) })
  beforeEach(async () => {
    await resetAll(t)
    ;({ lin, nia, kai, base, baseB } = await twoTeams(t))
    events.length = 0
  })
  afterAll(() => t.app.close())

  const url = (id = '') => `${base}/focus-sessions${id ? `/${id}` : ''}`
  const me = async (who: Signed) =>
    ((await t.http.get(`${base}/members`).set(who.auth)).body as { id: string; presence: string; note?: string }[]).find(p => p.id === who.user.id)!

  it('starting focus sets my presence to focus with the label; ending it returns me online and logs minutes by day', async () => {
    const s = (await t.http.post(url()).set(nia.auth).send({ plannedSec: 1500, label: 'Deep work' }).expect(201)).body
    expect(s).toMatchObject({ id: expect.any(String), plannedSec: 1500, label: 'Deep work' })
    expect(await me(nia)).toMatchObject({ presence: 'focus', note: 'Deep work' })
    expect(events.map(e => e.type)).toEqual(['presence.changed'])
    await t.http.patch(url(s.id)).set(nia.auth).send({ actualSec: 1260 }).expect(200)
    expect((await me(nia)).presence).toBe('online')
    const s2 = (await t.http.post(url()).set(nia.auth).send({ plannedSec: 600 }).expect(201)).body
    expect((await me(nia)).note).toBe('10-minute block')
    await t.http.patch(url(s2.id)).set(nia.auth).send({ actualSec: 600 }).expect(200)
    const today = new Date().toISOString().slice(0, 10)
    const log = (await t.http.get(`${url()}?from=${today}&to=${today}`).set(nia.auth).expect(200)).body
    expect(log).toEqual([{ date: today, minutes: 31 }])
    expect((await t.http.get(`${url()}?from=${today}&to=${today}`).set(lin.auth)).body).toEqual([])
  })

  it('ending focus after I changed my presence leaves it alone', async () => {
    const s = (await t.http.post(url()).set(nia.auth).send({ plannedSec: 1500 }).expect(201)).body
    await t.http.patch(`${base}/members/me/presence`).set(nia.auth).send({ presence: 'meeting' }).expect(200)
    await t.http.patch(url(s.id)).set(nia.auth).send({ actualSec: 300 }).expect(200)
    expect((await me(nia)).presence).toBe('meeting')
  })

  it('a focus taskId from another workspace is 400 invalid', async () => {
    const pB = (await t.http.post(`${baseB}/projects`).set(kai.auth).send({ name: 'B', hue: 'blue', icon: 'grid', due: '2026-12-01' })).body.id
    const taskB = (await t.http.post(`${baseB}/tasks`).set(kai.auth).send({ title: 'B', project: pB })).body.id
    const res = await t.http.post(url()).set(lin.auth).send({ plannedSec: 1500, taskId: taskB }).expect(400)
    expect(res.body).toMatchObject({ code: 'invalid', field: 'taskId' })
    expect((await t.db.query(`SELECT count(*)::int AS n FROM focus_sessions`))[0].n).toBe(0)
  })

  it('ending someone else’s session is 404 focus_not_found; ending twice is 409 focus_ended', async () => {
    const s = (await t.http.post(url()).set(nia.auth).send({ plannedSec: 1500 }).expect(201)).body
    expect((await t.http.patch(url(s.id)).set(lin.auth).send({ actualSec: 10 }).expect(404)).body.code).toBe('focus_not_found')
    await t.http.patch(url(s.id)).set(nia.auth).send({ actualSec: 10 }).expect(200)
    expect((await t.http.patch(url(s.id)).set(nia.auth).send({ actualSec: 10 }).expect(409)).body.code).toBe('focus_ended')
  })

  it('bad input is 400 with the field', async () => {
    expect((await t.http.post(url()).set(lin.auth).send({ plannedSec: 59 }).expect(400)).body.field).toBe('plannedSec')
    expect((await t.http.post(url()).set(lin.auth).send({ plannedSec: 14401 }).expect(400)).body.field).toBe('plannedSec')
    const s = (await t.http.post(url()).set(lin.auth).send({ plannedSec: 600 }).expect(201)).body
    expect((await t.http.patch(url(s.id)).set(lin.auth).send({ actualSec: -1 }).expect(400)).body.field).toBe('actualSec')
  })
})
