# Roles por proyecto y registro de horas — diseño

Fecha: 2026-10-29 · Estado: propuesta

## 1. Intención

Pane necesita un registro de horas al estilo Jira + Tempo. Cada persona registra lo que trabajó en sus
tareas y obtiene su reporte por día, semana, mes y año. Quien lidera ve el de su equipo completo y el de
cada integrante. Para que "quién ve qué" no quede fijo en el código, antes hay que tener roles y
permisos al estilo Jira, que el owner pueda configurar.

Son dos proyectos y van en este orden. El segundo depende del primero.

1. **Roles y permisos por proyecto** (fase 8).
2. **Registro de horas, timesheet, reportes y aprobación** (fase 9).

Referencia: el modelo de Jira Cloud (permisos globales, roles de proyecto, permisos de proyecto
`WORK_ON_ISSUES`, `EDIT_OWN_WORKLOGS`…) y Tempo Timesheets (vistas Mis horas / Equipo, aprobación por
período). Pane copia la **arquitectura** de Jira en su versión "team-managed": un rol es una lista de
permisos y cada persona tiene un rol en cada proyecto. No copia los esquemas de permisos compartidos
ni los grupos.

## 2. Objetivos, no objetivos, anti-objetivos

**Objetivos**
- El owner crea roles propios ("Lead", "QA"…) marcando permisos de una lista fija.
- Cada persona tiene un rol **por proyecto**. El "equipo" de alguien son las personas de los proyectos
  donde su rol le deja ver las horas de todos.
- Registrar horas desde la tarea ("Log work") y desde un timesheet semanal en cuadrícula.
- Reportes por día, semana, mes y año: Mis horas y Equipo, agrupados por persona, proyecto o tarea, y
  exportables a CSV.
- Aprobación de horas que el lead activa por proyecto, con un período semanal o mensual que también
  elige él.

**No objetivos (por ahora)**
- Cronómetro de iniciar y parar.
- Teams de Tempo separados de los proyectos, grupos y esquemas de permisos compartidos entre proyectos.
- Horas facturables, cuentas o clientes, jornadas requeridas y calendarios de feriados.
- Restringir la visibilidad de un worklog a un rol.
- Proyectos privados. Hoy todos los miembros del workspace ven todos los proyectos y eso no cambia.

**Anti-objetivos (sería un fracaso aunque funcione)**
- Que un workspace existente cambie de comportamiento al migrar. Todo lo que hoy puede hacer alguien,
  lo sigue pudiendo hacer con los roles por defecto.
- Que alguien escale permisos, es decir, que se dé a sí mismo o le dé a otro un permiso que él no tiene.
- Que un día de trabajo caiga en otro día según la zona horaria de quien mira el reporte.
- Que horas aprobadas cambien sin que nadie las reabra explícitamente.

## 3. Lo que ya existe y se reutiliza

- `memberships.role`: `owner | admin | member`. Es el acceso al **workspace**, equivalente a los
  permisos globales de Jira. No cambia.
- `@Roles()` + `WorkspaceMemberGuard` (`server/src/workspaces/`) se usan para las rutas de workspace.
- `projects.lead_id` es el project lead de Jira. `project_members (project_id, user_id)` es la lista de
  miembros del proyecto.
- `tasks.assignee_id` (un solo responsable), `tasks.status` (`todo | progress | review | done`;
  "testing" = `review`) y `tasks.estimate` (horas, double; es el "Original estimate").
- Notificaciones, eventos de dominio y realtime (Socket.IO, salas por workspace) para avisos y refresco
  en vivo.
- `insights` (rangos y CSV) como base de los reportes.

## 4. Fase 8 — Roles y permisos por proyecto

### 4.1 Modelo

- **`project_roles`**: `id, workspace_id, name, description, permissions text[], is_default bool,
  key text null, created_at, updated_at`. Hay un nombre único por workspace (sin distinguir mayúsculas).
  - Cada workspace nuevo, y cada uno existente por migración, recibe tres roles con `key`:
    `administrator`, `member` y `viewer`.
  - Los roles con `key` no se editan ni se borran, pero se pueden **duplicar**, como en Jira.
- **`project_members`** gana `role_id uuid not null` (FK a `project_roles`). La migración pone `member`
  a todos los miembros actuales.
- **`projects`** gana `default_role_id` (FK). Es el rol de cualquier miembro del workspace que no está
  en `project_members`, como el acceso "Open" de Jira. Por defecto es `member`, y así se conserva lo de
  hoy: todos pueden trabajar en todos los proyectos.

### 4.2 Permisos (lista fija, en código)

| Clave | Qué permite |
| --- | --- |
| `project.browse` | Ver el proyecto, sus tareas y sus worklogs propios. Lo tienen todos los roles. |
| `project.admin` | Editar el proyecto, sus miembros y sus roles en el proyecto, y la configuración de horas y aprobación. |
| `tasks.create` | Crear tareas. |
| `tasks.edit_any` / `tasks.edit_own` | Editar cualquier tarea, o solo las asignadas a uno o creadas por uno. |
| `tasks.delete_any` / `tasks.delete_own` | Borrar tareas. |
| `tasks.assign` | Cambiar el responsable. |
| `tasks.transition` | Mover de estado. |
| `comments.add`, `comments.delete_any` | Comentar y moderar comentarios. |
| `time.log` | Registrar horas (`WORK_ON_ISSUES`). |
| `time.edit_own` / `time.edit_any` | Editar worklogs propios o de cualquiera. |
| `time.delete_own` / `time.delete_any` | Borrar worklogs propios o de cualquiera. |
| `time.view_all` | Ver las horas de todos en el proyecto. Es la vista de Equipo. |
| `time.approve` | Aprobar, rechazar y reabrir períodos. |

Permisos de los roles por defecto:
- **Viewer**: `project.browse`, `comments.add`.
- **Member**: todo lo de Viewer, más `tasks.create`, `tasks.edit_any`, `tasks.delete_any`,
  `tasks.assign`, `tasks.transition`, `time.log`, `time.edit_own` y `time.delete_own`. Es lo que un
  miembro puede hacer hoy.
- **Administrator**: todos.

### 4.3 Reglas de evaluación

- El **owner y los admin del workspace** tienen todos los permisos en todos los proyectos, como los
  administradores de Jira.
- El **lead del proyecto** (`projects.lead_id`) tiene siempre `project.admin`, `time.view_all` y
  `time.approve` en su proyecto, además de los de su rol.
- Cualquier otra persona tiene los permisos de su rol en `project_members`, o los de
  `default_role_id` si no figura en el proyecto.
- Para gestionar roles a nivel workspace (crear, editar, duplicar, borrar) hace falta ser owner o admin
  del workspace, con `@Roles('owner','admin')`.
- **Contra la escalada:** solo se asigna a una persona un rol cuyos permisos son un subconjunto de los
  del que asigna, en ese proyecto. Un admin no puede editar un rol para darle permisos que él no tiene.
  Como owner y admin tienen todo, en la práctica esto limita a los `project.admin` que no son admin del
  workspace.
- Ese mismo subconjunto se exige para **cambiar o quitar** a alguien (su rol actual debe estar dentro
  de los permisos de quien actúa) y para fijar `default_role_id`. Mi decisión.
- No se puede borrar un rol en uso. La API responde 409 `role_in_use` con la cantidad de asignaciones.

### 4.4 Implementación

- Un decorador `@ProjectPermission('tasks.edit_any')` y un `ProjectAccessGuard` que resuelven el
  proyecto: de `:projectId`, o de la tarea en `:taskId`. También calculan el conjunto de permisos del
  usuario y lo ponen en el request.
- Los permisos "own/any" se deciden en el servicio, que conoce al autor o al responsable.
- El snapshot del cliente incluye, por proyecto, los permisos efectivos del usuario actual. La UI
  esconde o desactiva acciones con eso; el servidor sigue siendo quien decide.
- Cuando cambian los roles o los miembros, un evento de dominio `project.access_changed` llega por
  realtime y el cliente recarga los permisos.

### 4.5 UI

- **Settings → Roles** (owner/admin): una lista de roles con casillas por permiso, agrupadas como en
  Jira (Proyecto, Tareas, Comentarios, Horas), y las acciones duplicar y borrar.
- **Proyecto → Personas**: el selector de miembros, que ya existe, gana un selector de rol por persona,
  más el "Rol por defecto para el resto del workspace".

## 5. Fase 9 — Registro de horas

### 5.1 Modelo

- **`worklogs`**: `id, workspace_id, project_id, task_id, user_id, work_date date, minutes int,
  comment text, created_at, updated_at, updated_by, deleted_at`.
  - `work_date` es la **fecha local de quien trabaja**: la elige en el formulario y no se deriva de un
    instante. Así un reporte nunca mueve horas de día.
  - `minutes` va de 1 a 1440. La suma de una persona en un día no puede pasar de 24 h; la API responde
    422 `day_over_24h`.
  - Hay índices por `(workspace_id, user_id, work_date)` y por `(project_id, work_date)`.
  - El `project_id` se denormaliza desde la tarea al crear el worklog, para los reportes y la
    aprobación. Si la tarea cambia de proyecto, sus worklogs se mueven con ella, salvo los de períodos
    enviados o aprobados, que bloquean el cambio: 409 `task_has_locked_time`.
- **`tasks`** gana `remaining_minutes int null`. Si es null, la app muestra `estimate − registrado`,
  con piso en 0. Si alguien lo fija en Log work ("Restante: 3h"), se usa ese valor. Es el
  `adjustEstimate=auto|new` de Jira, sin los modos `leave` ni `manual`.
- **`projects`** gana `approval_enabled bool default false` y `approval_period text` (`week | month`,
  default `week`). La semana va de lunes a domingo.
- **`timesheet_periods`**: `id, workspace_id, project_id, user_id, period_start date, period text,
  status text (submitted | approved | rejected), submitted_at, reviewer_id, reviewed_at, comment`.
  Solo existe una fila cuando alguien envía; sin fila, el período está Abierto. Es único por
  `(project_id, user_id, period_start)`.

### 5.2 Reglas

- **Registrar** requiere `time.log` en el proyecto, que la tarea esté en `progress` o `review` y que quien
  registra sea el **responsable** de la tarea ("todo el que tenga una tarea"). Solo se registran horas
  propias; registrar en nombre de otro queda fuera del alcance. Los worklogs de un responsable anterior
  se conservan cuando la tarea cambia de manos.
- **Editar y borrar** requieren `time.edit_own` / `time.delete_own` sobre lo propio, o `*_any` sobre lo
  ajeno. Editar un worklog de una tarea que ya no está en `progress` ni `review` se permite: la regla de estado
  limita registrar, no corregir.
- **Fechas** (mi propuesta): no hay registro con fecha futura, y el pasado está abierto. La aprobación
  es la que cierra períodos.
- **Aprobación**, solo si `approval_enabled`:
  - Un período Enviado o Aprobado bloquea crear, editar y borrar worklogs de esa persona en ese proyecto
    y período. La API responde 409 `period_locked`.
  - Quien tiene `time.approve` en el proyecto aprueba o rechaza períodos Enviados, nunca los propios.
    Al rechazar, el comentario es obligatorio y la fila queda `rejected`, que vuelve a contar como
    abierto. Reabrir un período Aprobado borra la fila.
  - La persona puede **retirar** su envío mientras siga Enviado.
  - Al apagar la aprobación, las filas Enviadas se borran y vuelven a Abierto. Las Aprobadas se quedan,
    para el historial y para el reporte "solo aprobadas", y ya no bloquean nada.
  - Si el lead cambia el período, las filas ya existentes conservan el suyo y el nuevo período aplica a
    los que todavía no se enviaron.
- **Bloqueo por rango (mi decisión):** un worklog está bloqueado si su `work_date` cae dentro de
  cualquier fila Enviada o Aprobada de esa persona en ese proyecto. El chequeo es por rango de
  fechas, no por clave, así que funciona aunque el período haya cambiado de semanal a mensual.
- **Tareas borradas (mi decisión):** no se puede borrar una tarea con horas en un período bloqueado
  (409 `task_has_locked_time`). En otro caso, el borrado lógico saca sus worklogs de los reportes y
  del tope de 24 h, y restaurar la tarea los devuelve.
- **Persona que sale del workspace (mi decisión):** sus worklogs se conservan para el historial y
  los reportes. Sus envíos pendientes se retiran.
- **Mover una tarea de proyecto (mi decisión):** pide `tasks.edit_*` en el origen y `tasks.create`
  en el destino.
- **Tope de 24 h (mi decisión):** se cuenta por workspace.
- **Notificaciones**: al enviar se avisa a quienes tienen `time.approve` en el proyecto, y al aprobar o
  rechazar se avisa a la persona. Se usa el módulo de notificaciones que ya existe; las preferencias de
  email siguen funcionando como hoy.
- **Visibilidad en la tarea (decisión del usuario):** quien ve la tarea ve el **total registrado y lo
  restante**, pero en la lista de worklogs solo ve los suyos. Quien tiene `time.view_all` en el
  proyecto ve la lista completa. Lo mismo vale para la API: `GET /tasks/:id/worklogs` filtra los
  worklogs por permiso, y los totales van en la vista de la tarea.
- **Realtime** (no existen salas por proyecto; hoy hay salas de usuario, de workspace y de cliente):
  - A la sala del **workspace** solo va `task.time_changed {taskId, loggedMinutes, remainingMinutes}`,
    que todos pueden ver.
  - El contenido de los worklogs (`worklog.created|updated|deleted`) y `timesheet.changed` van a las
    **salas de usuario** del autor y de quienes tienen `time.view_all` o `time.approve` en el proyecto.
    Esa lista se calcula en cada evento.

### 5.3 API (bajo `/workspaces/:wsId`)

- `GET|POST /tasks/:taskId/worklogs`, `PATCH|DELETE /worklogs/:id`.
- `GET /timesheet?from&to&user=me|<id>&project=` devuelve los worklogs y el estado de los períodos de
  ese rango. Con `user` distinto del propio solo trae los proyectos donde quien pide tiene
  `time.view_all`.
- `GET /time-reports?from&to&groupBy=user|project|task&bucket=day|week|month|year&scope=me|team&approvedOnly`
  y `…/time-reports.csv`.
- `POST /projects/:id/timesheets/submit {periodStart}`, `…/withdraw`, `…/:userId/approve`,
  `…/:userId/reject {comment}`, `…/:userId/reopen`.
- `PATCH /projects/:id` acepta `approvalEnabled` y `approvalPeriod` si se tiene `project.admin`.

### 5.4 UI (aprobada en el mockup `.superpowers/brainstorm/…/timesheet.html`)

- **Tarea → Log work**:
  - Una barra con registrado / restante / estimado.
  - Un campo de tiempo con formato Jira (`2h 30m`, `1.5h`, `90m`; 1d = 8h), la fecha (hoy por defecto)
    y un comentario.
  - La lista de worklogs con editar y borrar.
  - Fuera de In progress y Review, el botón queda desactivado con el mensaje "Solo se registran horas con la
    tarea en In progress o Review".
- **Timesheet** (página nueva, en la barra lateral):
  - Pestañas **Mis horas** y **Equipo**. Equipo solo aparece si hay algún proyecto con `time.view_all`.
  - La vista es Semana, con navegación ‹ ›. Muestra filas de tareas agrupadas por proyecto y columnas
    L–D con un total.
  - Clic en una celda edita las horas de ese día. Una celda con varios worklogs abre la lista.
  - Cada proyecto muestra un chip de estado (Abierto · semanal / Enviado / Aprobado 🔒 / sin
    aprobación) y el botón "Enviar para aprobación".
  - "+ Agregar tarea a la semana" ofrece las tareas del usuario en In progress o Review.
  - En Equipo, por proyecto: personas × días, el estado y las acciones Aprobar, Rechazar y Reabrir. Clic
    en una persona abre su detalle.
- **Reportes**:
  - Día / Semana / Mes / Año, con un selector de rango.
  - Agrupar por persona, proyecto o tarea, y la casilla "solo aprobadas".
  - Botón Exportar CSV. Puede ser una pestaña de Timesheet o una sección de Insights; lo decide quien
    construye.
- **Proyecto → Configuración**: interruptor "Requerir aprobación de horas" y selector Semanal / Mensual,
  visibles con `project.admin`.

## 6. Restricciones

- Mismo stack y mismas convenciones de las fases 1–7: NestJS 11, TypeORM con migraciones, zod en
  controladores, errores `AppError` con código, e2e contra Postgres 16 local y CI en 18.
- Todo filtra por `workspace_id`. Tests de fuga entre workspaces para worklogs, roles y reportes.
- La migración de fase 8 no puede cambiar lo que nadie puede hacer: tiene que haber un test e2e de
  "miembro existente sigue pudiendo X".
- Sin dependencias nuevas salvo que sea imprescindible. El parser de duración se escribe a mano.

## 7. Decisiones mías (revisar)

- Copiar el modelo "team-managed" de Jira (rol = permisos) y no el de esquemas compartidos.
- Rol por defecto del proyecto para quien no es miembro, con `member` por defecto, para no romper nada.
- Owner y admin del workspace tienen todo en todos los proyectos. El lead tiene siempre admin, ver
  horas y aprobar en el suyo.
- `work_date` local y elegida por la persona, con tope de 24 h por día.
- Los Teams de Tempo, el cronómetro y las horas facturables quedan fuera.
- Sin registro con fecha futura. El pasado queda abierto salvo que haya un período bloqueado.
- Con la aprobación activa, los reportes muestran todo con la opción "solo aprobadas".

## 8. Lo que decide quien construye

- Cómo se organizan los módulos (`access/`, `time/`), los nombres internos y las consultas de reportes.
- Dónde viven los reportes en la navegación (pestaña de Timesheet o Insights).
- Los detalles visuales, siguiendo el sistema de diseño actual (glass, tokens de `src/styles`).
