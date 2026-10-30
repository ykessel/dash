# Phase 8: Project Roles and Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jira-style project roles. A workspace's owner and admins define roles as sets of permissions. Each person holds one role per project. Every project write checks a permission instead of today's hard-coded owner/admin/lead rule.

**Architecture:**
- **New `server/src/access/` module.**
  - A fixed permission catalog and a pure `effectivePermissions()` function.
  - A `project_roles` table with three seeded, immutable roles per workspace.
  - `AccessService`, which every project and task write calls before it changes anything.
- **Project membership carries a role.** `project_members.role_id`, plus `projects.default_role_id` for workspace members who aren't on the project's list.
- **Client.** It gets `roles` and `access` (its own permissions per project) in the snapshot. It refetches `access` when a role or a project's membership changes. The UI hides or disables what the user can't do; the server stays the authority.

**Tech Stack:** NestJS 11, TypeORM 0.3 migrations, zod, Jest e2e against Postgres, React 19 + Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-29-roles-and-time-tracking-design.md` §2 (goals and anti-goals), §3 (existing pieces), §4 (phase 8), §6 (constraints), §7 (decisions).

## Global Constraints

- **No workspace changes behaviour on migration.** Every existing member must keep every ability they have today. The roles granted by default are `member` on every row and project. The whole existing e2e suite has to pass unchanged, apart from tests that assert today's lead/admin-only rule, which keep passing because the lead and workspace admins get those rights.
- **Workspace owner and admin have every permission in every project.** The project lead (`projects.lead_id`) always has `project.admin`, `time.view_all` and `time.approve` on that project, on top of their role.
- **No escalation.** To give someone a role, change their role or remove them, the actor's effective permissions in that project must be a superset of both the old role's and the new role's permissions. The same check applies to setting `default_role_id`.
- **Role management** (create, edit, duplicate, delete) needs workspace `owner` or `admin`, through `@Roles('owner','admin')`.
- **Keyed roles** (`administrator`, `member`, `viewer`) can't be edited or deleted: 403 `role_locked`. A role in use can't be deleted: 409 `role_in_use`, with `{ count }`. Names are unique per workspace, case-insensitive: 409 `role_name_taken` on field `name`.
- **Everything filters by `workspace_id`.** A role id from another workspace gives 400 `invalid` on the role field.
- **Errors** use `AppError` with a code. A missing permission is 403 `forbidden`, the existing `forbidden()`.
- **Creating a project stays open** to every workspace member, as today.
- **Commits** carry no `Co-Authored-By` or other attribution trailer.

## Review Focus

1. A workspace member who isn't on a project's member list (nia in `twoTeams`) can still create, edit, move and delete tasks there, through the default role `member`. Test in Task 6.
2. A project lead who is a plain workspace member assigns Administrator to someone, demotes an Administrator, or sets the default role to Administrator: each is 403. Test in Task 5.
3. When the lead changes, the old lead loses `project.admin` and the new lead gains it, with no stale rights. Test in Task 5.
4. Moving a task to a project where the actor lacks `tasks.create` is 403, and the task stays where it was. Test in Task 6.
5. Deleting a role still used as some project's `default_role_id` (not only through `project_members`) is 409 `role_in_use`. Test in Task 3.

---

### Task 1: Permission catalog and effective permissions

**Files:**
- Create: `server/src/access/permissions.ts`
- Test: `server/src/access/permissions.spec.ts`

**Interfaces:**
- Produces:
  - `PERMISSIONS`: the readonly tuple from spec §4.2, in this order: `project.browse, project.admin, tasks.create, tasks.edit_own, tasks.edit_any, tasks.delete_own, tasks.delete_any, tasks.assign, tasks.transition, comments.add, comments.delete_any, time.log, time.edit_own, time.edit_any, time.delete_own, time.delete_any, time.view_all, time.approve`.
  - `type Permission`.
  - `PERMISSION_GROUPS: { project: Permission[]; tasks: Permission[]; comments: Permission[]; time: Permission[] }`.
  - `DEFAULT_ROLES: { key: 'administrator'|'member'|'viewer'; name: string; permissions: Permission[] }[]`, with the names `Administrator`, `Member`, `Viewer`.
  - `LEAD_PERMISSIONS: Permission[]`, which is `project.admin, time.view_all, time.approve`.
  - `effectivePermissions(i: { access: Access; isLead: boolean; rolePermissions: Permission[] }): Set<Permission>`.
  - `covers(have: Set<Permission>, need: Iterable<Permission>): boolean`.
  - `parsePermissions(list: string[]): Permission[]`, which drops unknown keys and de-duplicates.

- [ ] **Step 1: Write the failing tests** in `permissions.spec.ts`.
  - `member role equals today's member rights`: `DEFAULT_ROLES` member = `project.browse, comments.add, tasks.create, tasks.edit_any, tasks.delete_any, tasks.assign, tasks.transition, time.log, time.edit_own, time.delete_own`.
  - `viewer has browse and comments.add only`.
  - `administrator has every permission`: its permissions equal `PERMISSIONS`.
  - `owner and admin get everything whatever the role`: `effectivePermissions({access:'admin', isLead:false, rolePermissions:[]})` has size `PERMISSIONS.length`.
  - `lead adds lead permissions to the role`: viewer role + `isLead:true` has `project.admin`, `time.approve` and `time.view_all`, and lacks `tasks.create`.
  - `browse is always present`: `effectivePermissions({access:'member', isLead:false, rolePermissions:[]})` has `project.browse`.
  - `covers` is true for a subset and false when one key is missing.
  - `parsePermissions(['tasks.create','nope','tasks.create'])` equals `['tasks.create']`.
- [ ] **Step 2: Run.** `pnpm --dir server test -- permissions`. Expected: FAIL, the module isn't found.
- [ ] **Step 3: Implement** `permissions.ts`. Import `Access` from `../workspaces/enums`.
- [ ] **Step 4: Run.** Same command. Expected: PASS, 8 tests.
- [ ] **Step 5: Commit.** `feat(access): permission catalog and effective permissions`

### Task 2: Schema, migration and seeding

**Files:**
- Create: `server/src/access/project-role.entity.ts`
- Create: `server/src/db/migrations/1793405500000-ProjectRoles.ts`
- Create: `server/src/access/roles.seed.ts`
- Create: `server/test/roles.e2e-spec.ts`. Its first test goes here; Task 3 adds the rest.
- Modify:
  - `server/src/projects/project.entity.ts`: `ProjectMember.roleId` and `Project.defaultRoleId`.
  - `server/src/workspaces/workspaces.service.ts:46-50`.
  - `server/src/projects/projects.service.ts`: `create`, `update` (the lead upsert) and `setMembers`.
  - The TypeORM entity list in the data-source and app module. Follow how `Project` is registered.

**Interfaces:**
- Consumes: `DEFAULT_ROLES` (Task 1).
- Produces:
  - Entity `ProjectRole { id; workspaceId; key: 'administrator'|'member'|'viewer'|null; name; description; permissions: string[]; createdAt; updatedAt }` on table `project_roles`. `permissions` is a `text[]` column.
  - `seedDefaultRoles(em: EntityManager, wsId: string): Promise<Record<'administrator'|'member'|'viewer', string>>`, which returns the role ids by key.
  - `memberRoleId(em: EntityManager, wsId: string): Promise<string>`.

- [ ] **Step 1: Write the failing e2e test.** In `roles.e2e-spec.ts`, `a new workspace has Administrator, Member and Viewer`:
  - `SELECT key, name FROM project_roles WHERE workspace_id = $1 ORDER BY key` for `wsA` returns the three rows.
  - A project created by lin has `default_role_id` = the `member` id.
  - Its `project_members` row for lin has `role_id` = the `member` id.
- [ ] **Step 2: Run.** `pnpm --dir server test:e2e -- roles`. Expected: FAIL, relation `project_roles` doesn't exist.
- [ ] **Step 3: Write the migration.**
  - Create `project_roles`:
    - `id uuid pk default gen_random_uuid()`
    - `workspace_id uuid not null references workspaces(id) on delete cascade`
    - `key text null`, `name text not null`, `description text not null default ''`
    - `permissions text[] not null`
    - `created_at`, `updated_at timestamptz not null default now()`
  - Add unique indexes on `(workspace_id, lower(name))` and on `(workspace_id, key) WHERE key IS NOT NULL`.
  - Insert the three keyed roles for every existing workspace, with the same permission arrays as `DEFAULT_ROLES`. Copy them literally; a migration must not import app code.
  - Add `project_members.role_id uuid references project_roles(id)`. Set it to the workspace's member role through `projects`, then `SET NOT NULL`.
  - Add `projects.default_role_id` the same way.
  - `down` drops the two columns and the table.
- [ ] **Step 4: Seed new rows.**
  - `WorkspacesService.create` calls `seedDefaultRoles(em, id)` inside its transaction.
  - `ProjectsService.create` sets `defaultRoleId` to the member role and inserts member rows with `roleId` = member.
  - `update` upserts the new lead's row with the member role only when the row doesn't exist: `orIgnore`, not upsert, so an existing role is kept.
  - `setMembers` keeps the existing `roleId` of people who stay and gives newcomers the project's `defaultRoleId`. Delete only removed users; don't delete and re-insert everyone.
- [ ] **Step 5: Run** the roles e2e test, then the whole suite as a regression check: `pnpm --dir server test:e2e`. Expected: PASS, everything green.
- [ ] **Step 6: Commit.** `feat(access): project roles table, seeded per workspace, role on project members`

### Task 3: Roles API

**Files:**
- Create:
  - `server/src/access/roles.service.ts`
  - `server/src/access/roles.controller.ts`
  - `server/src/access/access.module.ts`, imported by `AppModule`
  - `server/src/access/role-view.ts`
- Test: `server/test/roles.e2e-spec.ts`

**Interfaces:**
- Consumes: `parsePermissions`, `ProjectRole`.
- Produces:
  - `RoleView { id; key: string|null; name; description; permissions: Permission[] }`.
  - `RolesService.list(wsId): Promise<RoleView[]>`, keyed roles first (administrator, member, viewer), then the rest by name.
  - `RolesService.find(wsId, id, field?: ErrorField): Promise<ProjectRole>`, which is 400 `invalid` on `field` when the id isn't a role of this workspace.
  - Routes under `/workspaces/:wsId/roles`:
    - `GET` for any member.
    - `POST {name, description?, permissions}`, `PATCH /:id {name?, description?, permissions?}`, `POST /:id/duplicate` (copy named "`<name>` copy", numbered when taken) and `DELETE /:id` (204). These four need `@Roles('owner','admin')`.
  - Domain events `role.created`, `role.updated` and `role.deleted`, with `{ role }` or `{ id }`, to the workspace room.
  - `name` is trimmed, 1–40 characters. `project.browse` is always added to the stored permissions.

- [ ] **Step 1: Write the failing tests.**
  - `lists the three defaults in order for any member`: as nia, `200`, and the keys are `['administrator','member','viewer']`.
  - `owner creates a role; browse is added; unknown keys are 400`.
    - `{name:'Lead', permissions:['time.view_all']}` gives 201 with `permissions` containing `project.browse`.
    - `['nope']` gives 400 `invalid` on field `permissions`. Validate with `z.enum(PERMISSIONS)` and don't drop silently.
  - `a member can't create roles`: nia gets 403 `forbidden`.
  - `names are unique case-insensitively`: creating `lead` after `Lead` gives 409 `role_name_taken`.
  - `keyed roles are locked`: PATCH or DELETE on member gives 403 `role_locked`.
  - `duplicate copies permissions`: duplicating viewer gives 201 with name `Viewer copy` and `key` null.
  - `a role in use can't be deleted`:
    - A role assigned through `project_members` gives 409 `role_in_use` with `count: 1`.
    - A role used only as some project's `default_role_id` also gives 409 (Review Focus 5).
    - An unused role gives 204.
  - `another workspace's role is 404 role_not_found`: kai's role id on `${base}/roles/:id`.
  - `events reach the workspace`: the captured events include `role.created`.
- [ ] **Step 2: Run.** `pnpm --dir server test:e2e -- roles`. Expected: FAIL, 404 on `/roles`.
- [ ] **Step 3: Implement** the service and controller in the style of `projects.controller.ts`: zod bodies, `parseBody`, `@Actor()`.
  - Map unique-violation errors with `isUniqueViolation` from `common/db-errors`.
  - The in-use count is `project_members` rows plus `projects` rows where `deleted_at IS NULL`, for that role.
- [ ] **Step 4: Run.** Same command. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(access): roles API with defaults, duplicate and in-use guard`

### Task 4: AccessService, the `/access` endpoint and the snapshot

**Files:**
- Create:
  - `server/src/access/access.service.ts`
  - `server/src/access/access.controller.ts`
- Modify:
  - `server/src/snapshot/snapshot.service.ts`: add `roles` and `access`, and bump `DATA_VERSION` to 4.
  - `server/src/access/access.module.ts`: export `AccessService` and `RolesService`.
- Test: `server/test/project-access.e2e-spec.ts`, plus an update to `server/test/snapshot.e2e-spec.ts`.

**Interfaces:**
- Consumes: `effectivePermissions`, `covers`, `ProjectRole`, `ProjectMember`, `Project`.
- Produces:
  - `AccessService.permissions(wsId: string, projectId: string, m: Membership): Promise<Set<Permission>>`. It returns 404 `project_not_found` for a deleted or foreign project. A member row's role wins; otherwise the project's `default_role_id` applies.
  - `AccessService.assert(wsId, projectId, m, ...need: Permission[]): Promise<Set<Permission>>`, which throws `forbidden()` when any permission is missing and returns the set otherwise.
  - `AccessService.byProject(wsId, m): Promise<Record<string, Permission[]>>`, covering every live project in one query plus the role rows.
  - `GET /workspaces/:wsId/access` gives `{ projects: Record<projectId, Permission[]> }`.
  - In the snapshot, `roles: RoleView[]` and `access: Record<projectId, Permission[]>`.

- [ ] **Step 1: Write the failing tests** in `project-access.e2e-spec.ts`.
  - `owner sees every permission everywhere`: lin's `/access` for a project nia created lists all 18.
  - `a member off the list gets the default role`: nia, not a member of lin's project, gets the member permission list exactly.
  - `the lead gets lead permissions on top of Viewer`:
    - Make nia the lead of a project whose `default_role_id` is set to viewer through SQL.
    - Her list = viewer + `project.admin`, `time.view_all`, `time.approve`.
  - `a member row beats the default`: SQL sets nia's `project_members.role_id` to viewer, so her list is viewer only.
  - Snapshot test: `snapshot carries roles and access`. `version: 4`, `roles` has 3 entries, and `access[projectId]` is defined.
- [ ] **Step 2: Run.** `pnpm --dir server test:e2e -- project-access snapshot`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Same command, then `pnpm --dir server test:e2e`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(access): effective permissions per project, /access and snapshot`

### Task 5: Project membership with roles, lead and escalation rules

**Files:**
- Modify:
  - `server/src/projects/projects.service.ts`: replace `assertCanManage` with `access.assert(..., 'project.admin')` in every caller (update, remove, setMembers, the milestone methods).
  - `server/src/projects/projects.controller.ts`
  - `server/src/projects/project-view.ts`
- Test: `server/test/project-access.e2e-spec.ts`. Existing `projects.e2e-spec.ts` must stay green.

**Interfaces:**
- Consumes: `AccessService.assert`, `AccessService.permissions`, `RolesService.find`, `covers`.
- Produces:
  - `ProjectView` gains `roles: Record<userId, roleId>` and `defaultRole: string`. They're shared fields, so `sharedProject` keeps them.
  - `PUT /projects/:id/members/:userId {roleId}` adds a person or changes their role, and returns `ProjectView`.
  - `DELETE /projects/:id/members/:userId` returns `ProjectView`. The lead can't be removed: 409 `lead_is_member`.
  - `PATCH /projects/:id` accepts `defaultRole` (a role id).
  - The existing `PUT /projects/:id/members {userIds}` keeps working. Newcomers get `defaultRole`. Removing someone whose role isn't covered by the actor is 403.
  - Domain event `project.access_changed {projectId}` to the workspace room. It's published after any change to roles, `defaultRole` or the lead, and after role update or delete (from Task 3's service: one event per project that uses the role, or a single `{projectId: null}` meaning "refetch all"; use `null`).
  - Escalation rule, in one private helper `assertCanGrant(have: Set<Permission>, ...roles: ProjectRole[])` that throws `forbidden()` unless `covers(have, role.permissions)` holds for each role.

- [ ] **Step 1: Write the failing tests.**
  - `owner sets a member's role; view shows it; access_changed is published`.
  - `a plain-member lead can't grant, demote or default above themself` (Review Focus 2):
    - Set nia as the lead with her role and the default role both viewer.
    - As nia: `PUT …/members/:x {roleId: administrator}` gives 403.
    - On a person who holds administrator, `PUT` with member gives 403.
    - `PATCH {defaultRole: administrator}` gives 403.
    - `PUT` with viewer for someone at viewer gives 200.
  - `changing the lead moves the lead powers` (Review Focus 3):
    - lin makes nia the lead, so nia can PATCH the project's name.
    - lin then makes herself the lead again.
    - nia's PATCH is now 403, and nia's `/access` lacks `project.admin` when her role is viewer.
  - `a role from another workspace is 400 invalid on roleId`.
  - `the lead can't be removed from the members`: 409 `lead_is_member`.
  - `a viewer can't edit the project or its milestones`: 403 on PATCH and on POST milestone.
- [ ] **Step 2: Run.** `pnpm --dir server test:e2e -- project-access`. Expected: FAIL.
- [ ] **Step 3: Implement.** `assertCanManage` is deleted. Inject `AccessService`; `ProjectsModule` imports `AccessModule`.
- [ ] **Step 4: Run.** `pnpm --dir server test:e2e -- project-access projects`, then the full suite. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(projects): roles on project members, default role, lead powers and no-escalation checks`

### Task 6: Enforce permissions on tasks, subtasks and comments

**Files:**
- Modify:
  - `server/src/tasks/tasks.service.ts`: create, update, move, remove, restore.
  - `server/src/tasks/task-parts.service.ts`: subtasks add, update and remove; `removeComment`; `addComment`.
  - The task controllers, which pass `@CurrentMembership()` through.
- Test: `server/test/task-permissions.e2e-spec.ts` (new). `tasks.e2e-spec.ts`, `tasks-move.e2e-spec.ts` and `task-parts.e2e-spec.ts` must stay green.

**Interfaces:**
- Consumes: `AccessService.assert` and `AccessService.permissions`.
- Produces these rules (own = `task.assigneeId === me || task.createdBy === me`):

  | Action | Needs |
  | --- | --- |
  | create | `tasks.create` in `input.project` |
  | update | `tasks.edit_any`, or `tasks.edit_own` when own |
  | `project` changes | the edit permission above in the source **and** `tasks.create` in the target |
  | `assignee` changes | `tasks.assign` |
  | `status` changes, `POST /move` | `tasks.transition` |
  | remove, restore | `tasks.delete_any`, or `tasks.delete_own` when own |
  | subtasks | the task's edit permission |
  | `addComment` | `comments.add` |
  | `removeComment` | the author, or `comments.delete_any` |

  - Checks run before any write. Restore resolves the project of the deleted row.

- [ ] **Step 1: Write the failing tests.**
  - `a workspace member off the project's list can still do everything today's members can` (Review Focus 1). nia creates, patches, moves, comments on and deletes a task in lin's project, and each gets 2xx.
  - `a viewer can read and comment but not change`. With nia's member row set to viewer, as nia:
    - GET task gives 200 and comment gives 201.
    - PATCH title, move, delete and add subtask each give 403.
  - `edit_own lets a custom role edit only own tasks`:
    - A role with `tasks.edit_own`, `tasks.create` and `tasks.transition`.
    - nia edits a task she created (200) but not lin's (403).
  - `moving a task into a project without tasks.create is 403 and leaves it` (Review Focus 4). The target project's default role is viewer for nia. After the 403, GET shows the old project.
  - `assigning needs tasks.assign`. A role without it: PATCH `{assignee}` gives 403, and PATCH `{title}` gives 200.
  - `comments.delete_any lets an admin role remove someone else's comment`. lin, as owner, deletes nia's comment: 204. Today this is 403, which is the one intended behaviour change from the spec's permission list.
- [ ] **Step 2: Run.** `pnpm --dir server test:e2e -- task-permissions`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the full e2e suite: `pnpm --dir server test:e2e`. Expected: PASS. Update `task-parts.e2e-spec.ts` only if it asserts the old "owner can't delete others' comments" 403. Note that in the commit.
- [ ] **Step 5: Commit.** `feat(tasks): enforce project permissions on tasks, subtasks and comments`

### Task 7: Client data, store and live updates

**Files:**
- Modify:
  - `src/data/types.ts`: `Permission`, `ProjectRole`, `Project.roles`, `Project.defaultRole`, `Data.roles`, `Data.access`.
  - `src/data/seed.ts`: `DATA_VERSION = 4`, the three default roles, and `access` with every permission on every project.
  - `src/api/live.ts`: `role.*` events update `d.roles`. `project.access_changed` is handled in the store, not in `applyEvent`.
  - `src/store.tsx`
- Test: `src/api/live.test.ts` and `src/store.test.tsx` (create the latter if absent; otherwise test `can` as an exported pure helper in `src/lib/access.ts`).

**Interfaces:**
- Consumes: the `/roles`, `/access` and project member endpoints from Tasks 3–5.
- Produces:
  - `can(access: Data['access'], projectId: string, p: Permission): boolean` in `src/lib/access.ts`.
  - `Store.can(projectId, p)`.
  - Store actions, which are optimistic where the store already is, and roll back with a toast on error like `updateProject`:
    - `createRole(r: { name: string; description?: string; permissions: Permission[] }): Promise<ProjectRole | null>`
    - `updateRole(id, patch)`
    - `duplicateRole(id)`
    - `removeRole(id): Promise<boolean>`
    - `setProjectMember(projectId, userId, roleId)`
    - `removeProjectMember(projectId, userId)`
    - `setDefaultRole(projectId, roleId)`
  - On `project.access_changed`, or `member.updated` for me, the store refetches `GET /access` and replaces `data.access`.

- [ ] **Step 1: Write the failing tests.**
  - `can` is true when the permission is listed, and false for an unknown project.
  - `applyEvent` `role.created` and `role.updated` upsert into `roles`, and `role.deleted` removes from it.
  - `project.updated` carries `roles` and `defaultRole` through.
- [ ] **Step 2: Run.** `pnpm test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** `pnpm test && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(web): roles and per-project access in the store, live role events`

### Task 8: Roles screen, project people and gated actions

**Files:**
- Modify:
  - `src/pages/Settings.tsx`: a new `set-roles` section and nav entry, shown only when `me.access` is `owner` or `admin`.
  - `src/pages/ProjectDetail.tsx`: the People section.
  - `src/components/Overlays.tsx`, `src/pages/Tasks.tsx` and `src/pages/ProjectDetail.tsx`: gating.
  - `src/styles/*`: only what the new controls need, using existing tokens.
- Test: `pnpm typecheck`, plus a manual check in the browser through the `run` skill.

**Interfaces:**
- Consumes: `Store.can` and the store actions from Task 7. `PERMISSION_GROUPS` labels are mirrored client-side in `src/lib/access.ts` as `PERMISSION_LABELS: Record<Permission, string>`, with this exact copy:
  - Project: `View the project`, `Manage the project`.
  - Tasks: `Create tasks`, `Edit own tasks`, `Edit any task`, `Delete own tasks`, `Delete any task`, `Assign tasks`, `Change status`.
  - Comments: `Comment`, `Delete any comment`.
  - Time: `Log time`, `Edit own time`, `Edit anyone's time`, `Delete own time`, `Delete anyone's time`, `See everyone's time`, `Approve time`.
- Produces:
  - **Settings → Roles.**
    - A card list of roles, each with its name, its permission count and a lock icon on keyed roles.
    - Selecting a role shows a checkbox grid grouped by Project, Tasks, Comments and Time, plus name and description fields, with Save, Duplicate and Delete.
    - Keyed roles are read-only, offering only Duplicate.
    - On delete, a 409 `role_in_use` shows "Used in N places. Reassign them first."
  - **ProjectDetail → People.**
    - Each person gets a role `<select>`, enabled with `project.admin`, plus a remove button, except for the lead.
    - An "Add person" picker of workspace members not on the list.
    - A "Default role for everyone else" select.
  - **Gating.**
    - The task form's save is disabled without the edit or create permission.
    - Board drag is off without `tasks.transition`.
    - Delete buttons are hidden without delete permission.
    - The comment box is hidden without `comments.add`.
    - The project edit and milestone controls are hidden without `project.admin`.

- [ ] **Step 1: Implement** the Roles section, People section and gating.
- [ ] **Step 2: Run.** `pnpm typecheck && pnpm test && pnpm build`. Expected: PASS.
- [ ] **Step 3: Manual check.** Use the local stack: API, Vite and the docker Postgres. Sign in as the demo owner on localhost; don't state the credentials in chat.
  - Create the role "Lead".
  - Set a member to Viewer on one project.
  - In a second browser profile, as that member, confirm that drag, edit and delete are off and that commenting works.
  - Expected: no console errors.
- [ ] **Step 4: Commit.** `feat(web): roles settings, project people with roles, permission-gated actions`

### Task 9: Docs and final suite

**Files:**
- Modify: `docs/ops/production.md`, with one paragraph under a new "Roles" heading: the defaults, the immutable keys, and that the migration grants Member everywhere.
- [ ] **Step 1:** Run `pnpm --dir server test`, `pnpm --dir server test:e2e`, `pnpm test`, `pnpm typecheck` and `pnpm --dir server build`. Expected: all green.
- [ ] **Step 2: Commit.** `docs: project roles in the runbook`

## Decisions this plan makes (beyond the spec)

- Permission checks run in the services through `AccessService.assert`, not a route guard. Spec §4.4 suggested a decorator plus a guard, but own/any, moves between projects and restore all need the loaded row, so one place is simpler and consistent.
- The client learns about permission changes by refetching `GET /access` on `project.access_changed`, rather than receiving per-user payloads. The event itself reveals nothing.
- The comment-moderation change (Task 6) is the only intended behaviour change for existing users. It gives owners and admins `comments.delete_any`.
