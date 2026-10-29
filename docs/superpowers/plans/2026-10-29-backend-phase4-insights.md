# Backend fase 4 — Insights: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Los números de la página Insights salen de datos reales (`task_activity`, `tasks`, `focus_sessions`, `memberships`), no de `src/lib/metrics.ts`, con exportación CSV.

**Architecture:** Un módulo `insights/` con un servicio de consultas SQL agregadas (una función por bloque de la página) y un controlador con dos rutas: `GET /…/insights` (JSON) y `GET /…/insights.csv`. Todo se agrupa por día en la zona horaria (`tz`) de la membresía de quien pregunta, como el log de focus de la fase 3. Sin tablas nuevas; un índice nuevo.

**Tech Stack:** lo de las fases 1–3. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-10-28-backend-design.md` (sección 4 —`task_activity` alimenta insights—, sección 5 fila Insights, fila **4** de la sección 7). Página que lo consume: `src/pages/Insights.tsx`.

**Rama:** `feat/backend-phase4`, cortada de `feat/backend-phase3` (PR #8 aún no está en `dev`). El PR va contra `dev` cuando #8 se haya fusionado.

**Fuera de esta fase:** cambiar `Insights.tsx` para que use la API (fase 6). Caché de agregados.

## Global Constraints

- Todo lo de las fases 1–3 sigue vigente (`/api/v1`, migraciones a mano, errores `{ code, message, field? }`, `parseBody`, guards de equipo, commits sin `Co-Authored-By`).
- Rutas: `GET /workspaces/:wsId/insights?range=7d|30d|90d` y `GET /workspaces/:wsId/insights.csv?range=…`. `range` por defecto `30d`; cualquier otro valor → `400 invalid` con `field: 'range'` (añadir `range` a `ERROR_FIELDS`). Ambas rutas en `tenancy.e2e-spec.ts`.
- **Ventana:** `n` días que terminan hoy (inclusive), donde "hoy" es la fecha del `CLOCK` en la `tz` de la membresía de quien llama. El periodo anterior son los `n` días justo antes. `days` = las `n` fechas `'YYYY-MM-DD'`, de la más vieja a hoy.
- **Terminada:** una tarea viva (`deleted_at IS NULL`) cuenta como terminada el día local en que tuvo una actividad `status` con `to_status = 'done'`; varias entradas en `done` el mismo día cuentan una vez.
- Solo datos del `workspace_id` de la ruta. Ninguna consulta toca otro equipo.
- Sin datos no hay error ni `NaN`: series en ceros, tasas y medias `null`.

## Review Focus

1. **Borde de zona horaria:** una tarea terminada a las 23:30 en `America/Havana` (03:30 UTC del día siguiente) cuenta en el día local, no en el UTC. Test en Task 1.
2. **Reabrir y volver a cerrar:** `done → todo → done` el mismo día cuenta 1; una tarea borrada no cuenta. Test en Task 1.
3. **Otro equipo:** actividad, focus y tareas de B nunca aparecen en los números de A. Test en Tasks 1 y 2.
4. **Equipo vacío:** todo en cero, `onTime.rate` y `cycle.avgDays` `null`, `byProject` y `stale` vacíos, 200. Test en Task 2.
5. **`range` inválido** (`14d`, `abc`, `7`): `400 invalid` con `field: 'range'`, también en la ruta CSV. Test en Tasks 1 y 4.

---

### Task 1: Ventana, rendimiento y focus por día

**Files:**
- Create: `server/src/insights/{range.ts, insights.service.ts, insights.controller.ts, insights.module.ts}`, `server/src/db/migrations/1793405200000-InsightsIndex.ts`
- Create: `server/test/utils/history.ts`
- Modify: `server/src/common/http-exception.filter.ts` (`ERROR_FIELDS` + `range`), `server/src/app.module.ts`
- Test: `server/test/insights.e2e-spec.ts`, `server/test/tenancy.e2e-spec.ts`

**Interfaces:**
- Produces: `parseRange(raw: unknown): 7 | 30 | 90` en `range.ts` (lanza `400 invalid` field `range`; `undefined` → 30).
- Produces: `InsightsService.window(wsId, userId, n): Promise<Window>` con `Window = { tz: string; today: string; days: string[]; prevDays: string[] }`.
- Produces: `InsightsService.series(wsId, w: Window): Promise<{ throughput: Series; focus: Series }>` con `Series = { current: number[]; previous: number[]; total: number; previousTotal: number }`. `throughput` en tareas, `focus` en horas del equipo (suma de `actual_sec` de sesiones terminadas, por día local de inicio, redondeado a 1 decimal).
- Produces (tests): `history.ts` → `finishedAt(t, taskId, actorId, at: Date)` inserta en `task_activity` una fila `status todo→done` en `at` y deja la tarea en `done` con `done_at`; `focusAt(t, wsId, userId, at: Date, sec: number)` inserta una sesión terminada.
- Ruta: `GET /…/insights?range=` → `{ range, days, throughput, focus, … }` (Tasks 2 y 3 añaden claves).
- Migración: índice `task_activity_done ON task_activity (workspace_id, at) WHERE kind = 'status' AND to_status = 'done'`.

- [ ] **Step 1: Tests que fallan**

```ts
it('range defaults to 30d; days run oldest → today in my tz', …)          // days.length 30, days[29] = hoy local
it('a bad range is 400 invalid on field range', …)                         // 14d, abc, 7
it('throughput counts each task once per day it entered done; deleted tasks do not count', …)
it('a task finished 23:30 in America/Havana counts on the local day', …)  // tz de lin = 'America/Havana' por SQL
it('previous period covers the n days before the window', …)
it('focus hours are the team’s finished sessions per local day', …)       // 5400 s → 1.5
it('another workspace’s activity and focus never count', …)
```

- [ ] **Step 2:** `pnpm test:e2e insights tenancy` → FAIL.
- [ ] **Step 3:** Implementar. La serie se arma en SQL con `generate_series` sobre los días locales y `LEFT JOIN` a los conteos (días sin datos = 0).
- [ ] **Step 4:** → PASS; `pnpm migration:run` local pasa.
- [ ] **Step 5:** Commit `feat(server): insights throughput and focus series`.

### Task 2: Puntualidad, tiempo de ciclo y reparto por proyecto

**Files:**
- Modify: `server/src/insights/insights.service.ts`, `server/src/insights/insights.controller.ts`
- Test: `server/test/insights.e2e-spec.ts`

**Interfaces:**
- Consumes: `Window`, "terminada" (Task 1).
- Produces: `InsightsService.finished(wsId, w): Promise<{ onTime: OnTime; cycle: Cycle; byProject: ProjectShare[] }>`:
  - `OnTime = { total: number; late: number; rate: number | null }` — tareas terminadas en la ventana **con** `due_date`; tarde si el día local de terminar > `due_date`; `rate = round((total − late) / total × 100)`.
  - `Cycle = { avgDays: number | null; previousAvgDays: number | null }` — por tarea terminada en el periodo: días entre su actividad `created` y su primera entrada en `done` dentro del periodo; media a 1 decimal.
  - `ProjectShare = { project: string; finished: number }` — terminadas en la ventana por proyecto vivo, de más a menos, sin ceros.

- [ ] **Step 1: Tests que fallan** — on time vs tarde con `due` (sin `due` no entra en `total`); ciclo de 2 y 4 días → `avgDays: 3`; reparto ordenado; equipo vacío → `rate: null`, `avgDays: null`, `byProject: []` (Review Focus 4); tareas de B no cuentan.
- [ ] **Step 2:** `pnpm test:e2e insights` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(server): insights on-time rate, cycle time and project share`.

### Task 3: Carga y tareas estancadas

**Files:**
- Modify: `server/src/insights/insights.service.ts`, `server/src/insights/insights.controller.ts`
- Test: `server/test/insights.e2e-spec.ts`

**Interfaces:**
- Produces: `InsightsService.load(wsId, w): Promise<{ workload: Workload[]; stale: Stale[] }>` (no depende de `range`: es el estado de hoy):
  - `Workload = { person: string; openHours: number; capacity: number }` — por cada miembro, suma de `estimate` de sus tareas vivas no `done`; ordenado por `openHours / capacity` descendente; miembros sin tareas con `openHours: 0`.
  - `Stale = { task: string; days: number }` — las 3 tareas vivas no `done` con más días (locales) desde su última actividad (`created`/`status`/`restored`); empate por id.

- [ ] **Step 1: Tests que fallan** — horas abiertas por persona contra capacidad, orden por ratio; `done` y borradas no suman; estancadas: top 3 por días desde su última actividad.
- [ ] **Step 2:** `pnpm test:e2e insights` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(server): insights workload and stale tasks`.

### Task 4: Exportación CSV

**Files:**
- Create: `server/src/insights/csv.ts`, `server/src/insights/csv.spec.ts`
- Modify: `server/src/insights/insights.controller.ts`
- Test: `server/test/insights.e2e-spec.ts`, `server/test/tenancy.e2e-spec.ts`

**Interfaces:**
- Consumes: `window`, `series` (Task 1).
- Produces: `toCsv(rows: (string | number)[][]): string` — misma regla que `src/lib/csv.ts` del frontend (comillas si hay `"`, `,` o salto de línea; `"` → `""`; filas unidas con `\n`).
- Ruta: `GET /…/insights.csv?range=` → 200, `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="pane-insights-{n}d.csv"`; columnas `date,finished,previous_period,focus_hours` (las del botón actual de `Insights.tsx`), una fila por día de la ventana.

- [ ] **Step 1: Tests que fallan** — `csv.spec.ts`: `[['a,b', 'say "hi"', 3]]` → `"a,b","say ""hi""",3`; e2e: cabeceras, `n + 1` líneas, la fila de hoy con lo terminado hoy; `range=abc` → 400 field `range`.
- [ ] **Step 2:** `pnpm test csv && pnpm test:e2e insights tenancy` → FAIL.
- [ ] **Step 3:** Implementar (Express `res.setHeader` + `@Res({ passthrough: true })`).
- [ ] **Step 4:** `pnpm test && pnpm test:e2e` → todo PASS.
- [ ] **Step 5:** Commit `feat(server): insights CSV export`.
