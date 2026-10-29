import { NotificationsService } from '../src/notifications/notifications.service'
import { createTestApp, resetAll, type TestApp } from './utils/app'
import { closeSockets, connect, nextEvent, noEvent } from './utils/socket'
import { type Signed, twoTeams } from './utils/team'

describe('notifications', () => {
  let t: TestApp
  let lin: Signed
  let nia: Signed
  let kai: Signed
  let wsA: string
  let wsB: string
  let base: string
  beforeAll(async () => { t = await createTestApp() })
  beforeEach(async () => {
    await resetAll(t)
    ;({ lin, nia, kai, wsA, wsB, base } = await twoTeams(t))
  })
  afterEach(() => closeSockets())
  afterAll(() => t.app.close())

  const notify = (ws: string, to: Signed, from: Signed, text: string) =>
    t.app.get(NotificationsService).create(ws, to.user.id, { userId: from.user.id }, 'assigned', text)

  it('a notice reaches only its recipient’s sockets', async () => {
    const [linS, niaS, kaiS] = await Promise.all([connect(t, lin.token), connect(t, nia.token), connect(t, kai.token)])
    const seen = nextEvent(niaS, 'notification.created')
    await notify(wsA, nia, lin, 'Lin assigned you “Ship it”')
    expect(await seen).toMatchObject({
      by: lin.user.id,
      notice: { id: expect.any(String), who: lin.user.id, text: 'Lin assigned you “Ship it”', at: expect.any(Number), read: false, to: nia.user.id },
    })
    await Promise.all([noEvent(linS, 'notification.created'), noEvent(kaiS, 'notification.created')])
  })

  it('lists only my notices in this workspace, newest first', async () => {
    await notify(wsA, nia, lin, 'first')
    t.clock.advance(1000)
    await notify(wsA, nia, lin, 'second')
    await notify(wsA, lin, nia, 'for lin')
    await notify(wsB, kai, kai, 'other team')
    const mine = (await t.http.get(`${base}/notifications`).set(nia.auth).expect(200)).body
    expect(mine.map((n: { text: string }) => n.text)).toEqual(['second', 'first'])
  })

  it('read-all marks only my notices', async () => {
    await notify(wsA, nia, lin, 'for nia')
    await notify(wsA, lin, nia, 'for lin')
    await t.http.post(`${base}/notifications/read-all`).set(nia.auth).expect(204)
    expect((await t.http.get(`${base}/notifications`).set(nia.auth)).body).toMatchObject([{ text: 'for nia', read: true }])
    expect((await t.http.get(`${base}/notifications`).set(lin.auth)).body).toMatchObject([{ text: 'for lin', read: false }])
  })
})
