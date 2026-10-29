# Backend fase 3 — dominio: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todo lo que hoy hace `src/store.tsx` sobre los datos del equipo tiene endpoint, test y evento en vivo: proyectos, tareas (orden, subtareas, comentarios, borrar y deshacer, versión), calendario, avisos, focus, preferencias y `GET /snapshot` con la forma `Data` del frontend.

**Architecture:** Un módulo Nest por área (`projects/`, `tasks/`, `calendar/`, `notifications/`, `focus/`, `prefs/`, `snapshot/`), todas las rutas de equipo bajo `/workspaces/:wsId/…` con `JwtAuthGuard` + `WorkspaceMemberGuard` (fase 2). Cada mutación publica un `DomainEvent`; `RealtimeBridge` (fase 2) lo reparte. Las respuestas usan la forma de `src/data/types.ts` para que la fase 6 cambie `localStorage` por la API sin traducir.

**Tech Stack:** lo de las fases 1 y 2. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-10-28-backend-design.md` (sección 2 —orden, concurrencia, deshacer—, 4 —tablas de dominio—, 5 —Proyectos, Tareas, Calendario, Avisos, Focus, Yo—, 6 —eventos— y la fila **3** de la sección 7).

**Rama:** `feat/backend-phase3`, cortada de `dev`; PR contra `dev`.

**Fuera de esta fase:** quién genera avisos (mención, asignación, vencimiento, reunión) es la fase 5: aquí solo existen la tabla, el servicio, la API y el evento. Las salas `project:{id}` del spec no se crean: ningún evento las necesita (todo va a `ws:{wsId}`); se añadirán cuando un evento sea por proyecto. Insights es la fase 4 (aquí solo se escribe `task_activity`).

## Global Constraints

- Todo lo de las fases 1 y 2 sigue vigente (prefijo `/api/v1`, migraciones a mano, errores `{ code, message, field? }`, `parseBody`, `@Actor()` + `X-Client-Id`, commits sin `Co-Authored-By`).
- Cada ruta nueva de equipo se añade a `routes` de `server/test/tenancy.e2e-spec.ts` (403 `not_a_member`, sin datos).
- **Referencias dentro del equipo:** todo id que llega en un body (proyecto, responsable, lead, miembros, asistentes, tarea de focus) debe pertenecer al mismo workspace; si no → `400 invalid` con el `field` correspondiente. Nunca se crea una fila de A que apunte a B.
- Un recurso de otro workspace o borrado se trata como inexistente: `404 <recurso>_not_found` (`project_not_found`, `task_not_found`, `event_not_found`, `milestone_not_found`, `subtask_not_found`, `focus_not_found`).
- Enumerados (`text` + `CHECK`) de `src/data/types.ts`: `Hue`, `ProjectIcon`, `ProjectStatus`, `Status`, `Priority`, `EventKind`. Fechas de calendario como `date` y en JSON `'YYYY-MM-DD'`. Instantes de comentarios y avisos en JSON como milisegundos (`at: number`), como en el frontend.
- **Concurrencia:** tareas y proyectos llevan `version int`. `PATCH` exige `version` en el body; si no coincide → `409 version_conflict` "Someone else changed this. Reload to see the latest." Cada escritura que cambia la fila suma 1 y la respuesta devuelve la `version` nueva. `move` no exige `version` pero la incrementa.
- **Orden del tablero:** `order double precision`. Tarea nueva o que cambia de columna por `PATCH status` → arriba de su columna (`min(order) − 1`, o `0` si está vacía). `move` con `beforeId`: `'top'` → arriba; un id → punto medio entre ese y su anterior; `null` → al final (`max + 1`). Si el hueco entre vecinos es `< 1e-6`, se renumera la columna (`0, 1, 2…` en su orden actual) y se recalcula.
- **`doneAt`:** al entrar en `done` se fija la fecha de hoy (`'YYYY-MM-DD'` UTC del `CLOCK`) si no la tenía; al salir de `done` se borra.
- **Borrado lógico** (`deleted_at`) en tareas y eventos de calendario; `POST …/:id/restore` lo deshace. Lo borrado no sale en listados, `snapshot` ni `GET` por id.
- **Eventos** (payload `{ by, at, ...data }`): `project.created|updated|deleted { project }` (sin `pinned`/`starred`, que son de cada persona) / `{ id }`, `milestone.updated { projectId, milestones }`, `task.created|updated|moved|restored { task }`, `task.deleted { id }`, `comment.created { taskId, comment }`, `event.created|updated { event }`, `event.deleted { id }`, `notification.created { notice }` solo a la sala `user:{recipientId}`.

## Review Focus

1. **Referencia cruzada entre equipos en el body**: crear o editar una tarea de A con `project` o `assignee` de B, un evento con `people` de B, o un focus con `taskId` de B → `400 invalid`, nada escrito. Test en Tasks 1, 2, 5 y 6.
2. **Dos personas editando la misma tarjeta**: el segundo `PATCH` con la `version` vieja → `409 version_conflict` y no pisa el cambio del primero. Test en Task 2 (y proyectos en Task 1).
3. **Arrastrar muchas veces al mismo hueco**: 60 `move` seguidos entre las dos mismas tarjetas mantienen un orden estricto y estable (rebalanceo). Test en Task 3.
4. **Deshacer tras borrar**: borrar y restaurar devuelve la tarea con sus subtareas y comentarios; un segundo cliente ve `task.deleted` y luego `task.restored`. Test en Task 2 y Task 7.
5. **Aviso a otra persona**: `notification.created` llega solo al destinatario, nunca al resto del equipo ni a otro equipo; `read-all` solo marca los avisos de quien lo llama. Test en Task 6.

---

### Task 1: Proyectos, hitos, miembros y preferencias por persona

**Files:**
- Create: `server/src/db/migrations/1793404800000-Projects.ts` (`projects`, `project_members`, `project_user_prefs`, `milestones`)
- Create: `server/src/projects/{project.entity.ts, milestone.entity.ts, project-member.entity.ts, project-prefs.entity.ts, projects.service.ts, projects.controller.ts, milestones.controller.ts, project-view.ts, projects.module.ts}`
- Create: `server/src/common/enums.ts` (los enumerados de dominio de Global Constraints), `server/src/workspaces/refs.service.ts`
- Modify: `server/src/common/domain-events.ts` (amplía `DomainEventType`), `server/src/common/http-exception.filter.ts` (`ERROR_FIELDS` + `desc, hue, icon, status, start, due, lead, members, version`), `server/src/app.module.ts`
- Test: `server/test/projects.e2e-spec.ts`, `server/test/tenancy.e2e-spec.ts`

**Interfaces:**
- Produces: `WorkspaceRefs.assertMembers(wsId, userIds: string[], field: ErrorField): Promise<void>`, `assertProject(wsId, projectId, field = 'project'): Promise<void>` — `400 invalid` si alguno no es del workspace (lo usan Tasks 2, 5, 6).
- Produces: `toProjectView(p, memberIds, milestones, prefs?): ProjectView` con la forma `Project` del frontend + `version`; `milestones` ordenados por `position`; `desc` ↔ columna `description`; `start`/`due` ↔ `start_date`/`due_date`.
- Produces: `assertVersion(current: number, sent: number)` en `server/src/common/version.ts` (lanza `409 version_conflict`; lo usa Task 2).
- Rutas: `GET /…/projects`, `POST` `{ name, desc?, hue, icon, status?='planning', start?=hoy, due, lead?=yo, members?=[yo] }` → 201 con un hito `Kickoff` en `due` (como `addProject`), `GET /:id`, `PATCH /:id { version, …campos }`, `DELETE /:id` → 204 (borrado lógico; con tareas vivas → `409 project_has_tasks`), `PUT /:id/members { userIds }` (incluye siempre al lead), `PUT /:id/prefs { pinned?, starred? }` (sin evento), `POST|PATCH|DELETE /:id/milestones[/:mid]` `{ title, due, done? }`.
- Solo owner/admin o el lead del proyecto pueden `PATCH`, `DELETE`, `PUT members` y tocar hitos → si no, `403 forbidden`. Cualquier miembro crea proyectos y cambia sus propias prefs.

- [ ] **Step 1: Tests que fallan**

```ts
it('creating a project gives it a Kickoff milestone and makes me lead and member', async () => {
  const res = await t.http.post(`${base}/projects`).set(lin.auth).send({ name: 'Tide', hue: 'teal', icon: 'leaf', due: '2026-12-01' }).expect(201)
  expect(res.body).toMatchObject({ name: 'Tide', status: 'planning', lead: lin.user.id, members: [lin.user.id], pinned: false, starred: false, version: 1,
    milestones: [{ title: 'Kickoff', due: '2026-12-01', done: false }] })
  expect(events.map(e => e.type)).toEqual(['project.created'])
})
it('a stale version is 409 version_conflict and keeps the newer change', …)   // dos PATCH con version 1
it('pinned and starred are per person', …)                                       // lin fija, nia no lo ve fijado
it('a lead or member from another workspace is 400 invalid', …)                  // field 'lead' / 'members'
it('a plain member who is not the lead cannot edit, delete or change members', …) // 403 forbidden
it('deleting a project with live tasks is 409 project_has_tasks', …)            // inserta una tarea por SQL
it('milestones: add, complete, remove — each publishes milestone.updated with the full list', …)
```

Añadir a `tenancy.e2e-spec.ts` las rutas de proyectos e hitos (con un uuid cualquiera como `:id`).

- [ ] **Step 2:** `pnpm test:e2e projects tenancy` → FAIL.
- [ ] **Step 3:** Migración (FK a `workspaces` con `ON DELETE CASCADE`; `projects.lead_id` FK a `users`; índices por `workspace_id`), entidades, servicios, controladores.
- [ ] **Step 4:** → PASS; `pnpm migration:run` local pasa.
- [ ] **Step 5:** Commit `feat(server): projects, milestones and per-person prefs`.

### Task 2: Tareas — crear, editar con versión, borrar y restaurar

**Files:**
- Create: `server/src/db/migrations/1793404900000-Tasks.ts` (`tasks`, `subtasks`, `task_comments`, `task_activity`)
- Create: `server/src/tasks/{task.entity.ts, subtask.entity.ts, comment.entity.ts, activity.entity.ts, tasks.service.ts, tasks.controller.ts, task-view.ts, tasks.module.ts}`
- Modify: `server/src/projects/projects.service.ts` (la comprobación `project_has_tasks` usa ahora la tabla real)
- Test: `server/test/tasks.e2e-spec.ts`, `server/test/tenancy.e2e-spec.ts`

**Interfaces:**
- Consumes: `WorkspaceRefs`, `assertVersion` (Task 1).
- Produces: `toTaskView(t, subtasks, comments): TaskView` con la forma `Task` del frontend + `version` (`project` ↔ `project_id`, `assignee` ↔ `assignee_id` o `''` si es null, `due` ↔ `due_date`, `doneAt` solo si existe, `comments[].who` ↔ `author_id`, `comments[].at` en ms). `TasksService.view(wsId, id): Promise<TaskView>` (la usan Tasks 3, 4 y 7).
- Produces: `TasksService.recordActivity(task, actorId, kind: 'created' | 'status' | 'deleted' | 'restored', from?: Status, to?: Status)` y la regla de "arriba de la columna" `topOrder(wsId, status): Promise<number>` (la usa Task 3).
- Rutas: `GET /…/tasks?project&assignee&status&q` (`q` busca en el título sin distinguir mayúsculas; orden por `status`, `order`), `POST { title, project, assignee?, status?='todo', priority?='medium', due?, estimate?=1 }` → 201, `GET /:id`, `PATCH /:id { version, title?, project?, assignee?, status?, priority?, due?, estimate? }`, `DELETE /:id` → 204, `POST /:id/restore` → 200.
- Cualquier miembro del workspace crea, edita, borra y restaura tareas.

- [ ] **Step 1: Tests que fallan**

```ts
it('a new task lands at the top of its column with version 1', …)        // dos tareas: la segunda tiene order menor
it('two people edit the same card: the second stale PATCH is 409 and the first change stays', async () => {
  const task = await create({ title: 'Ship it' })
  await t.http.patch(url(task.id)).set(lin.auth).send({ version: 1, title: 'Ship it today' }).expect(200)
  const res = await t.http.patch(url(task.id)).set(nia.auth).send({ version: 1, priority: 'urgent' }).expect(409)
  expect(res.body.code).toBe('version_conflict')
  expect((await t.http.get(url(task.id)).set(lin.auth)).body).toMatchObject({ title: 'Ship it today', priority: 'medium', version: 2 })
})
it('PATCH status to done sets doneAt, puts it on top of done and logs activity; back to todo clears doneAt', …)
it('a project or assignee from another workspace is 400 invalid', …)
it('deleted tasks disappear from lists and GET; restore brings them back with subtasks and comments', …) // subtareas/comentarios por SQL
it('filters: project, assignee, status and q', …)
it('publishes task.created / task.updated / task.deleted / task.restored', …)
```

- [ ] **Step 2:** `pnpm test:e2e tasks tenancy` → FAIL.
- [ ] **Step 3:** Implementar. `assignee_id` nullable; `title` 1–200; `estimate` 0–100 (horas, admite decimales).
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(server): tasks with versions, soft delete and activity`.

### Task 3: Mover tareas en el tablero

**Files:**
- Create: `server/src/tasks/order.ts`, `server/src/tasks/order.spec.ts`
- Modify: `server/src/tasks/tasks.service.ts`, `server/src/tasks/tasks.controller.ts`
- Test: `server/test/tasks-move.e2e-spec.ts`

**Interfaces:**
- Consumes: `topOrder`, `recordActivity`, `view` (Task 2).
- Produces: `placeOrder(column: number[], beforeIndex: number | 'top' | 'end'): number | null` en `order.ts` — `column` son los `order` de la columna destino ya ordenados y sin la tarea movida; devuelve el nuevo `order`, o `null` si el hueco es `< 1e-6` (el servicio renumera la columna en una transacción y vuelve a llamar).
- Ruta: `POST /…/tasks/:id/move { status, beforeId?: uuid | 'top' | null }` → 200 `TaskView`; publica `task.moved { task }`. `beforeId` que no está en la columna destino → `400 invalid` (field `beforeId`; añadirlo a `ERROR_FIELDS`). Mover a otra columna registra actividad `status` y aplica la regla de `doneAt`.

- [ ] **Step 1: Tests que fallan**

```ts
// order.spec.ts
it.each([
  [[1, 2, 3], 'top', 0], [[1, 2, 3], 'end', 4], [[1, 2, 3], 1, 1.5], [[], 'top', 0], [[], 'end', 0],
])('placeOrder(%p, %p) = %p', (col, at, want) => expect(placeOrder(col, at)).toBe(want))
it('returns null when the gap is below 1e-6', () => expect(placeOrder([1, 1 + 5e-7], 1)).toBeNull())

// tasks-move.e2e-spec.ts
it('moves before another card, to the top and to the end', …)
it('60 drops into the same gap keep a strict, stable order', async () => {
  // a, b, x en todo; 60 veces: mover x entre a y b, luego b entre a y x alternando
  // al final GET ?status=todo devuelve un orden estricto (sin empates) y el esperado
})
it('moving into done sets doneAt and logs a status activity', …)
it('a beforeId from another column is 400 invalid', …)
it('a second client sees task.moved', …)  // captureEvents basta aquí
```

- [ ] **Step 2:** `pnpm test order && pnpm test:e2e tasks-move` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(server): board ordering and task moves`.

### Task 4: Subtareas y comentarios

**Files:**
- Create: `server/src/tasks/subtasks.controller.ts`, `server/src/tasks/comments.controller.ts`
- Modify: `server/src/tasks/tasks.service.ts`, `server/src/tasks/tasks.module.ts`
- Test: `server/test/task-parts.e2e-spec.ts`, `server/test/tenancy.e2e-spec.ts`

**Interfaces:**
- Consumes: `view` (Task 2).
- Rutas: `POST /…/tasks/:id/subtasks { title }` → 201 `TaskView`; `PATCH /…/tasks/:id/subtasks/:sid { title?, done? }` → 200 `TaskView`; `DELETE …/:sid` → 200 `TaskView`. Cada una publica `task.updated { task }` y no exige `version` (sí la incrementa). `POST /…/tasks/:id/comments { text }` (1–2000) → 201 `Comment` (`{ id, who, text, at }`) y publica `comment.created { taskId, comment }`; `DELETE /…/tasks/:id/comments/:cid` solo su autor → 204 (si no, `403 forbidden`), publica `task.updated`.
- Subtareas en `position` creciente; comentarios por `created_at`.

- [ ] **Step 1: Tests que fallan** — añadir, marcar, renombrar y borrar una subtarea (la `TaskView` devuelta refleja cada paso y `version` sube); comentar (forma `Comment` con `at` en ms); borrar el comentario de otro → 403; subtarea o tarea de otro workspace → 404; eventos publicados.
- [ ] **Step 2:** `pnpm test:e2e task-parts tenancy` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(server): subtasks and comments`.

### Task 5: Calendario

**Files:**
- Create: `server/src/db/migrations/1793405000000-Calendar.ts` (`events`, `event_attendees`)
- Create: `server/src/calendar/{cal-event.entity.ts, attendee.entity.ts, calendar.service.ts, calendar.controller.ts, event-view.ts, calendar.module.ts}`
- Test: `server/test/calendar.e2e-spec.ts`, `server/test/tenancy.e2e-spec.ts`

**Interfaces:**
- Consumes: `WorkspaceRefs` (Task 1).
- Produces: `toEventView(e, people): CalEventView` con la forma `CalEvent` (`start` ↔ `start_min`, `dur` ↔ `dur_min`, `where` ↔ `location`, `project` solo si existe, `people` = ids).
- Rutas: `GET /…/events?from&to` (fechas inclusive, obligatorias, máx. 366 días → si no `400 invalid`), `POST { title, date, start, dur, where?, kind, hue, project?, people? }` → 201, `PATCH /:id`, `DELETE /:id` → 204, `POST /:id/restore`. `start` 0–1439, `dur` 5–1440. Eventos `event.created|updated|deleted` (restaurar publica `event.created`).

- [ ] **Step 1: Tests que fallan** — crear y listar por rango (fuera del rango no sale); `people` o `project` de otro workspace → 400; borrar y restaurar; rango invertido o > 366 días → 400; eventos publicados.
- [ ] **Step 2:** `pnpm test:e2e calendar tenancy` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(server): calendar events`.

### Task 6: Avisos, focus, preferencias y `PATCH /me`

**Files:**
- Create: `server/src/db/migrations/1793405100000-NoticesFocusPrefs.ts` (`notifications`, `focus_sessions`, `user_prefs`)
- Create: `server/src/notifications/{notification.entity.ts, notifications.service.ts, notifications.controller.ts, notifications.module.ts}`, `server/src/focus/{focus-session.entity.ts, focus.service.ts, focus.controller.ts, focus.module.ts}`, `server/src/prefs/{user-prefs.entity.ts, prefs.service.ts, prefs.controller.ts, prefs.module.ts}`
- Modify: `server/src/common/domain-events.ts` (`DomainEvent.toUser?: string`), `server/src/realtime/realtime.bridge.ts` (con `toUser`, emite solo a `user:{toUser}`), `server/src/users/me.controller.ts` + `users.service.ts` (`PATCH /me { name?, avatarSkin? }`)
- Test: `server/test/notifications.e2e-spec.ts`, `server/test/focus.e2e-spec.ts`, `server/test/prefs.e2e-spec.ts`, `server/test/realtime.e2e-spec.ts`, `server/test/tenancy.e2e-spec.ts`

**Interfaces:**
- Consumes: `MembersService.setPresence` (fase 2), `WorkspaceRefs` (Task 1).
- Produces: `NotificationsService.create(wsId, recipientId, actor: Actor, kind: string, text: string): Promise<Notice>` (la fase 5 lo usa) — guarda `payload = { text }` y publica `notification.created { notice }` con `toUser: recipientId`. `Notice` = `{ id, who, text, at, read, to }`.
- Rutas avisos: `GET /…/notifications` (los míos, 50 más nuevos primero), `POST /…/notifications/read-all` → 204 (solo los míos).
- Rutas focus: `POST /…/focus-sessions { plannedSec 60–14400, label?, taskId? }` → 201 y pone mi presencia en `focus` con nota = label (o `'{n}-minute block'`); `PATCH /…/focus-sessions/:id { actualSec }` termina la sesión (solo su dueño; ya terminada → `409 focus_ended`) y, si sigo en `focus`, me pasa a `online`; `GET /…/focus-sessions?from&to` → `FocusLog[]` `{ date, minutes }` míos, agrupados por día en la `tz` de mi membresía.
- Rutas prefs: `GET /me/prefs` (defaults: `notify { mentions: true, due: true, meetings: true, digest: false, focus: true }`, `session 25`, `pause 5`, `look { theme: 'dark', wall: 'ash', accent: 'blue', glass: 'tinted', solid: false }`), `PATCH /me/prefs` (merge parcial, también dentro de `notify` y `look`; valores fuera de los enumerados de `Look` → 400).

- [ ] **Step 1: Tests que fallan**

```ts
it('a notice reaches only its recipient’s sockets', async () => {
  const [linS, niaS, kaiS] = await Promise.all([connect(t, lin.token), connect(t, nia.token), connect(t, kai.token)])
  const seen = nextEvent(niaS, 'notification.created')
  await t.app.get(NotificationsService).create(ws, nia.user.id, { userId: lin.user.id }, 'assigned', 'Lin assigned you “Ship it”')
  expect(await seen).toMatchObject({ notice: { who: lin.user.id, text: 'Lin assigned you “Ship it”', read: false, to: nia.user.id } })
  await Promise.all([noEvent(linS, 'notification.created'), noEvent(kaiS, 'notification.created')])
})
it('read-all marks only my notices', …)
it('starting focus sets my presence to focus with the label; ending it returns me online and logs minutes by day', …)
it('a focus taskId from another workspace is 400 invalid', …)
it('ending someone else’s session is 404 focus_not_found; ending twice is 409 focus_ended', …)
it('prefs: defaults, partial merge into notify and look, invalid accent is 400', …)
it('PATCH /me renames me and the new name shows in members', …)
```

- [ ] **Step 2:** `pnpm test:e2e notifications focus prefs realtime tenancy` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(server): notices, focus sessions and preferences`.

### Task 7: `GET /snapshot` y prueba de punta a punta

**Files:**
- Create: `server/src/snapshot/{snapshot.service.ts, snapshot.controller.ts, snapshot.module.ts}`
- Test: `server/test/snapshot.e2e-spec.ts`, `server/test/live-board.e2e-spec.ts`, `server/test/tenancy.e2e-spec.ts`

**Interfaces:**
- Consumes: vistas y servicios de Tasks 1–6, `MembersService.list` (fase 2).
- Produces: `GET /…/snapshot` → `{ version: 3, me, people, projects, tasks, events, notices, focus, prefs }` con la forma `Data` de `src/data/types.ts` (`version` = `DATA_VERSION` del frontend, `3`); `projects` con `pinned`/`starred` de quien llama; `tasks` sin borradas y ordenadas por `status`, `order`; `events` sin borrados (todos, sin rango); `notices` y `focus` solo los míos; `prefs` sin `look` (el `look` va por `/me/prefs`). Todas las consultas por `workspace_id`: nada de otros equipos.

- [ ] **Step 1: Tests que fallan**

```ts
it('returns the frontend Data shape with only this workspace’s live data', …)
// siembra en A y en B un proyecto, tareas (una borrada), un evento, un aviso para cada persona y focus;
// snapshot de A: claves exactas, nada de B, sin la tarea borrada, avisos y focus solo de quien llama

// live-board.e2e-spec.ts — dos navegadores
it('two members see each other’s board changes live, and the author’s tab does not get an echo', async () => {
  // lin (tab-a) y nia conectados; lin crea, mueve, comenta, borra y restaura una tarea con X-Client-Id: tab-a
  // nia recibe task.created, task.moved, comment.created, task.deleted, task.restored en ese orden; tab-a no recibe ninguno
})
```

- [ ] **Step 2:** `pnpm test:e2e snapshot live-board tenancy` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `pnpm test && pnpm test:e2e` → todo PASS.
- [ ] **Step 5:** Commit `feat(server): workspace snapshot`.
