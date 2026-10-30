import { localToday, periodStart } from '../src/time/periods'
import { createTestApp, resetAll, type TestApp } from './utils/app'
import { type Signed, twoTeams } from './utils/team'

describe('timesheet approval', () => {
  let t: TestApp
  let lin: Signed
  let nia: Signed
  let wsA: string
  let base: string
  beforeAll(async () => { t = await createTestApp() })
  beforeEach(async () => {
    await resetAll(t)
    ;({ lin, nia, wsA, base } = await twoTeams(t))
  })
  afterAll(() => t.app.close())

  const today = () => localToday('UTC', t.clock.now())
  const week = () => periodStart(today(), 'week')
  const shift = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
  /** A project led by lin with approval on, and a task of it assigned to nia, in progress. */
  const setup = async (period: 'week' | 'month' = 'week') => {
    let p = (await t.http.post(`${base}/projects`).set(lin.auth).send({ name: 'Tide', hue: 'teal', icon: 'leaf', due: '2026-12-01' }).expect(201)).body
    p = (await t.http.patch(`${base}/projects/${p.id}`).set(lin.auth).send({ version: p.version, approvalEnabled: true, approvalPeriod: period }).expect(200)).body
    const x = (await t.http.post(`${base}/tasks`).set(lin.auth).send({ title: 'Ship it', project: p.id, assignee: nia.user.id }).expect(201)).body
    await t.http.post(`${base}/tasks/${x.id}/move`).set(lin.auth).send({ status: 'progress' }).expect(200)
    return { p, x }
  }
  const ts = (projectId: string, path: string) => `${base}/projects/${projectId}/timesheets/${path}`
  const log = (taskId: string, date = today()) => t.http.post(`${base}/tasks/${taskId}/worklogs`).set(nia.auth).send({ minutes: 30, date })

  it('a project shows its approval settings; a member can’t change them', async () => {
    const { p } = await setup()
    expect(p).toMatchObject({ approvalEnabled: true, approvalPeriod: 'week' })
    const res = await t.http.patch(`${base}/projects/${p.id}`).set(nia.auth).send({ version: p.version, approvalEnabled: false })
    expect(res.status).toBe(403)
  })

  it('submit, then worklogs in that week are 409 period_locked; withdraw unlocks', async () => {
    const { p, x } = await setup()
    const w = (await log(x.id).expect(201)).body.worklog
    const sent = await t.http.post(ts(p.id, 'submit')).set(nia.auth).send({ periodStart: week() }).expect(201)
    expect(sent.body).toMatchObject({ project: p.id, user: nia.user.id, start: week(), status: 'submitted', period: 'week' })
    expect((await log(x.id).expect(409)).body.code).toBe('period_locked')
    expect((await t.http.patch(`${base}/worklogs/${w.id}`).set(nia.auth).send({ minutes: 10 }).expect(409)).body.code).toBe('period_locked')
    expect((await t.http.post(ts(p.id, 'submit')).set(nia.auth).send({ periodStart: week() }).expect(409)).body.code).toBe('period_already_submitted')
    await t.http.post(ts(p.id, 'withdraw')).set(nia.auth).send({ periodStart: week() }).expect(204)
    await log(x.id).expect(201)
  })

  it('approve and reject: approvers only, never your own, reject needs a comment', async () => {
    const { p } = await setup()
    await t.http.post(ts(p.id, 'submit')).set(nia.auth).send({ periodStart: week() }).expect(201)
    expect((await t.http.post(ts(p.id, `${nia.user.id}/approve`)).set(nia.auth).send({ periodStart: week() }).expect(403)).body.code).toBe('forbidden')
    expect((await t.http.post(ts(p.id, `${nia.user.id}/reject`)).set(lin.auth).send({ periodStart: week(), comment: ' ' }).expect(400)).body.field).toBe('comment')
    const ok = await t.http.post(ts(p.id, `${nia.user.id}/approve`)).set(lin.auth).send({ periodStart: week() }).expect(201)
    expect(ok.body).toMatchObject({ status: 'approved', reviewer: lin.user.id })
    // lin is the lead: submitting and approving her own is refused.
    await t.http.post(ts(p.id, 'submit')).set(lin.auth).send({ periodStart: week() }).expect(201)
    expect((await t.http.post(ts(p.id, `${lin.user.id}/approve`)).set(lin.auth).send({ periodStart: week() }).expect(403)).body.code).toBe('cannot_review_own')
  })

  it('a rejected period counts as open and can be submitted again', async () => {
    const { p, x } = await setup()
    await t.http.post(ts(p.id, 'submit')).set(nia.auth).send({ periodStart: week() }).expect(201)
    const rejected = await t.http.post(ts(p.id, `${nia.user.id}/reject`)).set(lin.auth).send({ periodStart: week(), comment: 'Split the review hours' }).expect(201)
    expect(rejected.body).toMatchObject({ status: 'rejected', comment: 'Split the review hours' })
    await log(x.id).expect(201)
    expect((await t.http.post(ts(p.id, 'submit')).set(nia.auth).send({ periodStart: week() }).expect(201)).body.status).toBe('submitted')
  })

  it('reopen deletes an approved row; only approved rows reopen', async () => {
    const { p, x } = await setup()
    await t.http.post(ts(p.id, 'submit')).set(nia.auth).send({ periodStart: week() }).expect(201)
    expect((await t.http.post(ts(p.id, `${nia.user.id}/reopen`)).set(lin.auth).send({ periodStart: week() }).expect(409)).body.code).toBe('period_not_approved')
    await t.http.post(ts(p.id, `${nia.user.id}/approve`)).set(lin.auth).send({ periodStart: week() }).expect(201)
    await t.http.post(ts(p.id, `${nia.user.id}/reopen`)).set(lin.auth).send({ periodStart: week() }).expect(204)
    await log(x.id).expect(201)
  })

  it('withdrawing something not submitted is 409 period_not_submitted', async () => {
    const { p } = await setup()
    expect((await t.http.post(ts(p.id, 'withdraw')).set(nia.auth).send({ periodStart: week() }).expect(409)).body.code).toBe('period_not_submitted')
  })

  it('submitting with approval off is 409 approval_off; turning it off drops submitted rows and keeps approved ones', async () => {
    const { p } = await setup()
    const prev = shift(week(), -7)
    await t.http.post(ts(p.id, 'submit')).set(nia.auth).send({ periodStart: prev }).expect(201)
    await t.http.post(ts(p.id, `${nia.user.id}/approve`)).set(lin.auth).send({ periodStart: prev }).expect(201)
    await t.http.post(ts(p.id, 'submit')).set(nia.auth).send({ periodStart: week() }).expect(201)
    const v = (await t.http.get(`${base}/projects/${p.id}`).set(lin.auth)).body.version
    await t.http.patch(`${base}/projects/${p.id}`).set(lin.auth).send({ version: v, approvalEnabled: false }).expect(200)
    const rows = await t.db.query(`SELECT status FROM timesheet_periods WHERE project_id = $1`, [p.id])
    expect(rows.map((r: { status: string }) => r.status)).toEqual(['approved'])
    expect((await t.http.post(ts(p.id, 'submit')).set(nia.auth).send({ periodStart: week() }).expect(409)).body.code).toBe('approval_off')
  })

  it('periodStart must start a period, and not a future one', async () => {
    const { p } = await setup()
    const res = await t.http.post(ts(p.id, 'submit')).set(nia.auth).send({ periodStart: shift(week(), 2) }).expect(400)
    expect(res.body).toMatchObject({ code: 'invalid', field: 'periodStart' })
    expect((await t.http.post(ts(p.id, 'submit')).set(nia.auth).send({ periodStart: shift(week(), 7) }).expect(400)).body.code).toBe('future_date')
  })

  it('switching to monthly keeps old weekly locks by range', async () => {
    const { p, x } = await setup()
    const old = shift(week(), -14)
    await t.http.post(ts(p.id, 'submit')).set(nia.auth).send({ periodStart: old }).expect(201)
    const v = (await t.http.get(`${base}/projects/${p.id}`).set(lin.auth)).body.version
    await t.http.patch(`${base}/projects/${p.id}`).set(lin.auth).send({ version: v, approvalPeriod: 'month' }).expect(200)
    expect((await log(x.id, shift(old, 2)).expect(409)).body.code).toBe('period_locked')
    await log(x.id, shift(old, 8)).expect(201)
  })

  it('submitting notifies approvers; approving and rejecting notify the person', async () => {
    const { p } = await setup()
    await t.http.post(ts(p.id, 'submit')).set(nia.auth).send({ periodStart: week() }).expect(201)
    const kinds = async (userId: string) =>
      (await t.db.query(`SELECT payload FROM notifications WHERE workspace_id = $1 AND recipient_id = $2 AND kind = 'timesheet'`, [wsA, userId]))
        .map((r: { payload: { text: string } }) => r.payload.text)
    expect(await kinds(lin.user.id)).toEqual([expect.stringContaining('submitted their hours for Tide')])
    await t.http.post(ts(p.id, `${nia.user.id}/reject`)).set(lin.auth).send({ periodStart: week(), comment: 'Missing Friday' }).expect(201)
    expect(await kinds(nia.user.id)).toEqual([expect.stringContaining('Missing Friday')])
  })
})
