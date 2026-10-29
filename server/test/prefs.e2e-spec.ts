import { createTestApp, resetAll, type TestApp } from './utils/app'
import { type Signed, twoTeams } from './utils/team'

describe('prefs and profile', () => {
  let t: TestApp
  let lin: Signed
  let nia: Signed
  let base: string
  beforeAll(async () => { t = await createTestApp() })
  beforeEach(async () => {
    await resetAll(t)
    ;({ lin, nia, base } = await twoTeams(t))
  })
  afterAll(() => t.app.close())

  const DEFAULTS = {
    notify: { mentions: true, due: true, meetings: true, digest: false, focus: true },
    session: 25,
    pause: 5,
    look: { theme: 'dark', wall: 'ash', accent: 'blue', glass: 'tinted', solid: false },
  }

  it('prefs: defaults, partial merge into notify and look, invalid accent is 400', async () => {
    expect((await t.http.get('/api/v1/me/prefs').set(lin.auth).expect(200)).body).toEqual(DEFAULTS)
    const res = await t.http.patch('/api/v1/me/prefs').set(lin.auth).send({ notify: { digest: true }, look: { accent: 'pink' }, session: 50 }).expect(200)
    const want = { ...DEFAULTS, session: 50, notify: { ...DEFAULTS.notify, digest: true }, look: { ...DEFAULTS.look, accent: 'pink' } }
    expect(res.body).toEqual(want)
    await t.http.patch('/api/v1/me/prefs').set(lin.auth).send({ look: { theme: 'light' } }).expect(200)
    expect((await t.http.get('/api/v1/me/prefs').set(lin.auth)).body).toEqual({ ...want, look: { ...want.look, theme: 'light' } })
    expect((await t.http.get('/api/v1/me/prefs').set(nia.auth)).body).toEqual(DEFAULTS)
    const bad = await t.http.patch('/api/v1/me/prefs').set(lin.auth).send({ look: { accent: 'red' } }).expect(400)
    expect(bad.body).toMatchObject({ code: 'invalid', field: 'look' })
    expect((await t.http.patch('/api/v1/me/prefs').set(lin.auth).send({ session: 0 }).expect(400)).body.field).toBe('session')
  })

  it('PATCH /me renames me and the new name shows in members', async () => {
    const res = await t.http.patch('/api/v1/me').set(nia.auth).send({ name: '  Nia Park ', avatarSkin: 3 }).expect(200)
    expect(res.body).toMatchObject({ id: nia.user.id, name: 'Nia Park', avatarSkin: 3 })
    const people = (await t.http.get(`${base}/members`).set(lin.auth)).body as { id: string; name: string; skin: number }[]
    expect(people.find(p => p.id === nia.user.id)).toMatchObject({ name: 'Nia Park', skin: 3 })
    expect((await t.http.patch('/api/v1/me').set(nia.auth).send({ name: '' }).expect(400)).body.field).toBe('name')
    expect((await t.http.patch('/api/v1/me').set(nia.auth).send({ avatarSkin: 9 }).expect(400)).body.field).toBe('avatarSkin')
  })
})
