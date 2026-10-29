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

  describe('mentions and assignment', () => {
    let base: string
    let project: string
    beforeEach(async () => {
      base = `/api/v1/workspaces/${wsA}`
      project = (await t.http.post(`${base}/projects`).set(lin.auth).send({ name: 'Tide', hue: 'teal', icon: 'leaf', due: '2026-12-01' })).body.id
    })
    const newTask = (body: Record<string, unknown> = {}) =>
      t.http.post(`${base}/tasks`).set(lin.auth).send({ title: 'Ship it', project, ...body }).expect(201).then(r => r.body)
    const comment = (taskId: string, body: Record<string, unknown>) => t.http.post(`${base}/tasks/${taskId}/comments`).set(lin.auth).send(body)

    it('a comment notifies each person it mentions', async () => {
      const task = await newTask()
      await comment(task.id, { text: 'Look @nia', mentions: [nia.user.id, nia.user.id] }).expect(201)
      expect(await inbox(nia)).toMatchObject([{ who: lin.user.id, text: 'mentioned you on “Ship it”' }])
    })

    it('mentions outside the workspace are ignored', async () => {
      const task = await newTask()
      await comment(task.id, { text: 'hi', mentions: [kai.user.id, nia.user.id] }).expect(201)
      expect(await t.db.query(`SELECT 1 FROM notifications WHERE recipient_id = $1`, [kai.user.id])).toEqual([])
      expect(await inbox(nia)).toHaveLength(1)
    })

    it('a malformed mention is a 400 on field mentions', async () => {
      const task = await newTask()
      const res = await comment(task.id, { text: 'hi', mentions: ['nope'] }).expect(400)
      expect(res.body).toMatchObject({ field: 'mentions' })
    })

    it('assigning someone else notifies them', async () => {
      const task = await newTask({ assignee: nia.user.id })
      expect(await inbox(nia)).toMatchObject([{ who: lin.user.id, text: 'assigned you “Ship it”' }])
      await t.http.patch(`${base}/tasks/${task.id}`).set(lin.auth).send({ version: task.version, assignee: lin.user.id }).expect(200)
      expect(await inbox(lin)).toEqual([])
    })

    it('reassigning notifies only the new assignee', async () => {
      const task = await newTask({ assignee: lin.user.id })
      const moved = (await t.http.patch(`${base}/tasks/${task.id}`).set(lin.auth).send({ version: task.version, assignee: nia.user.id }).expect(200)).body
      await t.http.patch(`${base}/tasks/${task.id}`).set(lin.auth).send({ version: moved.version, assignee: nia.user.id, title: 'Ship it now' }).expect(200)
      expect(await inbox(nia)).toMatchObject([{ text: 'assigned you “Ship it”' }])
      expect(await inbox(nia)).toHaveLength(1)
    })
  })
})
