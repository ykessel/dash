# Backend Phase 7: Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One container image that can run Pane in production and in a preview per PR: guarded config, structured logs, error reporting, more than one instance behind Socket.IO, CI, and a runbook. Nothing is deployed by this plan.

**Architecture:**
- **One image.** The API serves the built web app from `WEB_DIR`. The app uses hash routing, so a single `index.html` covers every page.
  - Frontend and API share an origin, so the refresh cookie's `SameSite=Lax` holds (spec §8) and CORS only matters in dev.
  - A preview is then one Fly app plus one Neon branch.
- **Optional services.** `REDIS_URL` switches Socket.IO to the Redis adapter. `SENTRY_DSN` turns on error reporting. Without them the app runs exactly as today.
- **Presence.** It stops counting sockets in memory and asks the cluster (`fetchSockets`), so it stays correct with several instances.

**Tech Stack:**
- Server: `nestjs-pino` + `pino-http`, `@sentry/nestjs`, `@socket.io/redis-adapter` + `ioredis`.
- Runtime and CI: Docker (node:22-slim), Fly.io (`fly.toml`), GitHub Actions, Neon (`neondatabase/create-branch-action`).

**Spec:** `docs/superpowers/specs/2026-10-28-backend-design.md`, read together with:
- The phase 7 row: "Despliegue (Fly/Railway), Neon con rama por PR, Sentry, logs pino, helmet, CORS estricto, backups, RLS opcional, adaptador Redis. Hecho cuando: Entorno de preview por PR y producción con alertas."
- §6, presence with several instances: "en Redis".
- §8, risks: pooler versus direct URL, and same site for the cookie.

## Global Constraints

- **Pooler versus direct URL.** The app connects through `DATABASE_URL` (the Neon `-pooler` host). Migrations use `DATABASE_URL_DIRECT`.
- **No new required env vars.** Every new one is optional, so local dev and the e2e suite run unchanged.
- **Production refuses to boot when any of these holds:**
  - `COOKIE_SECURE` is not `true`.
  - `APP_URL` or `API_URL` is not `https:`.
  - `JWT_SECRET` is the `.env.example` value.
- **Logs never contain** passwords, tokens, `Authorization`, `Cookie` or `Set-Cookie` values.
- **Stop points.** Creating cloud accounts or apps, setting secrets, deploying and pushing all wait for the user. This plan only writes the config for them.
- **Commits** carry no attribution trailers.

## Review Focus

1. A request that fails with a 500 is reported to Sentry exactly once. 4xx responses are never reported, and the reported error carries no request body or cookies.
2. A second instance boots while someone is connected to the first: their presence stays `online`. With the old reset-everything-at-boot it would flip to `away`.
3. A socket on instance B receives an event published on instance A (the Redis adapter). The client-id echo exclusion still works across instances.
4. Bad production config: a missing or insecure variable fails at boot with a message naming it. It does not surface at the first request.
5. The image serves `index.html` and the assets. The CSP lets the app load: Google Fonts, and the same-origin socket over `wss:`.

---

### Task 1: Production config guards and same-origin web app

**Files:**
- Modify:
  - `server/src/config/env.ts`
  - `server/src/config/env.spec.ts`
  - `server/src/main.ts` (static web app, CSP, shutdown hooks)
  - `server/.env.example`
  - `src/api/client.ts` (API URL fallback)
  - `src/api/client.test.ts`
- Test: `server/test/web.e2e-spec.ts`

**Interfaces:**
- Produces: `Env` gains these optional variables:
  - `SENTRY_DSN?: string`
  - `REDIS_URL?: string`
  - `LOG_LEVEL: 'fatal'|'error'|'warn'|'info'|'debug'|'trace'|'silent'`. Default `info`; `silent` when `NODE_ENV=test`.
  - `WEB_DIR?: string`
- `configureApp` serves `WEB_DIR` statically at `/` when set.

- [ ] **Step 1: Write failing tests**
  - `env.spec.ts`:
    - `production rejects COOKIE_SECURE=false` — error message contains `COOKIE_SECURE`.
    - `production rejects http APP_URL` — error message contains `APP_URL`.
    - `production rejects the example JWT_SECRET` — error message contains `JWT_SECRET`.
    - `development accepts all three` — no throw.
    - `optional SENTRY_DSN/REDIS_URL/WEB_DIR default to undefined`.
  - `web.e2e-spec.ts` (`WEB_DIR` points at a temp dir holding `index.html` with `<h1>pane</h1>`):
    - `GET /` returns 200 and contains `pane`.
    - `GET /api/v1/health` is still JSON.
    - The `content-security-policy` header contains `fonts.googleapis.com` and `connect-src 'self'`.
  - `client.test.ts`: `production build without VITE_API_URL uses the page origin`. Stub `import.meta.env` through `vi.stubEnv('DEV', false)` and `location.origin`.
- [ ] **Step 2: Run** `pnpm test config` and `pnpm test:e2e web` (server), then `pnpm test` (root) → FAIL.
- [ ] **Step 3: Implement.**
  - In `env.ts`, put the production checks in a `superRefine`. Each issue's `path` is the variable's name, so `loadEnv`'s message names it.
  - In `main.ts`:
    - `app.useStaticAssets(WEB_DIR)` through `NestExpressApplication`.
    - Helmet CSP directives:
      - `default-src 'self'`
      - `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`
      - `font-src 'self' https://fonts.gstatic.com`
      - `connect-src 'self'`
      - `img-src 'self' data:`
    - Call `app.enableShutdownHooks()` in `main()` only.
  - In `client.ts`: `VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:3000' : location.origin)`.
- [ ] **Step 4: Run** the same commands → PASS. Then run the full server e2e suite → PASS.
- [ ] **Step 5: Commit** `feat(server): production config guards and same-origin web app`

### Task 2: Structured logs and error reporting

**Files:**
- Create:
  - `server/src/observability/logger.ts`
  - `server/src/observability/logger.spec.ts`
  - `server/src/observability/reporter.ts`
  - `server/src/instrument.ts`
- Modify:
  - `server/src/app.module.ts` (`LoggerModule.forRootAsync`)
  - `server/src/main.ts` (`bufferLogs`, `app.useLogger`, first-line `import './instrument'`)
  - `server/src/common/http-exception.filter.ts`
- Test: `server/src/common/http-exception.filter.spec.ts`, `server/test/health.e2e-spec.ts`

**Interfaces:**
- Produces:
  - `pinoOptions(env: Pick<Env,'LOG_LEVEL'|'NODE_ENV'>): Params`. Behaviour:
    - Redact paths: `req.headers.authorization`, `req.headers.cookie`, `res.headers["set-cookie"]`, `*.password`, `*.token`, `*.accessToken`, `*.refreshToken`.
    - `genReqId`: honours an incoming `x-request-id` (≤ 64 chars of `[\w-]`), else `randomUUID()`.
    - Echoes the id in the `X-Request-Id` response header.
    - `autoLogging` ignores `/api/v1/health`.
  - `ERROR_REPORTER` injection token, with `type ErrorReporter = (err: unknown, ctx: { method: string; path: string; requestId?: string }) => void`.
    - The default calls `Sentry.captureException` when a DSN is set; otherwise it does nothing.
  - `AppExceptionFilter` takes an optional `ErrorReporter` in its constructor and calls it only on the unknown-error (500) branch.

- [ ] **Step 1: Write failing tests**
  - `logger.spec.ts`:
    - `redacts credentials`: log `{ req: { headers: { authorization: 'Bearer x', cookie: 'rt=y' } }, body: { password: 'p' } }` through `pino(pinoOptions(...).pinoHttp, stream)`. Expect the output to contain none of `Bearer x`, `rt=y`, `"p"`, and to contain `[Redacted]`.
    - `keeps a sane incoming request id and replaces a bad one`.
  - `http-exception.filter.spec.ts`:
    - `reports a 500 once with method, path and request id`.
    - `does not report AppError or HttpException 4xx`.
    - `the report carries no body or cookies` — the ctx keys equal exactly `['method','path','requestId']`.
  - `health.e2e-spec.ts`:
    - `echoes X-Request-Id`: send `abc-123` and get it back.
    - `generates one when absent`: a uuid shape.
- [ ] **Step 2: Run** `pnpm test observability filter` and `pnpm test:e2e health` → FAIL.
- [ ] **Step 3: Implement.**
  - `instrument.ts` runs `Sentry.init({ dsn, environment: NODE_ENV, tracesSampleRate: 0, sendDefaultPii: false })` only when `SENTRY_DSN` is set.
  - `configureApp` builds the filter with `app.get(ERROR_REPORTER)`.
  - Replace the default Nest logger with `app.useLogger(app.get(Logger))`.
- [ ] **Step 4: Run** the same commands, then the full e2e and unit suites → PASS.
- [ ] **Step 5: Commit** `feat(server): pino logs with request ids and Sentry error reporting`

### Task 3: Several instances: Redis adapter and cluster presence

**Files:**
- Modify:
  - `server/src/realtime/io.adapter.ts` (`connectToRedis(url)`)
  - `server/src/main.ts`
  - `server/src/realtime/presence.service.ts`
  - `server/src/realtime/realtime.gateway.ts` (`connectedUserIds()`, `hasSockets(userId)`)
  - `server/src/workspaces/members.service.ts` (`resetPresenceExcept(userIds: string[])`)
  - `server/docker-compose.yml` (add `redis:7`, port 6380:6379)
  - `server/test/utils/app.ts` (`createTestApp` accepts an `env` override, used for `REDIS_URL`)
- Test:
  - `server/test/presence.e2e-spec.ts` (new case)
  - `server/test/cluster.e2e-spec.ts` (skips when `TEST_REDIS_URL` is unset)

**Interfaces:**
- Produces:
  - `AppIoAdapter.connectToRedis(url: string): Promise<void>`. Builds the pub/sub `ioredis` pair and calls `createAdapter`.
  - `RealtimeGateway`:
    - `hasSockets(userId): Promise<boolean>`, via `server.in(rooms.user(id)).fetchSockets()`.
    - `connectedUserIds(): Promise<string[]>`, via `server.fetchSockets()` and the distinct `data.userId`.
  - `PresenceService` drops the `sockets` count map:
    - `connected` marks online from away.
    - `disconnected` starts the grace timer. When the timer fires, it marks away only if `!(await gateway.hasSockets(userId))`.
    - The boot step calls `members.resetPresenceExcept(await gateway.connectedUserIds())`.

- [ ] **Step 1: Write failing tests**
  - `presence.e2e-spec.ts`: `a second instance booting keeps someone connected online`.
    - Connect Ana's socket.
    - Wait for `online`.
    - Call `app.get(PresenceService).onApplicationBootstrap()`.
    - Ana's membership presence is still `online`.
  - `cluster.e2e-spec.ts`: two `createTestApp({ REDIS_URL })` instances.
    - `an event on A reaches B`: Ben's socket on B receives `task.created` when Ana creates a task through A.
    - `echo exclusion holds across instances`: Ana's socket on B with clientId `c1` does not receive the task she created through A with `X-Client-Id: c1`.
    - `last socket closing on A while one is open on B keeps online`.
- [ ] **Step 2: Run** `docker compose up -d redis`, then `TEST_REDIS_URL=redis://localhost:6380 pnpm test:e2e presence cluster` → FAIL.
- [ ] **Step 3: Implement** as in Interfaces. `main.ts` calls `connectToRedis` before `useWebSocketAdapter` when `REDIS_URL` is set.
- [ ] **Step 4: Run** the same command, then the full suite without `TEST_REDIS_URL` → PASS. In that run the cluster tests report as skipped.
- [ ] **Step 5: Commit** `feat(server): Redis socket adapter and cluster-safe presence`

### Task 4: Container image and Fly config

**Files:**
- Create:
  - `Dockerfile` (repo root)
  - `.dockerignore`
  - `fly.toml`
  - `server/src/db/migrate.ts`
- Modify: `server/package.json` (`"migrate": "node dist/db/migrate.js"`)

**Interfaces:**
- Image:
  - Stage `deps`: `pnpm install --frozen-lockfile`.
  - Stage `build`: `pnpm build` (web, `VITE_API_URL` unset, so same origin) and `pnpm --dir server build`.
  - Stage `run`: node:22-slim, non-root `node` user, `WEB_DIR=/app/web`, `CMD node dist/main.js`, `EXPOSE 3000`.
- `migrate.ts`: initialises the data source on `DATABASE_URL_DIRECT`, runs migrations, exits with code 0 or 1.
- `fly.toml`:
  - `[deploy] release_command = "node dist/db/migrate.js"`
  - `[http_service] internal_port = 3000, force_https = true, auto_stop_machines = "off", min_machines_running = 1`. Sockets and the reminder timer need a live process.
  - `[[http_service.checks]] path = "/api/v1/health"`

- [ ] **Step 1: Build** `docker build -t pane:local .` → succeeds.
- [ ] **Step 2: Run against local services.** Start the container with `--network host`-equivalent env: `DATABASE_URL`/`_DIRECT` on `host.docker.internal:5434`, `NODE_ENV=production`, https `APP_URL`/`API_URL` placeholders, `COOKIE_SECURE=true`, and a fresh 48-char `JWT_SECRET`. Run `node dist/db/migrate.js`, then `node dist/main.js`. Expect:
  - `curl :3000/api/v1/health` → `{"status":"ok"...}`.
  - `curl :3000/` → the built `index.html`.
  - Logs are JSON lines.
- [ ] **Step 3: Run** the same container with `COOKIE_SECURE=false` → it exits non-zero naming `COOKIE_SECURE`.
- [ ] **Step 4: Commit** `build: container image and Fly config`

### Task 5: CI, previews per PR, runbook

**Files:**
- Create:
  - `.github/workflows/ci.yml`
  - `.github/workflows/preview.yml`
  - `.github/workflows/deploy.yml`
  - `docs/ops/production.md`

**Interfaces:**
- `ci.yml`:
  - Triggers: `pull_request`, and `push` to `dev` and `main`.
  - Services: postgres:16 (with the `server/docker/init.sql` databases, created by a step) and redis:7.
  - Steps: pnpm setup, then the root `pnpm test`, `pnpm typecheck` and `pnpm build`, then the server's `pnpm exec tsc --noEmit`, `pnpm test`, and `pnpm test:e2e` with `TEST_REDIS_URL`.
- `preview.yml`:
  - Triggers: `pull_request` opened, synchronize, reopened and closed.
  - When open:
    - `neondatabase/create-branch-action@v6` creates branch `pr-${{ number }}` and outputs `db_url_pooled` and `db_url`.
    - `superfly/fly-pr-review-apps@1.3.0` deploys app `pane-pr-${{ number }}`, with `secrets` set from those URLs plus the `PREVIEW_*` secrets.
  - When closed: `neondatabase/delete-branch-action@v3` and the same Fly action, which destroys the app.
  - Secrets: `NEON_API_KEY`, `NEON_PROJECT_ID` (repo var), `FLY_API_TOKEN`, `PREVIEW_JWT_SECRET`, `PREVIEW_SMTP_URL`.
- `deploy.yml`: on `push` to `main`, `flyctl deploy --remote-only` (migrations run through `release_command`).
- `production.md` covers:
  - Every env var and where it comes from.
  - First-time setup, as the steps the user runs: Fly app, Neon project and pooler URL, Sentry project and alert rule, GitHub secrets, DNS.
  - Backups: Neon point-in-time restore window and a quarterly restore drill into a branch.
  - Alerts: Sentry new-issue and spike rules, and the Fly health check.
  - Scaling to more than one machine needs `REDIS_URL` (Upstash).
  - RLS stays deferred; the doc says why.

- [ ] **Step 1: Validate the workflows.** Parse each YAML file with `node -e "require('yaml').parse(...)"`, or with `npx --yes yaml-lint` → no errors. Check every `${{ secrets.X }}` against the runbook's secret list.
- [ ] **Step 2: Commit** `ci: tests, previews per PR with Neon branches, deploy; production runbook`
