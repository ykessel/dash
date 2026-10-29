# Backend Phase 5: Notices and Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notices for mentions, assignment, due dates and meetings, gated by each person's `prefs.notify`, plus a once-a-day digest email.

**Architecture:** A new `server/src/notices/` module owns the rules. `NoticeGate.send()` is the one door every automatic notice goes through: it drops self-notices, non-members and anything the recipient switched off, then calls the existing `NotificationsService.create`. Tasks and comments call the gate directly. Time-based notices (due, meeting, digest) come from `RemindersService.tick()`, which reads the CLOCK, works in each member's `memberships.tz`, and is idempotent through a `reminders_sent` table, so a timer (`ReminderScheduler`, every 60 s, off in tests) and several instances can call it safely.

**Tech Stack:** NestJS 11, TypeORM 0.3 (hand-written migrations), Postgres 16, zod, nodemailer via `MailService`, Jest e2e.

**Spec:** `docs/superpowers/specs/` backend spec, section 7 row 5: "Avisos por mención, asignación, vencimiento y reunión según `prefs.notify`; job diario de resumen. Hecho cuando: Las preferencias de Settings cambian lo que llega." Settings copy (frontend `src/pages/Settings.tsx`) fixes the timings: mentions "When someone @mentions you"; due "The morning a task of yours is due"; meetings "Five minutes before they start"; digest "One summary at 9:00 AM"; focus "When a session ends".

## Global Constraints

- Notice text follows the frontend `Notice` shape: `who` is the actor, `text` reads after the actor's name (`mentioned you on “Title”`). Reminders have no actor (`who: ''`).
- Curly quotes `“ ”` around titles, as in the seed notices.
- No new npm dependencies (no `@nestjs/schedule`): the scheduler is a plain `setInterval`.
- Every time decision uses `CLOCK`, never `new Date()`.
- Local time = the recipient's `memberships.tz` for that workspace.
- Migrations are hand-written, timestamps after `1793405300000`.
- Commits carry no attribution trailers.

## Review Focus

1. A person who turns a toggle off gets nothing of that kind, but other kinds still arrive (the spec's "done when").
2. Running `tick()` twice, or from two instances at once, never sends a reminder or digest twice.
3. A mention or assignment of someone outside the workspace, or of oneself, sends nothing and never errors.
4. Deleted tasks, done tasks and deleted events never trigger reminders.
5. A member in a far time zone gets their due reminder and digest at their own 09:00, not the server's.

---

### Task 1: NoticeGate

**Files:**
- Create: `server/src/notices/notice-gate.ts`, `server/src/notices/notices.module.ts`
- Modify: `server/src/app.module.ts` (register `NoticesModule`), `server/src/notifications/notifications.service.ts` (doc comment only)
- Test: `server/test/notices.e2e-spec.ts`

**Interfaces:**
- Produces: `type NoticeKind = 'mention' | 'assigned' | 'due' | 'meeting'`; `NOTIFY_KEY: Record<NoticeKind, keyof Notify | null>` = `{ mention: 'mentions', assigned: null, due: 'due', meeting: 'meetings' }`; `NoticeGate.send(wsId: string, recipientId: string, actor: Actor | null, kind: NoticeKind, text: string): Promise<boolean>` (true when stored). `actor === null` means a system reminder: stored with `actor_id NULL`, published with `{ userId: '' }`.
- `NotificationsService.create` gains an overload: `actor: Actor | null`.

- [ ] **Step 1: Write the failing tests** in `test/notices.e2e-spec.ts` (`describe('notice gate')`), using `twoTeams`:
  - `sends a notice the recipient has on` → `send(wsA, nia, {lin}, 'mention', 'mentioned you on “X”')` resolves `true`; nia's `GET notifications` has `[{ who: lin.id, text: 'mentioned you on “X”' }]`.
  - `drops a kind the recipient switched off` → nia `PUT /me/prefs { notify: { mentions: false } }`; send mention → `false`, inbox empty; send `'assigned'` → `true`.
  - `never notifies the actor themself` → send to lin with actor lin → `false`.
  - `drops a recipient outside the workspace` → send to kai in wsA → `false`, no row in `notifications`.
  - `system reminders have no actor` → `send(wsA, nia, null, 'due', ...)` → notice `who: ''`.
- [ ] **Step 2: Run** `pnpm test:e2e notices` → FAIL (cannot find module `notice-gate`).
- [ ] **Step 3: Implement** `NoticeGate` (membership check by `SELECT 1 FROM memberships`, prefs via `PrefsService.get`), and let `NotificationsService.create` accept `null` actor. `NoticesModule` imports `NotificationsModule`, `PrefsModule`; exports `NoticeGate`.
- [ ] **Step 4: Run** `pnpm test:e2e notices` → PASS 5/5; `pnpm test:e2e notifications` → PASS.
- [ ] **Step 5: Commit** `feat(server): notice gate honours notify prefs`

### Task 2: Mentions and assignment

**Files:**
- Modify: `server/src/tasks/comments.controller.ts`, `server/src/tasks/task-parts.service.ts`, `server/src/tasks/tasks.service.ts`, `server/src/tasks/tasks.module.ts`, `server/src/common/validate.ts` (`ERROR_FIELDS` + `mentions`)
- Test: `server/test/notices.e2e-spec.ts` (`describe('mentions and assignment')`)

**Interfaces:**
- Consumes: `NoticeGate.send` (Task 1).
- Produces: comment body `{ text: string, mentions?: string[] }` (uuid array, max 20, deduped). `TaskPartsService.addComment(wsId, taskId, text, actor, mentions: string[] = [])`.

- [ ] **Step 1: Write the failing tests:**
  - `a comment notifies each person it mentions` → lin comments on task “Ship it” with `mentions: [nia.id]` → nia gets `{ who: lin.id, text: 'mentioned you on “Ship it”' }`.
  - `mentions outside the workspace are ignored` → `mentions: [kai.id, nia.id]` → 201; kai has no row; nia has one.
  - `a malformed mention is a 400 on field mentions` → `mentions: ['nope']` → 400 `{ field: 'mentions' }`.
  - `assigning someone else notifies them` → lin creates task with `assignee: nia` → nia gets `assigned you “Ship it”`; lin `PATCH assignee: lin` (self) → no notice for lin.
  - `reassigning notifies only the new assignee` → task assigned to lin, lin patches `assignee: nia` → nia gets one; patching the same assignee again sends nothing new.
- [ ] **Step 2: Run** `pnpm test:e2e notices` → the new ones FAIL.
- [ ] **Step 3: Implement.** Comments: send after the insert, one per distinct mention. Tasks: in `create` when assignee is set; in `update` when `assignee` is given and differs from the stored `assigneeId`. Notices go out after the transaction commits.
- [ ] **Step 4: Run** `pnpm test:e2e notices task-parts tasks` → PASS.
- [ ] **Step 5: Commit** `feat(server): notices for mentions and assignment`

### Task 3: Due and meeting reminders

**Files:**
- Create: `server/src/notices/reminders.service.ts`, `server/src/db/migrations/1793405400000-RemindersSent.ts`
- Modify: `server/src/notices/notices.module.ts`
- Test: `server/test/reminders.e2e-spec.ts`, helper `server/test/utils/history.ts` (`untilLocal(t, tz, hhmm)`: ms to advance the clock to the next local `hh:mm`)

**Interfaces:**
- Produces: `RemindersService.tick(): Promise<{ due: number; meetings: number; digests: number }>`. Table `reminders_sent (kind text, ref text, user_id uuid, PRIMARY KEY (kind, ref, user_id), sent_at timestamptz)`. `claim(kind, ref, userId): Promise<boolean>` = `INSERT … ON CONFLICT DO NOTHING RETURNING 1`.
- Rules: **due** — from local 09:00 on day D until end of D, each live task with `due_date = D`, `status <> 'done'`, assignee a member: notice `“Title” is due today`, ref `taskId:D`. **meeting** — each live event whose start (`date + start_min` in the attendee's tz) is within `(now, now + 5 min]`: notice `“Title” starts in 5 minutes`, ref `eventId:date:start_min`.

- [ ] **Step 1: Write the failing tests** (advance with `untilLocal`; read inboxes through `NotificationsService.list` since tokens expire):
  - `reminds the assignee on the morning a task is due` → task due today (local), advance to 09:01 → `tick()` → nia has `“Ship it” is due today`, `who: ''`.
  - `does not remind before nine` → at 08:59 → nothing.
  - `a second tick sends nothing new` → two ticks → one notice.
  - `skips done and deleted tasks`.
  - `respects the due toggle` → nia `notify.due=false` → nothing.
  - `uses the member’s own time zone` → nia tz `Pacific/Auckland`, task due on her local today, advance to her 09:01 → reminded.
  - `reminds attendees five minutes before a meeting` → event at local now+4 min with attendees lin, nia → both get `“Standup” starts in 5 minutes`; an event 10 min away → nothing; deleted event → nothing.
  - `respects the meetings toggle`.
- [ ] **Step 2: Run** `pnpm test:e2e reminders` → FAIL (module missing).
- [ ] **Step 3: Implement** migration, `claim`, due and meeting queries (SQL in local time with `AT TIME ZONE m.tz`), sending through `NoticeGate` with `actor null`. Claim before send; when the gate drops it, the claim still stands (a later toggle-on does not resend the same day).
- [ ] **Step 4: Run** `pnpm migration:run` on the local DB, then `pnpm test:e2e reminders` → PASS.
- [ ] **Step 5: Commit** `feat(server): due and meeting reminders`

### Task 4: Daily digest and scheduler

**Files:**
- Create: `server/src/notices/reminder.scheduler.ts`
- Modify: `server/src/notices/reminders.service.ts`, `server/src/mail/mail.service.ts`, `server/src/config/env.ts` (`REMINDER_TICK_MS`, default `60000`, `0` = off), `server/test/utils/env.ts` (set `0`)
- Test: `server/test/reminders.e2e-spec.ts` (`describe('digest')`), `server/src/config/env.spec.ts`

**Interfaces:**
- Produces: `MailService.sendDigest(to: string, workspaceName: string, d: Digest)` with `Digest = { due: string[]; overdue: number; meetings: { title: string; start: string }[]; unread: number; link: string }`. Subject `Your day in {workspace}`. `link` = `${APP_URL}/#/home`.
- Rule: from local 09:00, once per member per workspace per local day (ref `wsId:D`), only when `notify.digest` is on (default off), and only when at least one of `due`, `overdue`, `meetings`, `unread` is non-zero.

- [ ] **Step 1: Write the failing tests:**
  - `mails the digest at nine to members who opted in` → nia `digest: true`, task due today, meeting today, one unread notice → at 09:01 tick → one mail to nia, subject `Your day in Pane`, text contains `Ship it`, `1 unread`.
  - `no digest when the toggle is off` (default).
  - `one digest per day` → two ticks → one mail; advance 24 h → second mail.
  - `skips an empty day` → nothing to report → no mail.
  - env spec: `REMINDER_TICK_MS` defaults to 60000 and accepts `0`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** digest in `tick()`; `ReminderScheduler` (`OnApplicationBootstrap` starts `setInterval(tick)` when `REMINDER_TICK_MS > 0`, logs and swallows errors, `OnApplicationShutdown` clears it; no overlap — skip a tick while the previous one runs).
- [ ] **Step 4: Run** `pnpm test` and `pnpm test:e2e` → all PASS; `pnpm exec tsc --noEmit -p tsconfig.json` clean.
- [ ] **Step 5: Commit** `feat(server): daily digest email and reminder scheduler`
