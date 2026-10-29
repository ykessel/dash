# Running Pane in production

Pane ships as **one container image** (`Dockerfile`):
- The NestJS API is served under `/api/v1` and the Socket.IO namespace `/realtime`.
- The built web app is served at `/`.

Because frontend and API share an origin, the refresh cookie's `SameSite=Lax` works without CORS.

| Piece | Where | Why |
| --- | --- | --- |
| App | Fly.io (`fly.toml`), at least one machine always running | WebSockets and the reminder timer need a live process |
| Database | Neon Postgres 16 | Pooled URL for the app, direct URL for migrations |
| Previews | One Fly app plus one Neon branch per PR (`.github/workflows/preview.yml`) | Removed when the PR closes |
| Errors | Sentry (`SENTRY_DSN`) | Only unexpected 500s, with no bodies or cookies |
| Logs | JSON on stdout (pino), read with `fly logs` or a log drain | Credentials are redacted |
| Several machines | Redis (`REDIS_URL`, e.g. Upstash) | Socket.IO rooms and presence span instances |

## Environment

Set non-secret values in `fly.toml [env]`. Set everything else with `fly secrets set`. The app refuses to boot in production unless `COOKIE_SECURE=true`, `APP_URL` and `API_URL` are `https://`, and `JWT_SECRET` isn't the example value. The boot error names the variable.

| Variable | Required | Value |
| --- | --- | --- |
| `DATABASE_URL` | yes | Neon **pooled** connection string (`…-pooler…`) |
| `DATABASE_URL_DIRECT` | yes | Neon direct connection string. Migrations use it (`release_command`). |
| `JWT_SECRET` | yes | 48+ random characters, e.g. `openssl rand -base64 48` |
| `APP_URL`, `API_URL` | yes | Both the public origin, e.g. `https://app.pane.dev` |
| `SMTP_URL`, `MAIL_FROM` | yes | Transactional mail provider (Postmark, Resend, SES…) |
| `COOKIE_SECURE` | yes | `true` (set in `fly.toml`) |
| `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET` | no | OAuth apps. The callback is `{API_URL}/api/v1/auth/{google,github}/callback`. Leave them unset and the buttons answer "isn't set up yet". |
| `SENTRY_DSN` | no | Turns on error reporting |
| `REDIS_URL` | no, yes with more than one machine | `rediss://…` |
| `LOG_LEVEL` | no | `info` by default |
| `REMINDER_TICK_MS` | no | 60000 by default. Several machines may tick: `reminders_sent` hands out each reminder once. |

## First-time setup (done by a person, in this order)

Nothing in the repository creates accounts or spends money.

1. **Neon.**
   - Create a project (Postgres 16, region close to Fly's).
   - Copy the pooled and direct connection strings of the `main` branch.
   - Create a branch named **`preview`** from `main` *before any customer data exists*, or reset it to seed data. Previews branch from it, and preview URLs are public.
2. **Fly.**
   - `fly launch --no-deploy --copy-config` (keep the app name or edit `fly.toml`).
   - `fly secrets set DATABASE_URL=… DATABASE_URL_DIRECT=… JWT_SECRET=… APP_URL=https://… API_URL=https://… SMTP_URL=… MAIL_FROM=…`
3. **Domain.**
   - `fly certs add app.pane.dev`, then create the DNS records it prints.
   - Set `APP_URL`/`API_URL` to that origin.
4. **Sentry.**
   - Create a Node project and `fly secrets set SENTRY_DSN=…`.
   - Add the alert rules below.
5. **First deploy.** Run `fly deploy`. Migrations run first; the deploy stops if they fail.
6. **GitHub.** In the repo settings → Secrets and variables → Actions:
   - Secrets:
     - `FLY_API_TOKEN` (`fly tokens create org`)
     - `NEON_API_KEY`
     - `PREVIEW_JWT_SECRET`
     - `PREVIEW_SMTP_URL` (a sandbox inbox such as Mailtrap, so previews never mail real people)
   - Variables:
     - `NEON_PROJECT_ID`
     - `FLY_ORG`
   - Create the environments `preview` and `production`. Add a required reviewer to `production` if deploys should wait for approval.

After that:
- Every PR gets `https://pane-pr-<n>.fly.dev`, with its own database branch.
- Merging to `main` deploys production (`.github/workflows/deploy.yml`) after CI passes.

## Alerts

- **Sentry:**
  - "A new issue is created" → email or Slack.
  - "Number of events in an issue > 50 in 5 min" → page.
- **Fly:** the HTTP check on `/api/v1/health` (it queries the database) restarts unhealthy machines and shows them in the dashboard. Add an uptime monitor (Better Stack, UptimeRobot) on the same URL for a page when the whole app is down.
- **Logs:** each request line carries `req.id`. It is the `X-Request-Id` returned to the browser and the `request_id` tag on Sentry events, so a user report, a log line and an error can be joined.

## Backups and restore

- **Neon point-in-time restore** is the backup. Set the history retention on the project to what the plan allows (7 days on Launch, 30 on Scale). To recover:
  1. Create a branch from `main` at a timestamp before the incident (Console → Branches → Create → "Past point in time").
  2. Check the data there, through its own connection string or `psql`.
  3. Either restore `main` from it (Console → Restore) or copy the rows needed.
- **Drill every quarter.**
  1. Restore yesterday into a throwaway branch.
  2. Point a local API at it (`DATABASE_URL=… pnpm --dir server dev`).
  3. Sign in, check a workspace loads, then delete the branch.
  4. Note the date here.
- **Before a risky migration:** create a Neon branch named `pre-<migration>` first. It costs nothing until written to.

Last restore drill: _not yet_.

## Scaling past one machine

1. Create a Redis database (Upstash, same region) and run `fly secrets set REDIS_URL=rediss://…`.
2. Run `fly scale count 2`.

With Redis:
- Events published on one machine reach sockets on another.
- Presence asks every machine whether someone still has a socket, and a machine that boots leaves connected people online.

Without `REDIS_URL`, keep one machine.

## Row-level security (deferred)

Every query is scoped by `workspace_id` in the services, and e2e tests check that no data crosses between workspaces (`tenancy.e2e-spec.ts`). Postgres RLS would add a second wall, but it needs `SET app.workspace_id` per transaction through Neon's transaction-mode pooler, and every repository call would have to run in a transaction. That is worth doing before handing the database to anything other than this API. Until then, it is a deliberate gap.
