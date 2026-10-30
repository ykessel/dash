# Time Tracking (Phase 9) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jira + Tempo-style worklogs on tasks, a weekly timesheet, day/week/month/year reports with CSV, and per-project approval that the lead turns on.

**Architecture:** A new `server/src/time/` module owns worklogs, timesheet periods, the timesheet read and the reports. Every permission check goes through phase 8's `AccessService` (`time.*` keys). The task view gains logged and remaining totals, which everyone sees. Worklog content travels only to the author and to `time.view_all`/`time.approve` holders, through user rooms. The client adds a Log work block to the task drawer, a Timesheet page (Mis horas / Equipo / Reportes) and an approval card on the project page.

**Tech Stack:** NestJS 11, TypeORM 0.3 migrations, zod `parseBody`, Jest e2e on Postgres (port 5434, `pane_test`), React 19 + Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-29-roles-and-time-tracking-design.md` §5, plus §6 and §7.

## Global Constraints

- Same stack and conventions as phases 1–8: zod in controllers, `AppError(status, code, message, field)`, e2e tests against local Postgres.
- Everything filters by `workspace_id`. Add cross-workspace leak tests for worklogs and reports.
- No new dependencies. The duration parser is written by hand.
- `work_date` is the worker's local date, picked in the form; never derived from an instant.
- `minutes` is between 1 and 1440. A person's total for one day, across the whole workspace, is at most 24 h → 422 `day_over_24h`.
- Logging requires all of: `time.log`, task status `progress` or `review`, and the actor is the task's assignee. Only your own hours can be logged.
- No future dates. "Today" is computed in the logger's `memberships.tz`.
- Weeks run Monday to Sunday. `approval_period` is `week | month`, default `week`. `approval_enabled` defaults to false.
- Locking is by date range: a `submitted` or `approved` row of that person and project whose range contains `work_date` locks the worklog → 409 `period_locked`. It applies only while `approval_enabled`.
- Copy is in English, like the rest of the UI, with curly apostrophes (’). The disabled Log work message is "Time can only be logged while the task is In progress or In review."
- Duration input format: `2h 30m`, `1.5h`, `90m`, `1d` (1d = 8h).

## Review Focus

1. A period that switched from weekly to monthly: a worklog dated inside an older submitted **week** still gets 409 `period_locked`, and a worklog outside every locked range is still editable. Test in Task 4.
2. The 24 h cap spans projects and ignores deleted worklogs and worklogs of deleted tasks. A PATCH that would push the day past 24 h is 422. Test in Task 2.
3. Without `time.view_all`, `GET /tasks/:id/worklogs` returns only your own worklogs, while the task view's `loggedMinutes` still counts everyone's. Test in Task 2.
4. A user of another workspace gets 404 on a worklog id, sees nothing from this workspace in reports, and `scope=team` covers only projects where the requester holds `time.view_all`. Test in Task 5.
5. "Today" comes from the logger's tz: a member with `tz = 'Pacific/Kiritimati'` (UTC+14) can log on their local date even when it is already tomorrow in UTC, and one day later is still 400 `future_date`. Test in Task 2.

---

### Task 1: Schema, entities and period math

**Files:**
- Create: `server/src/db/migrations/1793405600000-TimeTracking.ts`
- Create: `server/src/time/worklog.entity.ts`, `server/src/time/timesheet-period.entity.ts`, `server/src/time/periods.ts`, `server/src/time/periods.spec.ts`
- Create: `server/src/time/time.module.ts`, registered in `app.module.ts`
- Modify: `server/src/tasks/task.entity.ts` (`remainingMinutes`), `server/src/projects/project.entity.ts` (`approvalEnabled`, `approvalPeriod`)

**Interfaces:**
- Produces:
  - `Worklog` with `{ id, workspaceId, projectId, taskId, userId, workDate: string, minutes: number, comment: string, createdAt, updatedAt, updatedBy: string | null, deletedAt: Date | null }`.
  - `TimesheetPeriod` with `{ id, workspaceId, projectId, userId, periodStart: string, periodEnd: string, period: 'week'|'month', status: 'submitted'|'approved'|'rejected', submittedAt, reviewerId: string|null, reviewedAt: Date|null, comment: string }`.
  - `periods.ts` exports:
    - `type Period = 'week' | 'month'`
    - `periodStart(day: string, p: Period): string`
    - `periodEnd(start: string, p: Period): string`
    - `bucketStart(day: string, b: 'day'|'week'|'month'|'year'): string`
    - `localToday(tz: string, now: Date): string`

- [ ] **Step 1: Write the unit tests in `periods.spec.ts`:**
  - `periodStart('2026-10-29','week') === '2026-10-26'` (Monday).
  - `periodStart('2026-11-01','week') === '2026-10-26'` (a Sunday belongs to the week before).
  - `periodStart('2026-10-29','month') === '2026-10-01'`.
  - `periodEnd('2026-10-26','week') === '2026-11-01'`.
  - `periodEnd('2026-02-01','month') === '2026-02-28'`.
  - `bucketStart('2026-10-29','year') === '2026-01-01'`.
  - `localToday('Pacific/Kiritimati', new Date('2026-10-29T12:00:00Z')) === '2026-10-30'`.
  - `localToday('America/Los_Angeles', new Date('2026-10-29T03:00:00Z')) === '2026-10-28'`.
  - An invalid tz falls back to UTC.
- [ ] **Step 2:** Run `pnpm --dir server test -- periods`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `periods.ts`.** Use string date math on UTC midnight, as `insights/range.ts` `shiftDay` does. `localToday` uses `Intl.DateTimeFormat('en-CA', { timeZone })`.
- [ ] **Step 4: Write the migration.**
  - Create `worklogs`, with a `CHECK (minutes BETWEEN 1 AND 1440)`, foreign keys to workspaces, projects, tasks and users, and indexes on `(workspace_id, user_id, work_date)` and `(project_id, work_date)`.
  - Create `timesheet_periods`. Add a `period_end date NOT NULL` column (plan decision: it makes the range-lock query a plain `BETWEEN`), and a unique index on `(project_id, user_id, period_start)`.
  - Add `tasks.remaining_minutes int NULL`.
  - Add `projects.approval_enabled bool NOT NULL DEFAULT false`.
  - Add `projects.approval_period text NOT NULL DEFAULT 'week' CHECK (approval_period IN ('week','month'))`.
  - Write a down migration.
- [ ] **Step 5: Add the entities.** Register both in `TimeModule`'s `forFeature`, because `autoLoadEntities` needs that. Add the new columns to the Task and Project entities.
- [ ] **Step 6:** Run `pnpm --dir server test` and `pnpm --dir server test:e2e`. Expected: all green (the migration runs in global setup).
- [ ] **Step 7: Commit:** `feat(time): worklogs and timesheet periods schema, period math`

### Task 2: Worklog API, task totals and realtime

**Files:**
- Create: `server/src/time/worklogs.service.ts`, `server/src/time/worklogs.controller.ts`, `server/src/time/worklog-view.ts`, `server/src/time/locks.ts`
- Modify:
  - `server/src/access/access.service.ts`: add `holders`.
  - `server/src/tasks/task-view.ts` and `tasks.service.ts`: add the totals to the view.
  - `server/src/common/domain-events.ts`: add the event types.
  - `server/src/common/http-exception.filter.ts` `ERROR_FIELDS`: add `minutes`, `workDate`, `remaining`.
- Test: `server/test/worklogs.e2e-spec.ts`

**Interfaces:**
- Consumes:
  - `AccessService.permissions` and `AccessService.assert`.
  - `localToday` and `periodEnd` (Task 1).
- Produces:
  - `WorklogView`:
    ```ts
    { id, task: string, project: string, user: string, date: string, minutes: number, comment: string, createdAt: number, updatedAt: number }
    ```
  - `TaskView` gains `loggedMinutes: number` and `remainingMinutes: number`. The latter is the effective value: `remaining_minutes` if set, otherwise `max(0, round(estimate*60) − logged)`.
  - `AccessService.holders(wsId: string, projectId: string, any: Permission[]): Promise<string[]>` returns the user ids of current workspace members whose effective permissions on that project include any of `any`.
  - `locks.ts`: `lockedOn(em, projectId: string, userId: string, day: string): Promise<boolean>`. It is true only when `projects.approval_enabled` is set and a `submitted|approved` row has `period_start <= day <= period_end`.
  - Event types: `worklog.created`, `worklog.updated`, `worklog.deleted`, `task.time_changed`.
- Routes (all behind `WorkspaceMemberGuard`):
  - `GET /tasks/:taskId/worklogs` returns `WorklogView[]`, newest date first. Without `time.view_all`, only your own.
  - `POST /tasks/:taskId/worklogs` takes `{ minutes, date, comment?, remaining? }` and returns `{ worklog, task }`.
  - `PATCH /worklogs/:id` takes `{ minutes?, date?, comment? }` and returns `{ worklog, task }`.
  - `DELETE /worklogs/:id` returns 204.
- Rules:
  - **Create:**
    - `time.log`, else 403 `forbidden`.
    - The actor is the assignee, else 403 `not_assignee`.
    - The status is `progress|review`, else 409 `task_not_in_progress`.
    - `date <= localToday(m.tz)`, else 400 `future_date` on `workDate`.
    - The task is live (deleted → 404 `task_not_found`).
    - Not locked, else 409 `period_locked`.
    - Day total ≤ 1440, else 422 `day_over_24h` on `minutes`. The total sums the person's live worklogs on live tasks in this workspace for that date.
  - **Edit and delete:**
    - Your own worklogs need `time.edit_own`/`time.delete_own`; anyone else's need `time.edit_any`/`time.delete_any`.
    - The status rule doesn't apply.
    - The lock applies to both the old and the new date.
    - The cap applies to edits.
  - **Remaining time (plan decision, Jira `auto`):**
    - A `remaining` (minutes ≥ 0) in the body sets `tasks.remaining_minutes`.
    - Otherwise, a manual remaining already set drops by the minutes added, with a floor of 0, and goes back up by the minutes removed on edit or delete.
    - A null remaining stays null.
  - **Events:**
    - Every change publishes `task.time_changed { taskId, loggedMinutes, remainingMinutes }` to the workspace.
    - It also publishes `worklog.* { worklog }`, or `{ id, task }` on delete, with `toUser` for each of the author plus `holders(project, ['time.view_all','time.approve'])`, deduplicated. That means one `publish` call per recipient.

- [ ] **Step 1: Write `worklogs.e2e-spec.ts`.** Use `twoTeams`: lin is the owner, nia a member. For "a viewer", give nia the Viewer role the way `task-permissions.e2e-spec.ts` does. Tests:
  - `the assignee logs time on a task in progress; the task view shows the totals`
    - nia is the assignee; the task is moved to `progress` with an estimate of 3.
    - POST `{minutes: 90, date: today}` returns 201.
    - The task has `loggedMinutes` 90 and `remainingMinutes` 90.
  - `logging on a task in todo or done is 409 task_not_in_progress; review is allowed`.
  - `someone who isn't the assignee is 403 not_assignee`. lin, the owner, logs on nia's task.
  - `a viewer can't log: 403 forbidden`. Make nia the assignee, then set her role to Viewer.
  - `a future date is 400 future_date; the member's tz decides today`. Set nia's `memberships.tz` to `'Pacific/Kiritimati'` with SQL and use `localToday` to build "her today": accepted. Her today + 1 is 400. (Review Focus 5)
  - `the day cap counts every project and ignores deleted ones`:
    - 1000 min in project A plus 400 in project B on the same date: OK.
    - +100 more: 422 `day_over_24h`.
    - Soft-delete the A task (SQL `deleted_at = now()`), then +100: OK.
    - PATCH a B worklog to 1100 → 422. (Review Focus 2)
  - `minutes outside 1..1440 is 400 invalid on minutes`.
  - `remaining: an explicit value is kept and later logs reduce it`. POST with `remaining: 60` gives 60; then POST 30 gives 30; then DELETE that one gives 60.
  - `without time.view_all you see only your own worklogs; totals count everyone's`:
    - lin's worklog is inserted by SQL on nia's task.
    - nia's GET returns 1 worklog; the task's `loggedMinutes` counts both.
    - lin (owner) sees 2. (Review Focus 3)
  - `editing your own needs edit_own; others' need edit_any`:
    - nia under a custom role with `time.log` only: PATCH of her own is 403.
    - lin (owner) PATCHes nia's: 200.
  - `worklog events go to the author and to time holders only; the workspace hears time_changed`:
    - Capture events.
    - `worklog.created` has `toUser` set and its recipients are {nia, lin}.
    - `task.time_changed` has no `toUser`.
  - `another workspace's worklog is 404 worklog_not_found`. kai PATCHes nia's worklog id under his own workspace base.
- [ ] **Step 2:** Run `pnpm --dir server test:e2e -- worklogs`. Expected: FAIL (404 routes).
- [ ] **Step 3: Implement `holders`.** Use one SQL query over `memberships` joined to the project:
  - owner and admin always count;
  - the lead counts for `LEAD_PERMISSIONS`;
  - otherwise use the role permissions, via `coalesce(pm.role_id, p.default_role_id)`.
- [ ] **Step 4: Implement the worklog view, the locks, the service and the controller.**
  - Wire everything into `TimeModule`, importing `AccessModule`.
  - The task totals come from one grouped query `SUM(minutes) WHERE deleted_at IS NULL GROUP BY task_id`. Use it in `TasksService` view/list and in the snapshot task list, so every `TaskView` has both fields. Bump the server snapshot's `DATA_VERSION` to 5 (the task shape changed) and update `snapshot.e2e-spec.ts`.
- [ ] **Step 5:** Run `pnpm --dir server test:e2e`. Expected: all green, including the existing task and snapshot specs. Update any `toEqual` on a full task view to include `loggedMinutes: 0` and `remainingMinutes`; record each such update as a ledger ruling.
- [ ] **Step 6: Commit:** `feat(time): worklogs on tasks with the 24h cap, locks, totals and private realtime`

### Task 3: Tasks, projects and people around worklogs

**Files:**
- Modify: `server/src/tasks/tasks.service.ts` (`update` project change, `remove`), `server/src/time/worklogs.service.ts`
- Create: `server/src/time/time.listeners.ts` (an `@OnEvent('domain')` for `member.left`)
- Test: `server/test/worklogs-lifecycle.e2e-spec.ts`

**Interfaces:**
- Consumes: `lockedOn` and the `Worklog` entity.
- Produces: `WorklogsService.hasLockedTime(em, taskId: string): Promise<boolean>`, exported from `TimeModule`. `TasksModule` imports `TimeModule`; if that makes a cycle, use `forwardRef`.

- [ ] **Step 1: Write the tests:**
  - `moving a task to another project moves its worklogs`: afterwards the `project_id` of its worklogs is the target.
  - `a task with time in a submitted period can't change project or be deleted: 409 task_has_locked_time`. Enable approval and insert the submitted row by SQL.
  - `deleting a task hides its worklogs from the cap; restoring brings them back`.
  - `someone who leaves keeps their worklogs and loses their pending submissions`:
    - nia has a worklog and a `submitted` row, then leaves via the existing leave route.
    - The worklog row is still there; the period row is gone.
    - An `approved` row stays.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The project move runs `UPDATE worklogs SET project_id` inside the task update transaction, after the locked check.
  - `remove` checks `hasLockedTime` before soft-deleting.
  - The listener deletes the person's `submitted` rows in that workspace.
- [ ] **Step 4:** Run `pnpm --dir server test:e2e`. Expected: all green.
- [ ] **Step 5: Commit:** `feat(time): worklogs follow task moves, locked time blocks moves and deletes, leavers' submissions withdrawn`

### Task 4: Approval: project settings and the period lifecycle

**Files:**
- Create: `server/src/time/timesheets.service.ts`, `server/src/time/timesheets.controller.ts`, `server/src/time/period-view.ts`
- Modify:
  - `server/src/projects/projects.service.ts`, controller and `project-view.ts`: add `approvalEnabled` and `approvalPeriod`.
  - `domain-events.ts`: add `timesheet.changed`.
  - `ERROR_FIELDS`: add `periodStart`, `comment`.
- Test: `server/test/timesheets.e2e-spec.ts`

**Interfaces:**
- Produces:
  - `PeriodView`:
    ```ts
    { project: string, user: string, start: string, end: string, period: 'week'|'month', status: 'submitted'|'approved'|'rejected', comment: string, reviewer: string | null, at: number }
    ```
  - `ProjectView` gains `approvalEnabled: boolean` and `approvalPeriod: 'week'|'month'`.
  - Routes under `/projects/:id/timesheets`:
    - `POST submit {periodStart}` → `PeriodView`
    - `POST withdraw {periodStart}` → 204
    - `POST :userId/approve {periodStart}` → `PeriodView`
    - `POST :userId/reject {periodStart, comment}` → `PeriodView`
    - `POST :userId/reopen {periodStart}` → 204
- Rules:
  - `PATCH /projects/:id` with `approvalEnabled`/`approvalPeriod` needs `project.admin`.
  - Turning approval off deletes `submitted` rows (`approved` rows stay).
  - Changing the period leaves existing rows alone.
  - **Submit:**
    - Approval must be on, else 409 `approval_off`.
    - `periodStart` must equal `periodStart(periodStart, project.approvalPeriod)`, else 400 `invalid` on `periodStart`.
    - It can't be after `periodStart(localToday)`, else 400 `future_date`.
    - An existing `submitted`/`approved` row → 409 `period_already_submitted`. A `rejected` row becomes `submitted` again.
    - The actor needs `time.log` on the project.
  - **Withdraw:** only your own `submitted` row; otherwise 409 `period_not_submitted`.
  - **Approve and reject:**
    - Need `time.approve`.
    - Never your own: 403 `cannot_review_own`.
    - The row must be `submitted`, else 409 `period_not_submitted`.
    - Reject needs a non-empty `comment` → 400 `invalid` on `comment`.
  - **Reopen:** needs `time.approve`; the row must be `approved` (else 409 `period_not_approved`). It deletes the row.
  - **Notifications** (via `NotificationsService.create`, with kind `timesheet`):
    - On submit, every `holders(project, ['time.approve'])` except the submitter gets "submitted their hours for {project} ({start}–{end})".
    - On approve or reject, the person gets "approved your hours for…" or "sent back your hours for…: {comment}".
  - Every transition publishes `timesheet.changed { period }` to the person plus the approve/view_all holders, through `toUser`.

- [ ] **Step 1: Write `timesheets.e2e-spec.ts`:**
  - `submit, then worklogs in that week are 409 period_locked; withdraw unlocks`.
  - `approve and reject: lead only, not your own, reject needs a comment`:
    - nia submits and lin approves (200).
    - nia approving her own → 403 `cannot_review_own`.
    - Reject without a comment → 400.
  - `a rejected period counts as open and can be submitted again`.
  - `reopen deletes an approved row`.
  - `submitting with approval off is 409 approval_off; turning it off drops submitted rows and keeps approved ones`.
  - `periodStart must start a period: a Wednesday is 400 invalid on periodStart`.
  - `switching to monthly keeps old weekly locks by range` (Review Focus 1):
    - Submit week 2026-10-12, then switch to month.
    - A worklog dated 2026-10-14 → 409.
    - One dated 2026-10-20 → OK.
  - `submitting notifies approvers; approving notifies the person`. Check the `notifications` rows.
  - `a member can't turn approval on: 403`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement.** Row writes run in a transaction that takes `SELECT … FOR UPDATE` on the existing row. The unique index turns a double submit into `period_already_submitted`.
- [ ] **Step 4:** Run `pnpm --dir server test:e2e`. Expected: all green.
- [ ] **Step 5: Commit:** `feat(time): per-project approval with submit, withdraw, approve, reject and reopen`

### Task 5: Timesheet read and reports

**Files:**
- Create: `server/src/time/reports.service.ts`, `server/src/time/reports.controller.ts`
- Modify: `server/src/time/timesheets.controller.ts` (`GET /timesheet`)
- Test: `server/test/time-reports.e2e-spec.ts`

**Interfaces:**
- Consumes: `AccessService.byProject`, `bucketStart`, `toCsv` from `insights/csv.ts`.
- Produces:
  - **`GET /timesheet?from&to&user=me|team|<userId>&project=`** returns:
    ```ts
    { worklogs: WorklogView[], periods: PeriodView[], tasks: { id, title, project, status, assignee }[] }
    ```
    - `from` and `to` are `YYYY-MM-DD` with `to - from` ≤ 62 days, else 400 `invalid` on `range`.
    - `me` returns your own.
    - `team` (plan decision: the Equipo grid needs everyone) and `<userId>` return worklogs only in projects where the requester has `time.view_all`.
    - `tasks` lists every task those worklogs touch, live or not, so the grid can label rows.
  - **`GET /time-reports?from&to&groupBy=user|project|task&bucket=day|week|month|year&scope=me|team&approvedOnly=true|false`** returns:
    ```ts
    { buckets: string[], rows: { key: string, label: string, minutes: Record<string, number>, total: number }[], total: number }
    ```
    - The range is at most 731 days.
    - `approvedOnly` keeps worklogs whose date falls in an `approved` row of that person and project.
    - Rows are sorted by total, descending.
  - **`GET /time-reports.csv`** takes the same query and returns `text/csv` with the header `group,period,hours`, one line per non-zero cell, hours to 2 decimals. The `content-disposition` filename is `pane-time-{from}-{to}.csv`.

- [ ] **Step 1: Write the tests:**
  - `my report by project per week sums my worklogs`.
  - `team scope needs time.view_all: a member sees only their own rows, the owner sees everyone's`.
  - `approvedOnly keeps only approved periods`.
  - `csv has the header and hours with 2 decimals`.
  - `a user from another workspace sees nothing` (Review Focus 4):
    - kai's report in his own workspace contains none of wsA's minutes.
    - kai's GET of wsA's `/time-reports` is 403/404, matching the guard.
  - `timesheet user=team returns only view_all projects`.
  - `a range over the limit is 400 invalid on range`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement.** Use one SQL aggregate per report, with `date_trunc` buckets (`week` truncates to Monday in Postgres) on live worklogs of live tasks. Labels: person name, project name, or task title.
- [ ] **Step 4:** Run `pnpm --dir server test:e2e`. Expected: all green.
- [ ] **Step 5: Commit:** `feat(time): timesheet range read and time reports with CSV`

### Task 6: Client data, store and live updates

**Files:**
- Create: `src/lib/duration.ts`, `src/lib/duration.test.ts`, `src/lib/periods.ts`, `src/lib/periods.test.ts`
- Modify:
  - `src/data/types.ts`: `Task.loggedMinutes`, `Task.remainingMinutes`, `Worklog`, `TimePeriod`, `Project.approvalEnabled/approvalPeriod`.
  - `src/data/seed.ts`: `DATA_VERSION = 5`.
  - `src/api/live.ts` and `live.test.ts`, `src/store.tsx`.

**Interfaces:**
- Produces:
  - `parseDuration(s: string): number | null` returns minutes. It accepts `2h 30m`, `1.5h`, `90m`, `1d` (= 480), `1d 2h`, and a bare number as hours. It returns null for empty, 0, negative or garbage input.
  - `formatMinutes(m: number): string` gives `2h 30m`, `45m` or `3h`.
  - `weekStart(day)`, `monthStart(day)`, `periodEndOf(start, p)`: mirrors of the server's `periods.ts`.
  - Store additions:
    - `logWork(taskId, { minutes, date, comment, remaining? }): Promise<boolean>`
    - `editWorklog(id, patch): Promise<boolean>`
    - `deleteWorklog(id): Promise<boolean>`
    - `worklogsOf(taskId): Promise<Worklog[]>`
    - `timesheet(q): Promise<TimesheetData>`
    - `timeReport(q): Promise<TimeReport>`
    - `timeReportCsvUrl(q): string`
    - `submitPeriod(projectId, start)`, `withdrawPeriod(projectId, start)`, `reviewPeriod(projectId, userId, start, 'approve'|'reject'|'reopen', comment?)`
    - `timeTick: number`, bumped on `worklog.*` and `timesheet.changed` so open time views refetch.
    - `updateProject` passes `approvalEnabled`/`approvalPeriod` through `PROJECT_FIELDS`.
  - `applyEvent` handles `task.time_changed` by setting the task's two totals.

- [ ] **Step 1: Write the tests.**
  - Duration: each accepted format, plus `parseDuration('abc') === null` and `parseDuration('0m') === null`.
  - Periods: Monday start, and a Sunday maps to the previous Monday.
  - Live: `task.time_changed` sets `loggedMinutes`/`remainingMinutes` on the right task.
- [ ] **Step 2:** Run `pnpm test`. Expected: FAIL.
- [ ] **Step 3: Implement.** Then fix the TS fallout: seed tasks get `loggedMinutes: 0` and `remainingMinutes: estimate*60`; seed projects get `approvalEnabled: false`, `approvalPeriod: 'week'`.
- [ ] **Step 4:** Run `pnpm test && pnpm typecheck`. Expected: green.
- [ ] **Step 5: Commit:** `feat(web): time data, duration parsing and live time totals`

### Task 7: Log work in the task drawer, approval card on the project

**Files:**
- Create: `src/components/LogWork.tsx`
- Modify: `src/components/Overlays.tsx` (render it in `TaskDetail` between Subtasks and Comments), `src/pages/ProjectDetail.tsx` (a "Time approval" card), `src/styles/pages.css`

**Interfaces:**
- Consumes: the store's time functions, `parseDuration`/`formatMinutes`, and `can`.

- **LogWork:**
  - A bar with logged / remaining / estimate.
  - A form with time (Jira format), date (today by default, `max` = today), comment and an optional remaining, plus a "Log" button.
  - The list of worklogs from `worklogsOf`, refetched when `timeTick` changes. Each row has edit (inline minutes and comment) and delete, shown only when the user may.
  - The form shows only to the assignee with `time.log`. Outside progress/review the button is disabled and shows the copy from Global Constraints.
  - Invalid input shows "Use a time like 2h 30m, 1.5h or 90m." on the field.
- **Approval card:** shown with `project.admin`. It has a Switch "Require time approval" and a Seg Weekly / Monthly that is enabled only when approval is on.

- [ ] **Step 1:** Run `pnpm typecheck && pnpm test && pnpm build`. Expected: green.
- [ ] **Step 2: Check it in the browser on localhost.**
  - Log 1h on a task in progress and see the totals change.
  - On a todo task the button is disabled.
  - Turn on approval.
  - If the browser extension is unavailable, record a ruling and run an API smoke test instead.
- [ ] **Step 3: Commit:** `feat(web): log work on tasks and per-project time approval settings`

### Task 8: Timesheet page: Mis horas, Equipo and Reportes

**Files:**
- Create: `src/pages/Timesheet.tsx`, `src/pages/TimeReports.tsx`
- Modify: `src/lib/router.ts` (route `timesheet`), `src/components/Shell.tsx` (nav item "Timesheet", icon `clock`, after Insights), `src/App.tsx`, `src/styles/pages.css`

**Interfaces:**
- Consumes: `timesheet`, `timeReport`, `timeReportCsvUrl`, the period actions, `weekStart`, `formatMinutes`/`parseDuration`, `can`.

- **Tabs:** "My time", "Team" and "Reports". "Team" shows only if some project in `data.access` has `time.view_all`.
- **My time:**
  - A week view with ‹ › navigation and "This week".
  - Rows are tasks grouped by project; the columns are Mon–Sun plus a total.
  - Clicking a cell with 0 or 1 worklogs edits it inline (a duration input; empty deletes; a new value creates via `logWork` for that date).
  - A cell with several worklogs opens a small list.
  - Each project header shows a status chip ("No approval" / "Open · weekly" / "Submitted" / "Approved" with a lock) and "Submit for approval" when open.
  - "+ Add a task to this week" lists my tasks in progress or review.
- **Team:** per project where I have `time.view_all`:
  - people × days for the week, plus each person's status;
  - Approve / Reject (a prompt for the comment in an inline field, never `window.prompt`) / Reopen with `time.approve`;
  - clicking a person shows their task rows read-only.
- **Reports:**
  - A Seg Day / Week / Month / Year (the bucket).
  - From/to dates (a default per bucket: Day → this week, Week → last 8 weeks, Month → this year, Year → last 3 years).
  - Group by Person / Project / Task, the scope (me / team when available) and an "Approved only" check.
  - A table of rows × buckets, an "Export CSV" button (fetch with auth and download through `downloadCsv`-style blob logic), and totals.

- [ ] **Step 1:** Run `pnpm typecheck && pnpm test && pnpm build`. Expected: green.
- [ ] **Step 2: Check it in the browser on localhost:** log from the grid, submit, approve as the other user, and check the report and CSV. Use the same fallback as Task 7.
- [ ] **Step 3: Commit:** `feat(web): timesheet page with my time, team approval and reports`

### Task 9: Docs and final suite

**Files:**
- Modify: `docs/ops/production.md`, under a new "Time tracking" heading: the 24 h cap per workspace, local `work_date`, approval off by default, and that the migration adds empty tables (no backfill).

- [ ] **Step 1:** Run `pnpm --dir server test`, `pnpm --dir server test:e2e`, `pnpm test`, `pnpm typecheck`, `pnpm build` and `pnpm --dir server build`. Expected: all green.
- [ ] **Step 2: Commit:** `docs: time tracking in the runbook`

## Decisions this plan makes (beyond the spec)

- `timesheet_periods.period_end` is stored, so locks are a plain range check.
- Remaining time follows Jira's `auto`: a manual remaining moves with logged time, and an unset one stays computed.
- `GET /timesheet?user=team` exists for the Equipo grid; the spec only named `me|<id>`.
- Reports live as a third tab on the Timesheet page (spec §8 leaves this to the builder).
- Worklog events go out as one `toUser` publish per recipient, because the realtime bridge already supports a single user per event.
