import type { DomainEvent } from '../src/common/domain-events'
import { createTestApp, resetAll, type TestApp } from './utils/app'
import { captureEvents } from './utils/events'
import { type Signed, twoTeams } from './utils/team'

describe('calendar', () => {
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

  const url = (id = '') => `${base}/events${id ? `/${id}` : ''}`
  const standup = { title: 'Standup', date: '2026-11-02', start: 570, dur: 15, kind: 'team', hue: 'blue' }
  const create = async (body: object = {}) => (await t.http.post(url()).set(lin.auth).send({ ...standup, ...body }).expect(201)).body
  const range = (from: string, to: string) => t.http.get(`${url()}?from=${from}&to=${to}`).set(nia.auth)

  it('creates an event with the frontend CalEvent shape and lists it by date range', async () => {
    const e = await create({ people: [nia.user.id] })
    expect(e).toEqual({ id: expect.any(String), ...standup, where: '', people: [nia.user.id] })
    await create({ title: 'Later', date: '2026-11-20' })
    const list = (await range('2026-11-01', '2026-11-02').expect(200)).body
    expect(list).toEqual([e])
    expect((await range('2026-11-03', '2026-11-19').expect(200)).body).toEqual([])
  })

  it('people or a project from another workspace is 400 invalid; a project of mine is kept', async () => {
    const mine = (await t.http.post(`${base}/projects`).set(lin.auth).send({ name: 'Tide', hue: 'teal', icon: 'leaf', due: '2026-12-01' })).body.id
    const theirs = (await t.http.post(`${baseB}/projects`).set(kai.auth).send({ name: 'B', hue: 'blue', icon: 'grid', due: '2026-12-01' })).body.id
    expect((await t.http.post(url()).set(lin.auth).send({ ...standup, people: [kai.user.id] }).expect(400)).body).toMatchObject({ code: 'invalid', field: 'people' })
    expect((await t.http.post(url()).set(lin.auth).send({ ...standup, project: theirs }).expect(400)).body).toMatchObject({ code: 'invalid', field: 'project' })
    const e = await create({ project: mine })
    expect(e.project).toBe(mine)
    expect((await t.http.patch(url(e.id)).set(lin.auth).send({ people: [kai.user.id] }).expect(400)).body.field).toBe('people')
    expect((await t.db.query(`SELECT count(*)::int AS n FROM events`))[0].n).toBe(1)
  })

  it('edits an event and replaces its people', async () => {
    const e = await create({ people: [lin.user.id] })
    const res = await t.http.patch(url(e.id)).set(nia.auth).send({ start: 600, where: 'Room 2', people: [nia.user.id] }).expect(200)
    expect(res.body).toMatchObject({ id: e.id, start: 600, where: 'Room 2', people: [nia.user.id], title: 'Standup' })
  })

  it('delete hides an event; restore brings it back', async () => {
    const e = await create()
    await t.http.delete(url(e.id)).set(lin.auth).expect(204)
    expect((await range('2026-11-01', '2026-11-30')).body).toEqual([])
    expect((await t.http.patch(url(e.id)).set(lin.auth).send({ title: 'x' }).expect(404)).body.code).toBe('event_not_found')
    const back = (await t.http.post(`${url(e.id)}/restore`).set(lin.auth).expect(200)).body
    expect(back).toEqual(e)
    expect((await range('2026-11-01', '2026-11-30')).body).toEqual([e])
  })

  it('an event of another workspace is 404 event_not_found', async () => {
    const other = (await t.http.post(`${baseB}/events`).set(kai.auth).send(standup).expect(201)).body
    expect((await t.http.patch(url(other.id)).set(lin.auth).send({ title: 'x' }).expect(404)).body.code).toBe('event_not_found')
    expect((await t.http.delete(url(other.id)).set(lin.auth).expect(404)).body.code).toBe('event_not_found')
  })

  it('a missing, inverted or over-a-year range is 400', async () => {
    expect((await t.http.get(`${url()}?to=2026-11-02`).set(lin.auth).expect(400)).body.field).toBe('from')
    expect((await range('2026-11-05', '2026-11-01').expect(400)).body).toMatchObject({ code: 'invalid', field: 'to' })
    expect((await range('2026-01-01', '2027-01-03').expect(400)).body).toMatchObject({ code: 'invalid', field: 'to' })
    await range('2026-01-01', '2027-01-02').expect(200)
  })

  it('bad input is 400 with the field', async () => {
    const cases: [object, string][] = [
      [{ start: 1440 }, 'start'], [{ dur: 4 }, 'dur'], [{ dur: 1441 }, 'dur'], [{ kind: 'party' }, 'kind'],
      [{ hue: 'red' }, 'hue'], [{ date: '2026-13-01' }, 'date'], [{ title: '' }, 'title'],
    ]
    for (const [body, field] of cases) expect((await t.http.post(url()).set(lin.auth).send({ ...standup, ...body }).expect(400)).body.field).toBe(field)
  })

  it('publishes event.created / updated / deleted, and restore publishes event.created', async () => {
    const e = await create()
    await t.http.patch(url(e.id)).set(lin.auth).send({ title: 'Sync' }).expect(200)
    await t.http.delete(url(e.id)).set(lin.auth).expect(204)
    await t.http.post(`${url(e.id)}/restore`).set(lin.auth).expect(200)
    expect(events.map(x => x.type)).toEqual(['event.created', 'event.updated', 'event.deleted', 'event.created'])
    expect(events[1].data.event).toMatchObject({ id: e.id, title: 'Sync' })
    expect(events[2].data).toEqual({ id: e.id })
  })
})
