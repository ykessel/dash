# Backend de Pane — diseño y hoja de ruta

Fecha: 2026-10-28 · Estado: propuesta

## 1. Objetivo

Sustituir el `localStorage` de la demo por un backend real y multi-equipo. Cada workspace (equipo)
tiene sus personas, proyectos, tareas, eventos, avisos y sesiones de focus, aislados de los demás.
Acceso con email + contraseña, Google, GitHub y magic link. Los cambios se ven en vivo entre usuarios
desde el principio: tablero, avisos y presencia.

## 2. Decisiones

| Tema | Decisión | Motivo |
| --- | --- | --- |
| Framework | NestJS 11 (Node 22 LTS) | Elegido por el equipo; módulos, guards y gateways encajan con el dominio. |
| ORM | TypeORM 0.3, `synchronize: false`, migraciones versionadas | Elegido; las migraciones hacen los cambios de esquema revisables. |
| Base de datos | Postgres 16 en Neon. App → host `-pooler`; migraciones → host directo | El pooler de Neon (PgBouncer en modo transacción) no admite migraciones ni `LISTEN`. |
| Local y tests | Postgres 16 + Mailpit en `docker compose` | Tests rápidos sin depender de la red; Neon se usa en preview y producción. |
| Multi-tenant | Esquema compartido, `workspace_id` en cada tabla del equipo, filtrado obligatorio en servicio + tests de fuga entre equipos | Lo más simple que escala; RLS de Postgres queda como refuerzo opcional (fase 7). |
| Sesión | Access JWT de 15 min en memoria del cliente + refresh token opaco rotativo (30 días) en cookie `httpOnly; Secure; SameSite=Lax`, guardado con hash | Sin tokens largos en JS; rotación con detección de reutilización. |
| Contraseñas | argon2id | Estándar actual. |
| OAuth | Passport: `passport-google-oauth20`, `passport-github2` | Solo se vincula por email **verificado** por el proveedor. |
| Email | nodemailer por SMTP (Mailpit en local, Resend SMTP en producción) | Una sola implementación para ambos entornos. |
| Tiempo real | Socket.IO con `@nestjs/websockets`; salas por workspace y por proyecto | Reconexión y salas incluidas. Con más de una instancia: adaptador Redis (Upstash). |
| Eventos de dominio | `@nestjs/event-emitter` → el gateway retransmite | Los servicios no conocen el socket; cada módulo emite y el gateway decide la sala. |
| Orden en tablero | `order double precision`, punto medio entre vecinos y rebalanceo de la columna si el hueco < 1e-6 | Igual que la lógica actual de `moveTask` en `src/store.tsx`. |
| Concurrencia | Columna `version` en tareas y proyectos; `PATCH` con `version` distinta → 409 | Dos personas editando la misma tarjeta en vivo. |
| Deshacer | Borrado lógico (`deleted_at`) en tareas y eventos + `POST …/restore` | La UI ya ofrece "Undo" tras borrar. |
| Despliegue | Contenedor en Fly.io o Railway (proceso persistente) | Los WebSockets no encajan en funciones serverless. |

## 3. Repositorio

Monorepo pnpm. El frontend sigue en la raíz; el backend es un paquete nuevo.

```
pnpm-workspace.yaml      packages: ['server']
server/
  src/
    main.ts  app.module.ts
    config/              validación de variables de entorno (zod)
    db/                  data-source.ts, migrations/
    common/              filtros de error, decoradores (@CurrentUser, @Workspace), paginación
    health/
    auth/                signup, login, refresh, verify, reset, magic link, oauth
    users/
    mail/
    workspaces/          workspaces, memberships, invitations, guard de tenant
    realtime/            gateway, presencia, puente de eventos de dominio
    projects/  tasks/  events/  notifications/  focus/  prefs/  insights/
  test/                  e2e (jest + supertest + socket.io-client)
  docker-compose.yml     postgres:16, mailpit
```

Más adelante, `packages/contracts` con los tipos compartidos (DTOs, eventos de socket) cuando el
frontend empiece a consumirlos (fase 6).

## 4. Modelo de datos

Una **Person** del frontend = `users` (identidad global) + `memberships` (datos de esa persona dentro
de un workspace). Una misma persona puede estar en varios workspaces con distinto equipo y rol.

| Tabla | Columnas clave |
| --- | --- |
| `users` | `id uuid`, `email citext unique`, `email_verified_at`, `password_hash null`, `name`, `avatar_skin smallint`, `created_at` |
| `oauth_accounts` | `user_id`, `provider ('google'\|'github')`, `provider_user_id`; unique (`provider`, `provider_user_id`) |
| `auth_tokens` | `id`, `kind ('verify_email'\|'reset_password'\|'magic_link')`, `email`, `user_id null`, `token_hash`, `expires_at`, `used_at` |
| `refresh_sessions` | `id`, `user_id`, `family_id`, `token_hash`, `expires_at`, `rotated_at`, `revoked_at`, `user_agent`, `ip` |
| `workspaces` | `id`, `name`, `slug unique`, `created_by`, `created_at` |
| `memberships` | PK (`workspace_id`, `user_id`), `role ('owner'\|'admin'\|'member')`, `team`, `title`, `city`, `tz`, `capacity`, `presence`, `presence_note` |
| `invitations` | `id`, `workspace_id`, `email`, `role`, `team`, `title`, `token_hash`, `invited_by`, `expires_at`, `accepted_at` |
| `projects` | `id`, `workspace_id`, `name`, `description`, `hue`, `icon`, `status`, `start_date`, `due_date`, `lead_id`, `version`, `deleted_at` |
| `project_members` | PK (`project_id`, `user_id`) |
| `project_user_prefs` | PK (`project_id`, `user_id`), `pinned`, `starred` — son por persona, no globales |
| `milestones` | `id`, `project_id`, `title`, `due_date`, `done`, `position` |
| `tasks` | `id`, `workspace_id`, `project_id`, `assignee_id null`, `title`, `status`, `priority`, `due_date`, `estimate`, `order`, `done_at`, `version`, `created_by`, `deleted_at` |
| `subtasks` | `id`, `task_id`, `title`, `done`, `position` |
| `task_comments` | `id`, `task_id`, `author_id`, `body`, `created_at` |
| `task_activity` | `id`, `task_id`, `workspace_id`, `actor_id`, `kind`, `from_status`, `to_status`, `at` — alimenta insights |
| `events` | `id`, `workspace_id`, `title`, `date`, `start_min`, `dur_min`, `location`, `kind`, `hue`, `project_id null`, `deleted_at` |
| `event_attendees` | PK (`event_id`, `user_id`) |
| `notifications` | `id`, `workspace_id`, `recipient_id`, `actor_id`, `kind`, `payload jsonb`, `read_at`, `created_at` |
| `focus_sessions` | `id`, `workspace_id`, `user_id`, `task_id null`, `label`, `planned_sec`, `actual_sec`, `started_at`, `ended_at` |
| `user_prefs` | PK `user_id`, `notify jsonb`, `session_min`, `pause_min`, `look jsonb` (tema, fondo, acento) |

Los valores enumerados son los de `src/data/types.ts` (`Status`, `Priority`, `Hue`, `EventKind`,
`ProjectStatus`, `Presence`, `Team`, …), guardados como `text` con `CHECK`.

## 5. API

REST bajo `/api/v1`. Todo lo del equipo cuelga de `/workspaces/:wsId/…` y pasa por
`WorkspaceMemberGuard`, que carga la membresía y la deja en la request (403 si no eres miembro,
404 si el workspace no existe, nunca datos de otro equipo).

| Área | Endpoints |
| --- | --- |
| Auth | `POST /auth/signup`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/verify-email`, `POST /auth/verify-email/resend`, `POST /auth/password/forgot`, `POST /auth/password/reset`, `POST /auth/magic-link`, `POST /auth/magic-link/verify`, `GET /auth/{google,github}`, `GET /auth/{google,github}/callback` |
| Yo | `GET /me`, `PATCH /me`, `GET/PATCH /me/prefs`, `GET /me/workspaces` |
| Workspaces | `POST /workspaces`, `GET/PATCH /workspaces/:wsId`, `GET /workspaces/:wsId/snapshot` |
| Miembros | `GET /…/members`, `PATCH /…/members/:userId`, `DELETE /…/members/:userId`, `PATCH /…/members/me/presence` |
| Invitaciones | `POST /…/invitations`, `GET /…/invitations`, `DELETE /…/invitations/:id`, `POST /invitations/accept` |
| Proyectos | CRUD `/…/projects`, `PUT /…/projects/:id/prefs` (pinned/starred), CRUD `/…/projects/:id/milestones`, `PUT /…/projects/:id/members` |
| Tareas | `GET /…/tasks?project&assignee&status&q`, `POST`, `PATCH /:id` (con `version`), `POST /:id/move {status, beforeId}`, `DELETE /:id`, `POST /:id/restore`, subtareas y comentarios anidados |
| Calendario | `GET /…/events?from&to`, `POST`, `PATCH`, `DELETE`, `POST /:id/restore` |
| Avisos | `GET /…/notifications`, `POST /…/notifications/read-all` |
| Focus | `POST /…/focus-sessions`, `PATCH /:id` (terminar), `GET /…/focus-sessions?from&to` |
| Insights | `GET /…/insights?range=7d\|30d\|90d` (throughput, focus, carga, puntualidad, reparto por proyecto) |

`GET /snapshot` devuelve la misma forma que `Data` de `src/data/types.ts`. Así el frontend cambia
`loadData()` por una llamada y migra las mutaciones una a una.

Errores: `{ code, message, field? }`. `field` mapea al `AuthResult` que ya pintan los formularios.

## 6. Tiempo real

- Conexión: `io('/realtime', { auth: { token: accessToken } })`. El handshake valida el JWT; si
  caduca, el cliente reconecta con un token nuevo.
- Salas: `ws:{wsId}` (al conectar, una por cada membresía) y `project:{id}` (bajo demanda, `join`).
- Eventos servidor → cliente, con `{ by, at, ... }`:
  `task.created|updated|moved|deleted|restored`, `comment.created`, `project.updated`,
  `milestone.updated`, `event.created|updated|deleted`, `notification.created` (solo al destinatario,
  sala `user:{id}`), `member.joined|updated|left`, `presence.changed`.
- Presencia: `online` al conectar, `away` cuando se cierra el último socket (tras 30 s de gracia),
  `focus` al iniciar una sesión de focus, `meeting` la marca el cliente. Con una instancia vive en
  memoria; con varias, en Redis.
- Eco: cada mutación REST acepta la cabecera `X-Client-Id`; el gateway no reenvía el evento a ese
  socket, porque la UI ya aplicó el cambio de forma optimista.
- Contrato: los servicios emiten `DomainEvent` con `@nestjs/event-emitter`; `RealtimeBridge` lo
  traduce a sala + payload. Cada módulo de dominio prueba en e2e que su mutación llega a un segundo
  cliente del mismo workspace y **no** llega a otro workspace.

## 7. Fases

Cada fase es una rama y un PR, con su propio plan detallado en `docs/superpowers/plans/`.

| Fase | Entrega | Hecho cuando |
| --- | --- | --- |
| **1. Base + identidad** | Paquete `server/`, config, Neon/Postgres, migraciones, health, tests e2e. Signup, login, refresh, logout, verificación, reset, magic link, Google, GitHub, rate limits. | Plan: `2026-10-28-backend-phase1-foundation-auth.md`. Todos los flujos de acceso pasan e2e contra Postgres y Mailpit. |
| **2. Workspaces + tiempo real base** | Workspaces, membresías, roles, invitaciones por email, `WorkspaceMemberGuard`, gateway Socket.IO con auth, salas y presencia. | Un usuario crea un equipo, invita a otro, este acepta y ambos ven su presencia en vivo. Test de fuga entre equipos en verde. |
| **3. Dominio** | Proyectos (+hitos, miembros, prefs), tareas (+orden, subtareas, comentarios, borrado y restauración, `version`), eventos, avisos, focus, prefs, `snapshot`. Cada mutación emite su evento. | Todo lo que hace hoy `store.tsx` tiene endpoint, test y evento en vivo. |
| **4. Insights** | Consultas agregadas sobre `task_activity`, `tasks` y `focus_sessions`; exportación CSV. | Los números de Insights salen de datos reales, no de `lib/metrics.ts`. |
| **5. Avisos y email** | Avisos por mención, asignación, vencimiento y reunión según `prefs.notify`; job diario de resumen. | Las preferencias de Settings cambian lo que llega. |
| **6. Integración frontend** | Cliente API + socket, `StoreProvider` sobre la API con updates optimistas, pantallas de auth conectadas (Apple → GitHub; nuevas rutas `#/auth/magic` y `#/auth/callback`), selector de workspace. | La app funciona entre dos navegadores sin `localStorage` de datos. |
| **7. Producción** | Despliegue (Fly/Railway), Neon con rama por PR, Sentry, logs pino, helmet, CORS estricto, backups, RLS opcional, adaptador Redis. | Entorno de preview por PR y producción con alertas. |

## 8. Riesgos

- **Pooler de Neon + TypeORM:** sin prepared statements con nombre a través de PgBouncer; usar la URL
  `-pooler` para la app y la directa para `migration:run`.
- **Enlaces de email abiertos por escáneres** (Outlook, Gmail): un `GET` que consuma el token gastaría
  el magic link. El enlace abre el frontend y el token se consume solo con `POST`.
- **Toma de cuenta vía OAuth:** nunca vincular un proveedor a una cuenta local cuyo email no esté
  verificado.
- **Dos pestañas refrescando a la vez:** con rotación estricta, la segunda parecería un robo de token y
  cerraría la sesión. Hay una gracia de 30 s para el token recién rotado.
- **Frontend en otro dominio:** la cookie `SameSite=Lax` exige que frontend y API sean el mismo *site*
  (`app.pane.dev` + `api.pane.dev`). Si no, `SameSite=None` + CSRF token.
