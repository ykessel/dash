import { createTestApp, resetAll, type TestApp } from './utils/app'
import { closeSockets, connect, nextEvent, noEvent } from './utils/socket'
import { type Signed, twoTeams } from './utils/team'

describe('live board', () => {
  let t: TestApp
  let lin: Signed
  let nia: Signed
  let base: string
  beforeAll(async () => { t = await createTestApp() })
  beforeEach(async () => {
    await resetAll(t)
    ;({ lin, nia, base } = await twoTeams(t))
  })
  afterEach(() => closeSockets())
  afterAll(() => t.app.close())

  const TYPES = ['task.created', 'task.moved', 'comment.created', 'task.deleted', 'task.restored']

  it('two members see each other’s board changes live, and the author’s tab does not get an echo', async () => {
    const projectId = (await t.http.post(`${base}/projects`).set(lin.auth).send({ name: 'Tide', hue: 'teal', icon: 'leaf', due: '2026-12-01' })).body.id
    const [tabA, niaS] = await Promise.all([connect(t, lin.token, 'tab-a'), connect(t, nia.token)])
    const heard: string[] = []
    for (const type of TYPES) niaS.on(type, () => heard.push(type))
    const echoes: string[] = []
    for (const type of TYPES) tabA.on(type, () => echoes.push(type))
    const as = <R extends { set: (k: string, v: string) => R }>(r: R) => r.set('X-Client-Id', 'tab-a')

    const created = nextEvent(niaS, 'task.created')
    const task = (await as(t.http.post(`${base}/tasks`).set(lin.auth)).send({ title: 'Live', project: projectId }).expect(201)).body
    expect((await created).task).toMatchObject({ id: task.id, title: 'Live' })

    const moved = nextEvent(niaS, 'task.moved')
    await as(t.http.post(`${base}/tasks/${task.id}/move`).set(lin.auth)).send({ status: 'review' }).expect(200)
    expect((await moved).task).toMatchObject({ id: task.id, status: 'review' })

    const commented = nextEvent(niaS, 'comment.created')
    await as(t.http.post(`${base}/tasks/${task.id}/comments`).set(lin.auth)).send({ text: 'On it' }).expect(201)
    expect(await commented).toMatchObject({ by: lin.user.id, taskId: task.id, comment: { text: 'On it', who: lin.user.id } })

    const deleted = nextEvent(niaS, 'task.deleted')
    await as(t.http.delete(`${base}/tasks/${task.id}`).set(lin.auth)).expect(204)
    expect(await deleted).toMatchObject({ id: task.id })

    const restored = nextEvent(niaS, 'task.restored')
    await as(t.http.post(`${base}/tasks/${task.id}/restore`).set(lin.auth)).expect(200)
    expect((await restored).task).toMatchObject({ id: task.id, comments: [{ text: 'On it' }] })

    expect(heard).toEqual(TYPES)
    await noEvent(tabA, 'task.restored')
    expect(echoes).toEqual([])
  })
})
