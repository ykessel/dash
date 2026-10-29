import { RemindersService } from '../src/notices/reminders.service'
import { NotificationsService } from '../src/notifications/notifications.service'
import { createTestApp, resetAll, type TestApp } from './utils/app'
import { advanceToLocal, clockDay } from './utils/history'
import { type Signed, twoTeams } from './utils/team'

describe('reminders', () => {
  let t: TestApp
  let lin: Signed
  let nia: Signed
  let wsA: string
  let base: string
  let project: string
  beforeAll(async () => { t = await createTestApp() })
  beforeEach(async () => {
    await resetAll(t)
    ;({ lin, nia, wsA, base } = await twoTeams(t))
    project = (await t.http.post(`${base}/projects`).set(lin.auth).send({ name: 'Tide', hue: 'teal', icon: 'leaf', due: '2026-12-01' })).body.id
  })
  afterAll(() => t.app.close())

  const tick = () => t.app.get(RemindersService).tick()
  const inbox = (who: Signed) => t.app.get(NotificationsService).list(wsA, who.user.id)
  const setTz = (who: Signed, tz: string) => t.db.query(`UPDATE memberships SET tz = $3 WHERE workspace_id = $1 AND user_id = $2`, [wsA, who.user.id, tz])
  const notify = (who: Signed, notify: Record<string, boolean>) => t.http.patch('/api/v1/me/prefs').set(who.auth).send({ notify }).expect(200)
  /** A task for nia; its due date is set to her local today after the clock has moved. */
  const ninasTask = async (title = 'Ship it') =>
    (await t.http.post(`${base}/tasks`).set(lin.auth).send({ title, project, assignee: nia.user.id }).expect(201)).body.id as string
  const dueToday = async (id: string, tz = 'UTC') => t.db.query(`UPDATE tasks SET due_date = $2 WHERE id = $1`, [id, await clockDay(t, tz)])
  const dueNotices = async (who: Signed) => (await inbox(who)).filter(n => n.text.endsWith('is due today'))

  describe('due dates', () => {
    it('reminds the assignee on the morning a task is due', async () => {
      const id = await ninasTask()
      await advanceToLocal(t, 'UTC', '09:01')
      await dueToday(id)
      await tick()
      expect(await dueNotices(nia)).toMatchObject([{ who: '', text: '“Ship it” is due today' }])
    })

    it('does not remind before nine', async () => {
      const id = await ninasTask()
      await advanceToLocal(t, 'UTC', '08:59')
      await dueToday(id)
      await tick()
      expect(await dueNotices(nia)).toEqual([])
    })

    it('a second tick sends nothing new', async () => {
      const id = await ninasTask()
      await advanceToLocal(t, 'UTC', '09:01')
      await dueToday(id)
      await tick()
      await tick()
      expect(await dueNotices(nia)).toHaveLength(1)
    })

    it('skips done and deleted tasks', async () => {
      const done = await ninasTask('Done one')
      const gone = await ninasTask('Gone one')
      await t.db.query(`UPDATE tasks SET status = 'done' WHERE id = $1`, [done])
      await t.db.query(`UPDATE tasks SET deleted_at = now() WHERE id = $1`, [gone])
      await advanceToLocal(t, 'UTC', '09:01')
      await dueToday(done)
      await dueToday(gone)
      await tick()
      expect(await dueNotices(nia)).toEqual([])
    })

    it('respects the due toggle', async () => {
      await notify(nia, { due: false })
      const id = await ninasTask()
      await advanceToLocal(t, 'UTC', '09:01')
      await dueToday(id)
      await tick()
      expect(await dueNotices(nia)).toEqual([])
    })

    it('uses the member’s own time zone', async () => {
      await setTz(nia, 'Pacific/Auckland')
      const id = await ninasTask()
      await advanceToLocal(t, 'Pacific/Auckland', '09:01')
      await dueToday(id, 'Pacific/Auckland')
      await tick()
      expect(await dueNotices(nia)).toHaveLength(1)
    })
  })

  describe('review fixes', () => {
    it('a member with a time zone Postgres does not know is skipped, not fatal', async () => {
      await t.db.query(`UPDATE memberships SET tz = 'Mars/Olympus' WHERE workspace_id = $1 AND user_id = $2`, [wsA, lin.user.id])
      const id = await ninasTask()
      await advanceToLocal(t, 'UTC', '09:01')
      await dueToday(id)
      await expect(tick()).resolves.toBeDefined()
      expect(await dueNotices(nia)).toHaveLength(1)
    })

    it('a later tick does not re-claim what was already sent', async () => {
      const id = await ninasTask()
      await advanceToLocal(t, 'UTC', '09:01')
      await dueToday(id)
      await tick()
      const svc = t.app.get(RemindersService)
      const spy = jest.spyOn(svc, 'claim')
      await tick()
      expect(spy).not.toHaveBeenCalled()
      spy.mockRestore()
    })
  })

  describe('meetings', () => {
    /** An event today (UTC) starting `inMin` minutes after 10:00, with lin and nia (straight to the DB: tokens expire as the clock moves). */
    const meeting = async (title: string, inMin: number) => {
      const [{ id }] = await t.db.query(
        `INSERT INTO events (workspace_id, title, date, start_min, dur_min, kind, hue) VALUES ($1, $2, $3, $4, 15, 'team', 'blue') RETURNING id`,
        [wsA, title, await clockDay(t, 'UTC'), 600 + inMin],
      )
      await t.db.query(`INSERT INTO event_attendees (event_id, user_id) VALUES ($1, $2), ($1, $3)`, [id, lin.user.id, nia.user.id])
      return id as string
    }
    const meetingNotices = async (who: Signed) => (await inbox(who)).filter(n => n.text.endsWith('starts in 5 minutes'))

    it('reminds attendees five minutes before a meeting', async () => {
      await advanceToLocal(t, 'UTC', '10:00')
      await meeting('Standup', 4)
      await meeting('Later', 10)
      const gone = await meeting('Cancelled', 3)
      await t.db.query(`UPDATE events SET deleted_at = now() WHERE id = $1`, [gone])
      await tick()
      await tick()
      expect(await meetingNotices(nia)).toMatchObject([{ who: '', text: '“Standup” starts in 5 minutes' }])
      expect(await meetingNotices(lin)).toMatchObject([{ who: '', text: '“Standup” starts in 5 minutes' }])
    })

    it('respects the meetings toggle', async () => {
      await notify(nia, { meetings: false })
      await advanceToLocal(t, 'UTC', '10:00')
      await meeting('Standup', 4)
      await tick()
      expect(await meetingNotices(nia)).toEqual([])
      expect(await meetingNotices(lin)).toHaveLength(1)
    })
  })
})

describe('digest', () => {
  let t: TestApp
  let lin: Signed
  let nia: Signed
  let wsA: string
  let base: string
  let project: string
  beforeAll(async () => { t = await createTestApp() })
  beforeEach(async () => {
    await resetAll(t)
    ;({ lin, nia, wsA, base } = await twoTeams(t))
    project = (await t.http.post(`${base}/projects`).set(lin.auth).send({ name: 'Tide', hue: 'teal', icon: 'leaf', due: '2026-12-01' })).body.id
  })
  afterAll(() => t.app.close())

  const tick = () => t.app.get(RemindersService).tick()
  const digests = () => t.mailer.sent.filter(m => m.subject === 'Your day in Pane')
  const optIn = () => t.http.patch('/api/v1/me/prefs').set(nia.auth).send({ notify: { digest: true } }).expect(200)
  /** nia's task (assigning her leaves one unread notice), then the clock moves to her 09:01 and it falls due today, with a 10:00 meeting. */
  const busyMorning = async () => {
    const id = (await t.http.post(`${base}/tasks`).set(lin.auth).send({ title: 'Ship it', project, assignee: nia.user.id }).expect(201)).body.id
    await advanceToLocal(t, 'UTC', '09:01')
    const day = await clockDay(t, 'UTC')
    await t.db.query(`UPDATE tasks SET due_date = $2 WHERE id = $1`, [id, day])
    const [{ id: ev }] = await t.db.query(
      `INSERT INTO events (workspace_id, title, date, start_min, dur_min, kind, hue) VALUES ($1, 'Standup', $2, 600, 15, 'team', 'blue') RETURNING id`,
      [wsA, day],
    )
    await t.db.query(`INSERT INTO event_attendees (event_id, user_id) VALUES ($1, $2)`, [ev, nia.user.id])
  }

  it('mails the digest at nine to members who opted in', async () => {
    await optIn()
    await busyMorning()
    await tick()
    expect(digests()).toHaveLength(1)
    const [mail] = digests()
    expect(mail.to).toBe('nia@pane.app')
    expect(mail.text).toContain('Ship it')
    expect(mail.text).toContain('10:00 Standup')
    expect(mail.text).toContain('1 unread')
    expect(mail.text).toContain('http://localhost:5173/#/home')
  })

  it('no digest when the toggle is off', async () => {
    await busyMorning()
    await tick()
    expect(digests()).toEqual([])
  })

  it('one digest per day', async () => {
    await optIn()
    await busyMorning()
    await tick()
    await tick()
    expect(digests()).toHaveLength(1)
    t.clock.advance(86_400_000)
    await tick()
    expect(digests()).toHaveLength(2)
    expect(digests()[1].text).toContain('1 overdue')
  })

  it('a mail failure does not stop other reminders, and the digest is retried next tick', async () => {
    await optIn()
    await busyMorning()
    const send = t.mailer.send.bind(t.mailer)
    const spy = jest.spyOn(t.mailer, 'send').mockRejectedValueOnce(new Error('smtp down'))
    await expect(tick()).resolves.toBeDefined()
    expect((await t.app.get(NotificationsService).list(wsA, nia.user.id)).some(n => n.text === '“Ship it” is due today')).toBe(true)
    expect(digests()).toEqual([])
    spy.mockImplementation(send)
    await tick()
    expect(digests()).toHaveLength(1)
    spy.mockRestore()
  })

  it('skips an empty day', async () => {
    await optIn()
    await advanceToLocal(t, 'UTC', '09:01')
    await tick()
    expect(digests()).toEqual([])
  })

  it('not before nine', async () => {
    await optIn()
    await busyMorning()
    await advanceToLocal(t, 'UTC', '08:59')
    await tick()
    expect(digests()).toEqual([])
  })
})
