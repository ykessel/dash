# Backend fase 2 — workspaces y tiempo real base: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Equipos reales: un usuario crea un workspace, invita a otra persona por email, esta acepta y ambos ven su presencia en vivo, sin que un equipo vea nunca datos de otro.

**Architecture:** Módulo `workspaces/` (workspaces, membresías, invitaciones, `WorkspaceMemberGuard`) y módulo `realtime/` (gateway Socket.IO en `/realtime`, `RealtimeBridge`, presencia en memoria). Los servicios publican `DomainEvent` con `@nestjs/event-emitter`; el bridge decide sala y payload. Nada del dominio conoce el socket.

**Tech Stack:** lo de la fase 1 + `@nestjs/event-emitter`, `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io`, `socket.io-client` (dev).

**Spec:** `docs/superpowers/specs/2026-10-28-backend-design.md` (secciones 2 —multi-tenant, tiempo real, eventos—, 4 —`workspaces`, `memberships`, `invitations`—, 5 —Workspaces, Miembros, Invitaciones, `GET /me/workspaces`—, 6 y la fila **2** de la sección 7).

**Rama:** `feat/backend-phase2`, cortada de `feat/backend-phase1` (el PR #6 aún no está mergeado). Al mergear la fase 1, rebase sobre la base.

**Fuera de esta fase:** `GET /workspaces/:wsId/snapshot`, `PATCH /me`, `/me/prefs` y las salas `project:{id}` (`join`) van con el dominio en la fase 3; transferir la propiedad y borrar un workspace no están en el spec; adaptador Redis en la fase 7.

## Global Constraints

- Todo lo de la fase 1 sigue vigente: prefijo `/api/v1`, `synchronize: false`, errores `{ code, message, field? }`, validación con `parseBody` (zod), emails normalizados, commits sin `Co-Authored-By`.
- Todo lo del equipo cuelga de `/workspaces/:wsId/…` y pasa por `JwtAuthGuard` + `WorkspaceMemberGuard`: workspace inexistente o `:wsId` no-uuid → `404 workspace_not_found`; no miembro → `403 not_a_member`. Nunca datos de otro equipo.
- Enumerados guardados como `text` con `CHECK`, valores de `src/data/types.ts`: `Team = 'Product'|'Design'|'Engineering'|'Marketing'`, `Presence = 'online'|'focus'|'meeting'|'away'`; rol de acceso `'owner'|'admin'|'member'`.
- Un miembro se devuelve con la forma `Person` del frontend más el rol: `{ id, name, email, skin, role: <title>, team, city, tz, capacity, presence, note?, access }`. `role` es el cargo (como hoy en `Person`), `access` es el permiso.
- Invitaciones: token de 32 bytes base64url, se guarda `sha256` (reusar `randomToken`/`sha256` de `auth-tokens.service.ts`), caduca a los 7 días, enlace `${APP_URL}/#/invite?token=…`. Solo `POST /invitations/accept` lo consume.
- Socket.IO: namespace `/realtime`, `auth: { token, clientId? }` en el handshake. Salas `user:{id}`, `ws:{wsId}`, `client:{clientId}`. Payload de cada evento `{ by, at, ...data }`.
- Eco: las mutaciones REST leen la cabecera `X-Client-Id`; el evento no se envía a la sala `client:{clientId}`.
- Presencia: `online` al conectar (solo si estaba `away`), `away` cuando se cierra el último socket del usuario tras una gracia de 30 s (`PRESENCE_GRACE_MS`, inyectable para tests). Vive en memoria (una instancia); Redis queda para la fase 7.

## Review Focus

1. **Fuga entre equipos por cualquier ruta**: un miembro de B que llama a cada endpoint de `/workspaces/{idDeA}/…` recibe `403 not_a_member` y ningún dato de A. Test que recorre la lista de rutas en Task 1 (se amplía en Tasks 2 y 3).
2. **Evento en vivo a otro equipo**: un socket de B nunca recibe eventos de A, ni tras aceptar una invitación a un tercer workspace. Test en Task 4.
3. **Miembro expulsado sigue escuchando**: tras `DELETE …/members/:id`, sus sockets salen de `ws:{wsId}` y no reciben más eventos de ese equipo. Test en Task 4.
4. **Invitación aceptada por otra cuenta**: el token llega a `ana@x.com` pero lo acepta la sesión de `bob@x.com` → `403 invite_email_mismatch`, sin membresía. Test en Task 3.
5. **Dos pestañas y un cierre**: con dos sockets del mismo usuario, cerrar uno no lo marca `away`; cerrar ambos y reconectar antes de la gracia tampoco. Test en Task 5.

---

### Task 1: Workspaces, membresías y `WorkspaceMemberGuard`

**Files:**
- Create: `server/src/db/migrations/1793318400000-Workspaces.ts` (tablas `workspaces`, `memberships`, `invitations` con sus `CHECK` e índices)
- Create: `server/src/workspaces/{workspace.entity.ts, membership.entity.ts, workspaces.service.ts, workspaces.controller.ts, workspace-member.guard.ts, roles.decorator.ts, person.ts, workspaces.module.ts, slug.ts}`
- Create: `server/src/common/actor.decorator.ts`
- Modify: `server/src/app.module.ts`, `server/src/users/me.controller.ts` (`GET /me/workspaces`), `server/src/auth/auth.module.ts` (exportar lo que haga falta)
- Test: `server/test/workspaces.e2e-spec.ts`, `server/test/tenancy.e2e-spec.ts`, `server/src/workspaces/slug.spec.ts`; Modify: `server/test/utils/seed.ts`

**Interfaces:**
- Produces: `memberships` PK (`workspace_id`, `user_id`), columnas del spec + `joined_at timestamptz default now()`; defaults `team 'Product'`, `title ''`, `city ''`, `tz 'UTC'`, `capacity 32`, `presence 'away'`, `presence_note null`.
- Produces: `WorkspaceMemberGuard` (usar siempre después de `JwtAuthGuard`) que deja `req.membership: Membership`; `@Roles('owner','admin')` → si el rol no está, `403 forbidden` "You don’t have permission to do that.".
- Produces: `@CurrentMembership(): Membership`; `@Actor(): Actor` con `interface Actor { userId: string; clientId?: string }` (de `req.user.id` y la cabecera `X-Client-Id`).
- Produces: `toPerson(m: Membership, u: User): Person` en `person.ts` (forma de Global Constraints).
- Produces: `slugify(name: string): string` — minúsculas, `[a-z0-9-]`, sin guiones repetidos ni en los extremos, máx. 40, vacío → `'team'`.
- Produces: `WorkspacesService.create(userId, { name, team?, title? }): Promise<{ workspace, member: Person }>`, `get(wsId)`, `rename(wsId, name, actor)`, `listForUser(userId): Promise<{ id, name, slug, access }[]>` (orden `joined_at`).
- Produces (test utils): `signedIn(t, email?): Promise<{ user: User; token: string; auth: { Authorization: string } }>` — siembra el usuario si no existe y emite el access token con `SessionService.start`.

- [ ] **Step 1: Tests que fallan**

```ts
// slug.spec.ts
it.each([['Pane Studio', 'pane-studio'], ['  Ñandú & Co!! ', 'nandu-co'], ['!!!', 'team']])('slugify(%s) = %s', (a, b) => expect(slugify(a)).toBe(b))

// workspaces.e2e-spec.ts
it('creating a workspace makes you its owner', async () => {
  const lin = await signedIn(t)
  const res = await t.http.post('/api/v1/workspaces').set(lin.auth).send({ name: 'Pane Studio', team: 'Design', title: 'Lead' }).expect(201)
  expect(res.body.workspace).toMatchObject({ name: 'Pane Studio', slug: 'pane-studio' })
  expect(res.body.member).toMatchObject({ id: lin.user.id, access: 'owner', team: 'Design', role: 'Lead', presence: 'away', capacity: 32 })
  const mine = await t.http.get('/api/v1/me/workspaces').set(lin.auth).expect(200)
  expect(mine.body).toEqual([{ id: res.body.workspace.id, name: 'Pane Studio', slug: 'pane-studio', access: 'owner' }])
})
it('two workspaces with the same name get different slugs', …)          // segundo slug ≠ 'pane-studio', empieza por 'pane-studio-'
it('an empty name is 400 invalid on field name', …)
it('a member can read the workspace but only owner/admin can rename it', …) // member → PATCH 403 forbidden
it('an unknown or malformed workspace id is 404 workspace_not_found', …)  // uuid aleatorio y 'abc'
it('no token is 401', …)

// tenancy.e2e-spec.ts — lista de rutas que crecerá en Tasks 2 y 3
const routes: [method: 'get' | 'patch' | 'post' | 'delete', path: (ws: string) => string][] = [
  ['get', ws => `/api/v1/workspaces/${ws}`],
  ['patch', ws => `/api/v1/workspaces/${ws}`],
]
it.each(routes)('%s %s from another team is 403 not_a_member and leaks nothing', async (m, path) => {
  const res = await t.http[m](path(wsA)).set(nia.auth).send({ name: 'x' }).expect(403)
  expect(res.body).toEqual({ code: 'not_a_member', message: expect.any(String) })
})
```

- [ ] **Step 2:** `pnpm test slug && pnpm test:e2e workspaces tenancy` → FAIL (módulos inexistentes).
- [ ] **Step 3:** Migración, entidades, servicio, guard, decoradores, controlador. Slug único: intenta `slugify(name)`; si choca (`isUniqueViolation`), añade `-` + 4 caracteres base36 aleatorios, hasta 5 intentos. Crear workspace + membresía owner en una transacción.
- [ ] **Step 4:** Mismos comandos → PASS. `pnpm migration:run` sobre la BD local también pasa.
- [ ] **Step 5:** Commit `feat(server): workspaces, memberships and tenant guard`.

### Task 2: Miembros y eventos de dominio

**Files:**
- Create: `server/src/workspaces/members.service.ts`, `server/src/workspaces/members.controller.ts`, `server/src/common/domain-events.ts`
- Modify: `server/src/app.module.ts` (`EventEmitterModule.forRoot()`), `server/src/workspaces/workspaces.service.ts` (publicar `workspace.updated`)
- Test: `server/test/members.e2e-spec.ts`, `server/test/tenancy.e2e-spec.ts` (añadir rutas); Create: `server/test/utils/events.ts`

**Interfaces:**
- Consumes: `WorkspaceMemberGuard`, `@Roles`, `@Actor`, `toPerson` (Task 1).
- Produces: `type DomainEventType = 'workspace.updated' | 'member.joined' | 'member.updated' | 'member.left' | 'presence.changed'` (la fase 3 la amplía); `interface DomainEvent { type; workspaceId: string; actor: Actor; data: Record<string, unknown>; at: Date }`; `DomainEvents.publish(type, workspaceId, actor, data): void` emite `'domain'` en `EventEmitter2` con `at` del `CLOCK`.
- Produces: `MembersService.list(wsId): Promise<Person[]>` (orden por nombre), `update(wsId, userId, patch, by: Membership, actor)`, `remove(wsId, userId, by: Membership, actor)`, `setPresence(wsId, userId, presence, note, actor)`, `addMember(wsId, userId, fields, actor)` (lo usa Task 3), `presenceFor(userId): Promise<Membership[]>` y `setPresenceWhere(userId, from: Presence[] | 'any', to: Presence): Promise<Membership[]>` (devuelve las filas cambiadas; las usa Task 5).
- Produces (test utils): `captureEvents(t): DomainEvent[]` (se suscribe a `'domain'`; vaciar en `beforeEach`).
- Rutas: `GET /…/members` (cualquier miembro), `PATCH /…/members/:userId`, `DELETE /…/members/:userId` → 204, `PATCH /…/members/me/presence` `{ presence, note?: string|null ≤ 80 }`.
- Reglas: uno mismo edita `team`, `title`, `city`, `tz` (zona IANA válida, `Intl.supportedValuesOf('timeZone')`), `capacity` (entero 1–80). `role` (`'admin'|'member'`) y los datos de otros solo owner/admin → si no, `403 forbidden`. El rol del owner no se cambia ni se le expulsa → `403 cannot_change_owner`. Cualquiera puede irse (`DELETE` de sí mismo) salvo el owner → `409 owner_cannot_leave`. `:userId` sin membresía → `404 member_not_found`.
- Eventos: `member.updated { member: Person }`, `member.left { userId }`, `presence.changed { userId, presence, note }`, `workspace.updated { workspace: { id, name, slug } }`.

- [ ] **Step 1: Tests que fallan** — uno por regla, más:

```ts
it('a member edits their own profile and the change is published once', async () => {
  const res = await t.http.patch(`/api/v1/workspaces/${ws}/members/${nia.user.id}`).set(nia.auth).set('X-Client-Id', 'tab-1')
    .send({ team: 'Engineering', title: 'iOS Engineer', tz: 'Africa/Lagos', capacity: 36 }).expect(200)
  expect(res.body).toMatchObject({ team: 'Engineering', role: 'iOS Engineer', capacity: 36 })
  expect(events).toEqual([expect.objectContaining({ type: 'member.updated', workspaceId: ws, actor: { userId: nia.user.id, clientId: 'tab-1' } })])
})
it('a member cannot promote themselves', …)                  // { role: 'admin' } → 403 forbidden, sin evento
it('an unknown time zone is 400 invalid on field tz', …)
it('the owner cannot leave and cannot be removed', …)
it('presence: focus with a note, then away clears nothing else', …) // PATCH members/me/presence; GET members lo refleja
```

Añadir a `routes` de `tenancy.e2e-spec.ts`: `GET members`, `PATCH members/:id`, `DELETE members/:id`, `PATCH members/me/presence`.

- [ ] **Step 2:** `pnpm test:e2e members tenancy` → FAIL.
- [ ] **Step 3:** Implementar. La ruta `members/me/presence` se declara antes de `members/:userId`.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(server): members, roles and domain events`.

### Task 3: Invitaciones por email

**Files:**
- Create: `server/src/workspaces/invitation.entity.ts`, `server/src/workspaces/invitations.service.ts`, `server/src/workspaces/invitations.controller.ts`
- Modify: `server/src/mail/mail.service.ts` (`sendInvite(to, workspaceName, inviterName, link)`), `server/src/workspaces/workspaces.module.ts`
- Test: `server/test/invitations.e2e-spec.ts`, `server/test/tenancy.e2e-spec.ts` (añadir rutas)

**Interfaces:**
- Consumes: `MembersService.addMember` (Task 2), `randomToken`, `sha256`, `tokenError` (fase 1), `UsersService.markVerified`.
- Rutas (owner/admin): `POST /…/invitations` `{ email, role?: 'admin'|'member' = 'member', team, title? }` → 201 `{ id, email, role, team, title, expiresAt }`; `GET /…/invitations` (pendientes: sin aceptar y sin caducar); `DELETE /…/invitations/:id` → 204 (`404 invite_not_found`). `POST /invitations/accept { token }` solo con `JwtAuthGuard` → 200 `{ workspace: { id, name, slug }, member: Person }`.
- Reglas: invitar a quien ya es miembro → `409 already_member` (field `email`). Reinvitar el mismo email borra la pendiente anterior. `POST` lleva `@Throttle(MAIL_LIMIT)`. Aceptar: token desconocido o revocado → `token_invalid`, aceptado → `token_used`, caducado → `token_expired`; email de la sesión ≠ email invitado → `403 invite_email_mismatch`; si coincide, marca el email como verificado (recibir el correo lo prueba), crea la membresía con `role/team/title` de la invitación y publica `member.joined { member: Person }`. Marcar aceptada con `UPDATE … WHERE accepted_at IS NULL` (dos aceptaciones a la vez: una gana).
- Asunto del correo: `${inviterName} invited you to ${workspaceName} on Pane`; botón `Join ${workspaceName}`; pie `This invite works for 7 days.`

- [ ] **Step 1: Tests que fallan**

```ts
it('owner invites, invitee accepts and becomes a member with the invited role and team', async () => {
  await t.http.post(`/api/v1/workspaces/${ws}/invitations`).set(lin.auth).send({ email: 'Nia@Pane.app ', team: 'Design', title: 'Design Lead' }).expect(201)
  const token = t.mailer.tokenFor('nia@pane.app')               // enlace #/invite?token=
  const nia = await signedIn(t, 'nia@pane.app')
  const res = await t.http.post('/api/v1/invitations/accept').set(nia.auth).send({ token }).expect(200)
  expect(res.body.member).toMatchObject({ id: nia.user.id, access: 'member', team: 'Design', role: 'Design Lead' })
  await t.http.post('/api/v1/invitations/accept').set(nia.auth).send({ token }).expect(400, { code: 'token_used', message: expect.any(String) })
})
it('accepting with a different account is 403 invite_email_mismatch and adds nobody', …)
it('an invite older than 7 days is token_expired', …)        // t.clock.advance(7 * 24 * 3600_000 + 1)
it('a revoked invite is token_invalid', …)
it('inviting an existing member is 409 already_member', …)
it('a plain member cannot invite', …)                        // 403 forbidden
it('accepting verifies an unverified account with that email', …)
```

`tokenFor` de `memory-mailer.ts` debe reconocer `#/invite?token=`; ajustarlo si solo mira las rutas de auth. Añadir las tres rutas de invitaciones a `tenancy.e2e-spec.ts`.

- [ ] **Step 2:** `pnpm test:e2e invitations tenancy` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(server): invite people to a workspace by email`.

### Task 4: Gateway Socket.IO, salas y puente de eventos

**Files:**
- Create: `server/src/realtime/{realtime.module.ts, realtime.gateway.ts, realtime.bridge.ts, io.adapter.ts}`
- Modify: `server/src/main.ts` (`configureApp` usa `AppIoAdapter` con CORS `APP_URL` + credentials), `server/src/common/throttle-key.ts` (`AppThrottlerGuard` se salta todo contexto que no sea `http`), `server/src/app.module.ts`
- Modify: `server/test/utils/app.ts` (`await app.listen(0)`; `TestApp.url`); Create: `server/test/utils/socket.ts`
- Test: `server/test/realtime.e2e-spec.ts`

**Interfaces:**
- Consumes: `SessionService.verifyAccess` (fase 1), `DomainEvents`/`DomainEvent` (Task 2), `WorkspacesService.listForUser` (Task 1).
- Produces: handshake con middleware `server.use`: sin token o inválido → `connect_error` con `message: 'unauthorized'`; caducado → `'token_expired'`. Al conectar: `user:{id}`, `ws:{wsId}` por cada membresía, `client:{clientId}` si viene.
- Produces: `RealtimeBridge` `@OnEvent('domain')`: emite `type` con `{ by: actor.userId, at: at.toISOString(), ...data }` a `ws:{workspaceId}` excepto `client:{actor.clientId}`. En `member.joined`, antes de emitir, `socketsJoin('ws:…')` para los sockets de `user:{member.id}`; en `member.left`, emite y luego `socketsLeave`.
- Produces: `RealtimeGateway.onConnect(listener)` / `onDisconnect(listener)` o equivalente que Task 5 usa para presencia (`(userId: string) => void`).
- Produces (test utils): `connect(t, token, clientId?): Promise<Socket>`, `nextEvent(s, name, ms = 1000): Promise<any>`, `noEvent(s, name, ms = 300): Promise<void>`.

- [ ] **Step 1: Tests que fallan**

```ts
it('refuses a socket without a valid token', async () => {
  await expect(connect(t, 'nope')).rejects.toThrow('unauthorized')
})
it('a change in the workspace reaches the other member but not the author tab nor another team', async () => {
  const [a, b, other] = await Promise.all([connect(t, lin.token, 'tab-a'), connect(t, nia.token), connect(t, kai.token)])
  const seen = nextEvent(b, 'workspace.updated')
  await t.http.patch(`/api/v1/workspaces/${ws}`).set(lin.auth).set('X-Client-Id', 'tab-a').send({ name: 'Pane HQ' }).expect(200)
  expect(await seen).toMatchObject({ by: lin.user.id, workspace: { name: 'Pane HQ' }, at: expect.any(String) })
  await Promise.all([noEvent(a, 'workspace.updated'), noEvent(other, 'workspace.updated')])
})
it('accepting an invite while connected starts delivering that workspace’s events', …)
it('a removed member stops receiving the workspace’s events', …)
it('HTTP rate limits do not break sockets', …)                // conectar 3 sockets seguidos sin error
```

- [ ] **Step 2:** `pnpm test:e2e realtime` → FAIL.
- [ ] **Step 3:** Implementar. Cerrar sockets de cliente en `afterEach` para que jest termine.
- [ ] **Step 4:** `pnpm test:e2e` completo → PASS (el `listen(0)` no rompe supertest).
- [ ] **Step 5:** Commit `feat(server): realtime gateway with workspace rooms`.

### Task 5: Presencia en vivo

**Files:**
- Create: `server/src/realtime/presence.service.ts`
- Modify: `server/src/realtime/realtime.module.ts` (`PRESENCE_GRACE_MS` = 30 000 como provider), `server/src/realtime/realtime.gateway.ts`
- Test: `server/test/presence.e2e-spec.ts` (override `PRESENCE_GRACE_MS` a 100)

**Interfaces:**
- Consumes: `MembersService.setPresenceWhere` (Task 2), `DomainEvents.publish` (Task 2), conexiones del gateway (Task 4).
- Produces: `PresenceService.connected(userId)`, `disconnected(userId)`: cuenta sockets por usuario. Primer socket → cancela el temporizador pendiente y pasa a `online` las membresías en `away` (publica `presence.changed` por cada una, `actor { userId }`). Último socket → temporizador de `PRESENCE_GRACE_MS`; si al vencer sigue en 0, todas sus membresías a `away` (nota a `null`) y publica. `focus` y `meeting` no se pisan al conectar.
- Al cerrar la app (`onModuleDestroy`) se cancelan los temporizadores.

- [ ] **Step 1: Tests que fallan**

```ts
it('done when: lin creates a team, invites nia, nia accepts and both see each other online live', async () => {
  // lin crea ws e invita; lin conecta; nia acepta y conecta
  const seen = nextEvent(linSocket, 'presence.changed')
  const nia = await connect(t, niaToken)
  expect(await seen).toMatchObject({ userId: niaId, presence: 'online' })
  const members = await t.http.get(`/api/v1/workspaces/${ws}/members`).set(niaAuth).expect(200)
  expect(members.body.map((m: Person) => m.presence)).toEqual(['online', 'online'])
})
it('closing the last socket turns you away after the grace period', …)
it('closing one of two tabs keeps you online', …)
it('reconnecting within the grace period never shows away', …)  // noEvent(…, 'presence.changed', 300)
it('connecting does not overwrite focus', …)
```

- [ ] **Step 2:** `pnpm test:e2e presence` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `pnpm test && pnpm test:e2e` → todo PASS.
- [ ] **Step 5:** Commit `feat(server): live presence`.
