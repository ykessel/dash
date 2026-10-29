# Backend Phase 6: Frontend Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The React app runs on the real API: sign-in, one workspace's data from the snapshot, optimistic mutations, and live updates between two browsers, with no data in `localStorage`.

**Architecture:** A small `src/api/` layer: `client.ts` (fetch with the in-memory access token, one refresh-and-retry on 401, `X-Client-Id`, typed `ApiError`), `live.ts` (a pure `applyEvent(data, type, payload)` reducer for socket events) and `socket.ts` (socket.io client on `/realtime`). `StoreProvider` keeps its public shape; its data now comes from `GET /workspaces/:id/snapshot`, each mutation applies locally first, calls the API, and rolls back with a warning toast on failure. Auth screens call the API; OAuth and email links land on new hash routes.

**Tech Stack:** React 19, Vite 7, TypeScript 5.9; new deps `socket.io-client` (runtime) and `vitest` (dev).

**Spec:** `docs/superpowers/specs/2026-10-28-backend-design.md` §5–§7, phase 6 row: "Cliente API + socket, `StoreProvider` sobre la API con updates optimistas, pantallas de auth conectadas (Apple → GitHub; nuevas rutas `#/auth/magic` y `#/auth/callback`), selector de workspace. Hecho cuando: La app funciona entre dos navegadores sin `localStorage` de datos."

## Global Constraints

- API base: `import.meta.env.VITE_API_URL ?? 'http://localhost:3000'`, REST under `/api/v1`, every request `credentials: 'include'` (refresh cookie).
- Access token lives in memory only; boot calls `POST /auth/refresh` to restore a session.
- `localStorage` keeps only UI conveniences: look, last workspace id, client id. Never `Data`.
- Errors are `{ code, message, field? }`; `field` maps onto the existing `AuthResult` / form errors.
- Socket: `io(`${API}/realtime`, { auth: { token, clientId } })`; every REST mutation sends `X-Client-Id` so the sender's own tab is not echoed.
- Copy stays in the app's voice (sentence case, curly quotes).
- Commits carry no attribution trailers.

## Review Focus

1. An access token that expires mid-session: the next request refreshes once and retries; a failed refresh signs the person out instead of looping.
2. A mutation the server rejects (409 stale version, 400, 403) rolls the local change back and says so.
3. Two tabs of the same person: each sees the other's changes (different client ids), never its own twice.
4. A person with no workspace yet, and switching workspaces: no data from the previous workspace leaks into the next.
5. OAuth/email-link error redirects (`#/signin?error=…`, expired tokens) show a message, not a blank page.

---

### Task 1: API client

**Files:**
- Create: `src/api/client.ts`, `src/api/client.test.ts`, `vitest.config.ts`
- Modify: `package.json` (`"test": "vitest run"`, devDep `vitest`), `tsconfig` include if needed

**Interfaces:**
- Produces: `class ApiError extends Error { status: number; code: string; field?: string }`; `api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T>` (path relative to `/api/v1`; JSON in/out; 204 → `undefined`); `setToken(t: string | null)`, `getToken()`; `onSignedOut(cb: () => void)`; `refresh(): Promise<{ accessToken: string; user: PublicUser } | null>` (dedupes concurrent calls); `clientId: string` (random, kept in `sessionStorage` per tab); `API_URL`.

- [ ] **Step 1: Write failing tests** (`fetch` stubbed with `vi.fn`):
  - `sends JSON with the token, credentials and client id`.
  - `a 401 refreshes once and retries with the new token`.
  - `a failed refresh clears the token and fires onSignedOut` (no second retry).
  - `two concurrent 401s share one refresh`.
  - `an error body becomes ApiError with code and field`; a non-JSON 500 becomes `ApiError(500, 'unknown')`.
- [ ] **Step 2: Run** `pnpm test` → FAIL (module missing).
- [ ] **Step 3: Implement** `client.ts`.
- [ ] **Step 4: Run** `pnpm test` → PASS; `pnpm typecheck` clean.
- [ ] **Step 5: Commit** `feat(web): API client with refresh and client id`

### Task 2: Live reducer and socket

**Files:**
- Create: `src/api/live.ts`, `src/api/live.test.ts`, `src/api/socket.ts`
- Modify: `src/data/types.ts` (`Task.version?: number`)

**Interfaces:**
- Produces: `applyEvent(d: Data, type: string, p: Record<string, any>): Data` for `task.created|updated|moved|restored` (`p.task` upsert by id), `task.deleted` (`p.id`), `comment.created` (`p.taskId`, `p.comment`, appended once), `project.created|updated` (`p.project`, keeping my `pinned`/`starred`), `project.deleted`, `milestone.updated` (`p.projectId`, `p.milestones`), `event.created|updated` (`p.event`), `event.deleted`, `notification.created` (`p.notice`, prepended once), `member.joined|updated` (`p.member`), `member.left` (`p.userId`), `presence.changed` (`p.userId`, `p.presence`, `p.note`). Unknown types return `d` unchanged. `connectLive(token, onEvent(type, payload)): () => void` (reconnects with `refresh()`'s token on `connect_error` 401).

- [ ] **Step 1: Write failing tests** — one per family above, plus `ignores another workspace's event` (payload `workspaceId` ≠ current, filtered by caller: `applyEvent` takes `wsId` as 4th arg and drops mismatches) and `a duplicate comment or notice is not added twice`.
- [ ] **Step 2: Run** `pnpm test` → FAIL.
- [ ] **Step 3: Implement** `live.ts` and `socket.ts` (`pnpm add socket.io-client`).
- [ ] **Step 4: Run** `pnpm test` → PASS.
- [ ] **Step 5: Commit** `feat(web): live event reducer and socket`

### Task 3: Store on the API

**Files:**
- Modify: `src/store.tsx`, `src/components/Overlays.tsx` (subtasks/comments use new store calls), `src/pages/Settings.tsx` (drop "reset demo"), `src/components/Shell.tsx` (workspace selector)
- Create: `src/api/session.ts` (pure helpers: `toAuthResult(e: unknown): AuthResult`, `pickWorkspace(list, lastId)`), `src/api/session.test.ts`

**Interfaces:**
- Consumes: Task 1 `api`, `refresh`, `setToken`, `onSignedOut`; Task 2 `applyEvent`, `connectLive`.
- Store additions: `ready: boolean` (boot finished), `workspaces: { id: string; name: string }[]`, `workspaceId: string | null`, `switchWorkspace(id)`, `addSubtask(taskId, title)`, `toggleSubtask(taskId, sid)`, `addComment(taskId, text)`. `signIn`/`signUp` become `Promise<AuthResult>`; `signInWith(provider: 'google' | 'github')` redirects to `${API_URL}/api/v1/auth/${provider}`; `requestMagicLink(email)`, `forgotPassword(email)` resolve `AuthResult`. `signInAs` and `resetDemo` are removed.
- Mutation map: `addTask` → `POST tasks`; `updateTask` → `PATCH tasks/:id` with `version`; `moveTask` → `POST tasks/:id/move {status, beforeId}`; `toggleDone` → move to top of done/todo; `removeTask` → `DELETE` (undo → `POST :id/restore`); `addEvent`/`removeEvent` → events (+restore); `addProject` → `POST projects`; `updateProject` → `PUT :id/prefs` for pinned/starred, `PATCH milestones/:mid` for a toggled milestone, `PATCH :id` otherwise; `invite` → `POST invitations`; `markAllRead` → `POST notifications/read-all`; `setPrefs` → `PATCH /me/prefs`; `setLook` → local + `PATCH /me/prefs {look}`; focus end → `POST focus-sessions` then `PATCH`.
- Rule: optimistic apply → API → replace with the server's view; on error restore the previous `Data` slice and `notify(message, 'warn')`. Server responses replace temp ids.

- [ ] **Step 1: Write failing tests** for `toAuthResult` (ApiError with field email/password/name → that field; other → `{ field: 'email', error: message }`; network error → `'Can’t reach Pane. Check your connection.'`) and `pickWorkspace` (last id if still listed, else first, else null).
- [ ] **Step 2: Run** `pnpm test` → FAIL.
- [ ] **Step 3: Implement** session helpers and rewrite `StoreProvider` as above (boot: refresh → `/me/workspaces` → create `“{first name}’s team”` when the list is empty → snapshot → socket). Workspace switch clears `Data` before the next snapshot.
- [ ] **Step 4: Run** `pnpm test`, `pnpm typecheck`, `pnpm build` → all pass.
- [ ] **Step 5: Commit** `feat(web): store on the API with optimistic updates`

### Task 4: Auth screens and link routes

**Files:**
- Modify: `src/pages/Auth.tsx`, `src/lib/router.ts`, `src/App.tsx`

**Interfaces:**
- Routes: `auth` with params read from the hash query: `#/auth/callback` (OAuth landed: `refresh()` then home), `#/auth/magic?token=` (`POST /auth/magic-link/verify`), `#/auth/verify?token=` (`POST /auth/verify-email`), `#/auth/reset?token=` (new-password form → `POST /auth/password/reset`), `#/invite?token=` (signed in: `POST /invitations/accept`, then switch to that workspace; signed out: sign in first, then accept). `#/signin?error=code` shows a message.
- Apple button becomes GitHub. Sign-in gets "Email me a sign-in link" and a working "Forgot?". Demo-account shortcuts are removed.

- [ ] **Step 1:** `pnpm typecheck` after the router change → FAIL where `AUTH_ROUTES`/routes are used, then fix.
- [ ] **Step 2: Verify in the browser** against the local API (Postgres + Mailpit up, `pnpm --filter server start:dev`, `pnpm dev`): sign up, verify via the Mailpit link, sign out, sign in, magic link, forgot/reset.
- [ ] **Step 3: Commit** `feat(web): auth screens on the API, link routes`

### Task 5: Two-browser check

**Files:** none new (fixes only).

- [ ] **Step 1:** In two browser tabs signed in as two members of one workspace (second one via invite link from Mailpit): create, move, comment on a task in tab A → appears in tab B without reload; mention B → B's inbox shows it; reload B → state persists (from the API). `localStorage` holds no `pane-demo:data`.
- [ ] **Step 2:** `pnpm test`, `pnpm typecheck`, `pnpm build`, server `pnpm test:e2e` → all pass.
- [ ] **Step 3: Commit** fixes, if any, `fix(web): …`
