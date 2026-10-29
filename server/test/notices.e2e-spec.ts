import { NoticeGate } from '../src/notices/notice-gate'
import { NotificationsService } from '../src/notifications/notifications.service'
import { createTestApp, resetAll, type TestApp } from './utils/app'
import { type Signed, twoTeams } from './utils/team'

describe('notices', () => {
  let t: TestApp
  let lin: Signed
  let nia: Signed
  let kai: Signed
  let wsA: string
  beforeAll(async () => { t = await createTestApp() })
  beforeEach(async () => {
    await resetAll(t)
    ;({ lin, nia, kai, wsA } = await twoTeams(t))
  })
  afterAll(() => t.app.close())

  const gate = () => t.app.get(NoticeGate)
  const inbox = (who: Signed) => t.app.get(NotificationsService).list(wsA, who.user.id)

  describe('notice gate', () => {
    it('sends a notice the recipient has on', async () => {
      expect(await gate().send(wsA, nia.user.id, { userId: lin.user.id }, 'mention', 'mentioned you on “X”')).toBe(true)
      expect(await inbox(nia)).toMatchObject([{ who: lin.user.id, text: 'mentioned you on “X”' }])
    })

    it('drops a kind the recipient switched off', async () => {
      await t.http.patch('/api/v1/me/prefs').set(nia.auth).send({ notify: { mentions: false } }).expect(200)
      expect(await gate().send(wsA, nia.user.id, { userId: lin.user.id }, 'mention', 'm')).toBe(false)
      expect(await inbox(nia)).toEqual([])
      expect(await gate().send(wsA, nia.user.id, { userId: lin.user.id }, 'assigned', 'a')).toBe(true)
    })

    it('never notifies the actor themself', async () => {
      expect(await gate().send(wsA, lin.user.id, { userId: lin.user.id }, 'assigned', 'a')).toBe(false)
      expect(await inbox(lin)).toEqual([])
    })

    it('drops a recipient outside the workspace', async () => {
      expect(await gate().send(wsA, kai.user.id, { userId: lin.user.id }, 'assigned', 'a')).toBe(false)
      expect(await t.db.query(`SELECT 1 FROM notifications`)).toEqual([])
    })

    it('system reminders have no actor', async () => {
      expect(await gate().send(wsA, nia.user.id, null, 'due', '“X” is due today')).toBe(true)
      expect(await inbox(nia)).toMatchObject([{ who: '', text: '“X” is due today' }])
    })
  })
})
