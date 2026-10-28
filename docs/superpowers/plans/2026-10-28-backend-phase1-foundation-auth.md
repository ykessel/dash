# Backend fase 1 — base e identidad: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear el paquete `server/` con NestJS sobre Postgres y todos los flujos de acceso: email + contraseña (con verificación y reset), magic link, Google y GitHub, con sesiones rotativas.

**Architecture:** NestJS modular (`config`, `db`, `health`, `users`, `mail`, `auth`). TypeORM con migraciones, nunca `synchronize`. Access JWT corto + refresh token opaco rotativo en cookie httpOnly. Los tokens de email (verificar, reset, magic link) son aleatorios, de un solo uso y se guardan con hash.

**Tech Stack:** Node 22, NestJS 11, TypeORM 0.3, pg, Postgres 16 (Neon en remoto, Docker en local), zod, argon2, @nestjs/jwt, @nestjs/passport, passport-google-oauth20, passport-github2, nodemailer, @nestjs/throttler, helmet, cookie-parser, jest + supertest.

**Spec:** `docs/superpowers/specs/2026-10-28-backend-design.md` (secciones 2, 3, 4 —tablas de identidad—, 5 —Auth y `/me`— y 8).

## Global Constraints

- Todo el código del backend vive en `server/`; `pnpm-workspace.yaml` añade `packages: ['server']` y conserva `allowBuilds`.
- Prefijo global de rutas: `/api/v1`.
- `synchronize: false` siempre; el esquema solo cambia por migraciones en `server/src/db/migrations/`.
- Emails normalizados con `trim().toLowerCase()` antes de guardar o buscar; columna `citext`.
- Contraseña: mínimo 8 caracteres; hash argon2id.
- Access JWT: 15 min, `HS256`, `JWT_SECRET` de ≥ 32 caracteres, payload `{ sub: userId }`.
- Refresh: 32 bytes aleatorios en base64url, 30 días, cookie `pane_rt`, `httpOnly`, `SameSite=Lax`, `Path=/api/v1/auth`, `Secure` salvo `COOKIE_SECURE=false`.
- Tokens de email: 32 bytes base64url, se guarda `sha256`. TTL: verify_email 24 h, reset_password 30 min, magic_link 15 min.
- Respuesta de error: `{ code: string, message: string, field?: 'email' | 'password' | 'name' }`.
- Los endpoints que reciben un email para enviar algo (`forgot`, `magic-link`, `verify-email/resend`) responden siempre `202`, exista o no la cuenta.
- Los enlaces de email apuntan al frontend: `${APP_URL}/#/auth/verify?token=…`, `#/auth/reset?token=…`, `#/auth/magic?token=…`. Ningún `GET` consume tokens.
- Commits sin línea `Co-Authored-By`.

## Review Focus

1. **Email con mayúsculas o espacios** (`" Lin@Pane.app "`): es la misma cuenta que `lin@pane.app` en signup, login, reset y magic link. Test en Task 3 y Task 4.
2. **Dos pestañas refrescando a la vez** con el mismo refresh token: ambas obtienen sesión; no se revoca la familia si la reutilización ocurre ≤ 30 s después de rotar. Test en Task 4.
3. **Escáner de email que abre el enlace**: el token sigue válido porque solo `POST` lo consume. Test en Task 6.
4. **OAuth con email de una cuenta local no verificada**: no se vincula; responde `409 { code: 'account_exists_unverified' }`. Test en Task 7.
5. **Token caducado o ya usado**: devuelve `400` con `code` `token_expired` o `token_used`, distinto de `token_invalid`, para que la UI muestre el mensaje correcto. Test en Task 3.

---

### Task 1: Paquete `server/`, config, health y arnés de tests

**Files:**
- Modify: `pnpm-workspace.yaml`
- Create: `server/package.json`, `server/tsconfig.json`, `server/tsconfig.build.json`, `server/nest-cli.json`, `server/jest-e2e.json`, `server/.env.example`, `server/docker-compose.yml`
- Create: `server/src/main.ts`, `server/src/app.module.ts`, `server/src/config/env.ts`, `server/src/health/health.controller.ts`, `server/src/health/health.module.ts`, `server/src/common/http-exception.filter.ts`
- Test: `server/test/utils/app.ts`, `server/test/health.e2e-spec.ts`, `server/src/config/env.spec.ts`

**Interfaces:**
- Produces: `loadEnv(raw: Record<string, string | undefined>): Env` (lanza con la lista de variables inválidas); `type Env` con `NODE_ENV, PORT, DATABASE_URL, DATABASE_URL_DIRECT, JWT_SECRET, APP_URL, API_URL, SMTP_URL, MAIL_FROM, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, COOKIE_SECURE: boolean`.
- Produces: `createTestApp(overrides?: (b: TestingModuleBuilder) => TestingModuleBuilder): Promise<{ app: INestApplication; http: SuperTest; db: DataSource }>` y `resetDb(db: DataSource): Promise<void>` (TRUNCATE … CASCADE de todas las tablas salvo `migrations`).
- Produces: `AppExceptionFilter` que convierte cualquier error en `{ code, message, field? }`.

- [ ] **Step 1:** `docker-compose.yml` con `postgres:16` (puerto 5433, BD `pane` y `pane_test` vía script de init) y `axllent/mailpit` (1025 SMTP, 8025 UI). `pnpm i` en `server/`.
- [ ] **Step 2: Tests que fallan**

```ts
// env.spec.ts
it('rejects a short JWT_SECRET', () => {
  expect(() => loadEnv({ ...valid, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/)
})
it('parses COOKIE_SECURE=false as false', () => {
  expect(loadEnv({ ...valid, COOKIE_SECURE: 'false' }).COOKIE_SECURE).toBe(false)
})
// health.e2e-spec.ts
it('GET /api/v1/health reports the database', async () => {
  const res = await http.get('/api/v1/health').expect(200)
  expect(res.body).toEqual({ status: 'ok', db: 'up' })
})
it('unknown route uses the error shape', async () => {
  const res = await http.get('/api/v1/nope').expect(404)
  expect(res.body).toMatchObject({ code: 'not_found', message: expect.any(String) })
})
```

- [ ] **Step 3:** `pnpm test env.spec` y `pnpm test:e2e health` → FAIL (módulos inexistentes).
- [ ] **Step 4:** Implementar `loadEnv` con zod; `ConfigModule.forRoot({ validate: loadEnv, isGlobal: true })`; `HealthController` hace `SELECT 1`; `main.ts` con `setGlobalPrefix('api/v1')`, `cookieParser()`, el filtro global. Scripts: `dev`, `build`, `test`, `test:e2e`, `migration:generate`, `migration:run`.
- [ ] **Step 5:** Ambos tests → PASS.
- [ ] **Step 6:** Commit `feat(server): scaffold NestJS package with config and health check`.

### Task 2: TypeORM, entidades de identidad y migración inicial

**Files:**
- Create: `server/src/db/data-source.ts`, `server/src/db/db.module.ts`, `server/src/db/migrations/<timestamp>-Identity.ts`
- Create: `server/src/users/user.entity.ts`, `server/src/users/oauth-account.entity.ts`, `server/src/auth/auth-token.entity.ts`, `server/src/auth/refresh-session.entity.ts`
- Create: `server/src/users/email.ts`, `server/src/users/users.service.ts`, `server/src/users/users.module.ts`
- Test: `server/src/users/email.spec.ts`, `server/test/users.e2e-spec.ts`

**Interfaces:**
- Consumes: `Env.DATABASE_URL` (app) y `Env.DATABASE_URL_DIRECT` (CLI de migraciones).
- Produces: entidades con las columnas de la spec §4 (`users`, `oauth_accounts`, `auth_tokens`, `refresh_sessions`).
- Produces: `normalizeEmail(raw: string): string`; `UsersService.findByEmail(email: string): Promise<User | null>`, `findById(id: string): Promise<User | null>`, `create(input: { email: string; name: string; passwordHash?: string; emailVerified: boolean }): Promise<User>`, `markVerified(id: string): Promise<void>`, `setPassword(id: string, hash: string): Promise<void>`.

- [ ] **Step 1: Tests que fallan**

```ts
it('normalizes email', () => expect(normalizeEmail('  Lin@Pane.APP ')).toBe('lin@pane.app'))
it('email is unique ignoring case', async () => {
  await users.create({ email: 'lin@pane.app', name: 'Lin', emailVerified: false })
  await expect(db.query(`INSERT INTO users (email, name) VALUES ('LIN@pane.app', 'X')`)).rejects.toThrow(/unique/i)
})
```

- [ ] **Step 2:** Correr → FAIL.
- [ ] **Step 3:** Migración que crea `citext` y `pgcrypto`, las cuatro tablas con `uuid DEFAULT gen_random_uuid()`, índices: `auth_tokens(token_hash)`, `refresh_sessions(token_hash)`, `refresh_sessions(family_id)`. `globalSetup` de jest ejecuta `migration:run` sobre `pane_test`.
- [ ] **Step 4:** Correr → PASS. Comprobar también `pnpm migration:run` contra una rama de Neon con `DATABASE_URL_DIRECT`.
- [ ] **Step 5:** Commit `feat(server): add identity tables and users service`.

### Task 3: Email, signup y verificación

**Files:**
- Create: `server/src/mail/mailer.ts`, `server/src/mail/smtp.mailer.ts`, `server/src/mail/mail.service.ts`, `server/src/mail/mail.module.ts`, `server/test/utils/memory-mailer.ts`
- Create: `server/src/auth/auth-tokens.service.ts`, `server/src/auth/passwords.ts`, `server/src/auth/auth.controller.ts`, `server/src/auth/auth.service.ts`, `server/src/auth/auth.module.ts`, `server/src/auth/dto/signup.dto.ts`
- Test: `server/test/auth-signup.e2e-spec.ts`, `server/src/auth/auth-tokens.service.spec.ts`

**Interfaces:**
- Produces: token de inyección `MAILER` con `interface Mailer { send(m: { to: string; subject: string; text: string; html: string }): Promise<void> }`; `MemoryMailer` con `sent: Mail[]` y `lastTo(email): Mail | undefined`; `MailService.sendVerifyEmail(to: string, link: string)`, `sendPasswordReset(to, link)`, `sendMagicLink(to, link)`.
- Produces: `type TokenKind = 'verify_email' | 'reset_password' | 'magic_link'`; token `CLOCK` con `interface Clock { now(): Date }` (en tests, `FakeClock` con `advance(ms)`).
- Produces: `AuthTokensService.issue(kind: TokenKind, email: string, userId: string | null): Promise<string>` (devuelve el token en claro) y `consume(kind: TokenKind, raw: string): Promise<AuthToken>`, que lanza `TokenError` con `code: 'token_invalid' | 'token_expired' | 'token_used'`.
- Produces: `hashPassword(p: string): Promise<string>`, `verifyPassword(hash: string, p: string): Promise<boolean>`.
- Produces: `POST /auth/signup {name, email, password}` → `201 { accessToken, user }` + cookie (la sesión se crea con `SessionService` de Task 4; en esta tarea, `201 { user }` y Task 4 añade la sesión). `POST /auth/verify-email {token}` → `204`. `POST /auth/verify-email/resend {email}` → `202`.

- [ ] **Step 1: Tests que fallan**

```ts
it('signs up, emails a verify link, and verifies', async () => {
  await http.post('/api/v1/auth/signup').send({ name: 'Alex Rivera', email: ' Alex@Co.com ', password: 'longenough1' }).expect(201)
  const token = new URL(mailer.lastTo('alex@co.com')!.text.match(/https?:\S+/)![0].replace('#/', '')).searchParams.get('token')
  await http.post('/api/v1/auth/verify-email').send({ token }).expect(204)
  expect((await users.findByEmail('alex@co.com'))!.emailVerifiedAt).not.toBeNull()
})
it('rejects a taken email in any case', async () => {
  const res = await http.post('/api/v1/auth/signup').send({ name: 'X Y', email: 'ALEX@co.com', password: 'longenough1' }).expect(409)
  expect(res.body).toMatchObject({ code: 'email_taken', field: 'email' })
})
it.each([['name', { name: 'A' }], ['password', { password: 'short' }], ['email', { email: 'nope' }]])('validates %s', async (field, patch) => {
  const res = await http.post('/api/v1/auth/signup').send({ name: 'Al Ex', email: 'a@b.co', password: 'longenough1', ...patch }).expect(400)
  expect(res.body.field).toBe(field)
})
it('distinguishes used and expired tokens', async () => {
  // consume twice → token_used; advance clock 25 h → token_expired; random string → token_invalid
})
```

- [ ] **Step 2:** Correr → FAIL.
- [ ] **Step 3:** Implementar. Mensajes de validación iguales a los de `src/store.tsx` (`Tell us your name.`, `Enter a valid email address.`, `Use at least 8 characters.`, `That email already has an account. Sign in instead.`). `AuthTokensService` recibe un `Clock` inyectable (`now(): Date`) para el test de caducidad. `createTestApp` sustituye `MAILER` por `MemoryMailer`.
- [ ] **Step 4:** Correr → PASS.
- [ ] **Step 5:** Commit `feat(server): sign up with email verification`.

### Task 4: Login, sesiones rotativas, logout y `/me`

**Files:**
- Create: `server/src/auth/session.service.ts`, `server/src/auth/cookies.ts`, `server/src/auth/jwt-auth.guard.ts`, `server/src/common/current-user.decorator.ts`, `server/src/users/me.controller.ts`
- Modify: `server/src/auth/auth.controller.ts`, `server/src/auth/auth.service.ts`
- Test: `server/test/auth-session.e2e-spec.ts`

**Interfaces:**
- Consumes: `UsersService`, `verifyPassword`, `Clock`.
- Produces: `SessionService.start(user: User, meta: { ip: string; userAgent: string }): Promise<Issued>`, `rotate(raw: string, meta): Promise<Issued>`, `revoke(raw: string): Promise<void>`, `revokeAllForUser(userId: string): Promise<void>`; `type Issued = { accessToken: string; refreshToken: string; refreshExpiresAt: Date; user: User }`.
- Produces: `setRefreshCookie(res: Response, token: string, expires: Date, secure: boolean)`, `clearRefreshCookie(res: Response, secure: boolean)`.
- Produces: `JwtAuthGuard`; `@CurrentUser()` → `{ id: string }`.
- Produces: `POST /auth/login {email, password, remember}` → `200 { accessToken, user }` + cookie (sin `Expires` si `remember=false`, cookie de sesión). `POST /auth/refresh` → `200 { accessToken, user }` + cookie nueva. `POST /auth/logout` → `204`. `GET /me` → `{ id, email, name, emailVerified, avatarSkin, providers: ('password'|'google'|'github')[] }`. Signup (Task 3) pasa a devolver sesión.

- [ ] **Step 1: Tests que fallan**

```ts
it('logs in with any email casing and reaches /me', async () => {
  const res = await http.post('/api/v1/auth/login').send({ email: ' LIN@pane.app', password: 'pane1234', remember: true }).expect(200)
  expect(res.headers['set-cookie'][0]).toMatch(/pane_rt=.*HttpOnly.*Path=\/api\/v1\/auth/)
  await http.get('/api/v1/me').set('Authorization', `Bearer ${res.body.accessToken}`).expect(200)
})
it('wrong password and unknown email give the same answer', async () => {
  const a = await http.post('/api/v1/auth/login').send({ email: 'lin@pane.app', password: 'wrongpass' }).expect(401)
  const b = await http.post('/api/v1/auth/login').send({ email: 'ghost@pane.app', password: 'wrongpass' }).expect(401)
  expect(a.body).toEqual(b.body)
  expect(a.body).toMatchObject({ code: 'bad_credentials', field: 'password' })
})
it('rotates refresh tokens', async () => { /* refresh → new cookie; old cookie after 31 s → 401 and whole family revoked */ })
it('two tabs refreshing at once both succeed', async () => {
  const [r1, r2] = await Promise.all([refreshWith(cookie), refreshWith(cookie)])
  expect([r1.status, r2.status]).toEqual([200, 200])
})
it('logout revokes the refresh token', async () => { /* logout → refresh with same cookie → 401 */ })
it('expired access token → 401 code token_expired', async () => { /* clock +16 min */ })
```

- [ ] **Step 2:** Correr → FAIL.
- [ ] **Step 3:** Implementar. Mensaje de credenciales: `Email or password is incorrect.` (cambio deliberado frente al demo, que revelaba si el email existe). Una cuenta solo-OAuth sin contraseña responde igual. Reutilización de un refresh rotado hace ≤ 30 s → emite un par nuevo en la misma familia; > 30 s → revoca la familia y `401 { code: 'session_revoked' }`. Seed de test: `lin@pane.app` / `pane1234`.
- [ ] **Step 4:** Correr → PASS.
- [ ] **Step 5:** Commit `feat(server): login, rotating sessions, logout and /me`.

### Task 5: Recuperar contraseña

**Files:**
- Modify: `server/src/auth/auth.controller.ts`, `server/src/auth/auth.service.ts`
- Test: `server/test/auth-reset.e2e-spec.ts`

**Interfaces:**
- Consumes: `AuthTokensService` (`reset_password`), `SessionService.revokeAllForUser`, `MailService.sendPasswordReset`.
- Produces: `POST /auth/password/forgot {email}` → `202`. `POST /auth/password/reset {token, password}` → `200 { accessToken, user }` + cookie.

- [ ] **Step 1: Tests que fallan:** reset completo con el enlace del `MemoryMailer`, luego login con la contraseña nueva → 200 y con la vieja → 401; las sesiones previas quedan revocadas; email desconocido → 202 y ningún correo enviado; contraseña nueva de 7 caracteres → 400 `field: 'password'`; una cuenta solo-OAuth puede fijar contraseña por esta vía.
- [ ] **Step 2:** Correr → FAIL.
- [ ] **Step 3:** Implementar; el reset también marca el email como verificado (lo prueba recibir el correo).
- [ ] **Step 4:** Correr → PASS.
- [ ] **Step 5:** Commit `feat(server): password reset by email`.

### Task 6: Magic link

**Files:**
- Modify: `server/src/auth/auth.controller.ts`, `server/src/auth/auth.service.ts`
- Test: `server/test/auth-magic.e2e-spec.ts`

**Interfaces:**
- Consumes: `AuthTokensService` (`magic_link`), `UsersService.create`, `SessionService.start`, `MailService.sendMagicLink`.
- Produces: `POST /auth/magic-link {email}` → `202`. `POST /auth/magic-link/verify {token}` → `200 { accessToken, user, created: boolean }` + cookie.

- [ ] **Step 1: Tests que fallan:** email existente → sesión con `created: false`; email nuevo → crea usuario verificado con `name` = parte local del email y `created: true` (la UI pedirá completar el perfil); el mismo token dos veces → 400 `token_used`; `GET` al enlace del correo (`/#/auth/magic?token=…`, simulado con `GET /api/v1/auth/magic-link/verify?token=…`) → 404 y el token sigue sirviendo después; pedir un segundo enlace invalida el anterior (`token_invalid`).
- [ ] **Step 2:** Correr → FAIL.
- [ ] **Step 3:** Implementar; al emitir un `magic_link` se marcan `used_at` los pendientes del mismo email.
- [ ] **Step 4:** Correr → PASS.
- [ ] **Step 5:** Commit `feat(server): passwordless sign-in with magic links`.

### Task 7: Google y GitHub

**Files:**
- Create: `server/src/auth/oauth/identity-linker.service.ts`, `server/src/auth/oauth/google.strategy.ts`, `server/src/auth/oauth/github.strategy.ts`, `server/src/auth/oauth/oauth.controller.ts`
- Test: `server/src/auth/oauth/identity-linker.service.spec.ts`, `server/test/auth-oauth.e2e-spec.ts`

**Interfaces:**
- Produces: `type OAuthProfile = { provider: 'google' | 'github'; providerUserId: string; email: string; emailVerified: boolean; name: string }`; `IdentityLinker.resolve(p: OAuthProfile): Promise<User>`, que lanza `AuthError('account_exists_unverified' | 'email_unverified')`.
- Produces: `GET /auth/google`, `GET /auth/github` → 302 al proveedor con `state` firmado en cookie corta. Callbacks → crean sesión (cookie) y 302 a `${APP_URL}/#/auth/callback`; con error → 302 a `${APP_URL}/#/signin?error=<code>`.

- [ ] **Step 1: Tests que fallan (unidad, sin red):**
  - cuenta OAuth ya enlazada → mismo usuario, aunque el email del proveedor haya cambiado;
  - email nuevo verificado → crea usuario verificado + `oauth_accounts`;
  - email de cuenta local **verificada** → enlaza y devuelve esa cuenta;
  - email de cuenta local **no verificada** → `account_exists_unverified`;
  - `emailVerified: false` del proveedor → `email_unverified`.
- [ ] **Step 2:** Correr → FAIL.
- [ ] **Step 3:** Implementar `IdentityLinker`. Estrategias delgadas que solo construyen `OAuthProfile`: Google usa `email_verified` del perfil; GitHub pide `GET /user/emails` (scope `user:email`) y toma el `primary && verified`.
- [ ] **Step 4:** e2e del callback con la estrategia sustituida por una falsa que inyecta un `OAuthProfile` → 302 a `#/auth/callback` con cookie `pane_rt`; error → 302 a `#/signin?error=account_exists_unverified`.
- [ ] **Step 5:** Correr → PASS. Prueba manual con apps OAuth de desarrollo (`http://localhost:3000/api/v1/auth/{google,github}/callback`).
- [ ] **Step 6:** Commit `feat(server): sign in with Google and GitHub`.

### Task 8: Límites, cabeceras y CORS

**Files:**
- Modify: `server/src/main.ts`, `server/src/app.module.ts`, `server/src/auth/auth.controller.ts`
- Create: `server/src/common/throttle-key.ts`
- Test: `server/test/security.e2e-spec.ts`

**Interfaces:**
- Produces: `ThrottlerModule` global (100 req/min por IP) y límites por ruta: `login` 5/min por IP + email, `magic-link`, `password/forgot` y `verify-email/resend` 3 cada 15 min por email, `signup` 10/h por IP. Respuesta `429 { code: 'rate_limited', message }` con `Retry-After`.

- [ ] **Step 1: Tests que fallan:** 6.º login fallido en 1 min → 429 con `Retry-After`; otro email desde la misma IP sigue pudiendo; 4.º magic link al mismo email → 429; `OPTIONS` desde `APP_URL` → cabeceras CORS con `credentials: true`, y desde otro origen → sin `Access-Control-Allow-Origin`; respuesta con cabeceras de `helmet`.
- [ ] **Step 2:** Correr → FAIL.
- [ ] **Step 3:** Implementar; `throttle-key.ts` arma la clave con IP + email normalizado. `app.set('trust proxy', 1)` para que la IP sea la real detrás del proxy de Fly/Railway.
- [ ] **Step 4:** Correr todo (`pnpm test && pnpm test:e2e`) → PASS.
- [ ] **Step 5:** Commit `feat(server): rate limits, security headers and CORS`.

---

**Siguientes planes** (uno por fase de la spec §7, escritos al cerrar esta): fase 2 workspaces + tiempo real
base, fase 3 dominio, fase 4 insights, fase 5 avisos, fase 6 integración frontend, fase 7 producción.
