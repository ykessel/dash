import type { Access } from '../workspaces/enums'

/** Everything a project role can grant, Jira-style. The order is the order the UI lists them. */
export const PERMISSIONS = [
  'project.browse', 'project.admin',
  'tasks.create', 'tasks.edit_own', 'tasks.edit_any', 'tasks.delete_own', 'tasks.delete_any', 'tasks.assign', 'tasks.transition',
  'comments.add', 'comments.delete_any',
  'time.log', 'time.edit_own', 'time.edit_any', 'time.delete_own', 'time.delete_any', 'time.view_all', 'time.approve',
] as const
export type Permission = (typeof PERMISSIONS)[number]

const group = (prefix: string) => PERMISSIONS.filter(p => p.startsWith(prefix))
export const PERMISSION_GROUPS = {
  project: group('project.'),
  tasks: group('tasks.'),
  comments: group('comments.'),
  time: group('time.'),
}

export type RoleKey = 'administrator' | 'member' | 'viewer'

const VIEWER: Permission[] = ['project.browse', 'comments.add']
// What any workspace member can do today, so the migration changes nothing.
const MEMBER: Permission[] = [
  ...VIEWER,
  'tasks.create', 'tasks.edit_any', 'tasks.delete_any', 'tasks.assign', 'tasks.transition',
  'time.log', 'time.edit_own', 'time.delete_own',
]

/** Seeded in every workspace; they can be duplicated but not edited or deleted. */
export const DEFAULT_ROLES: { key: RoleKey; name: string; permissions: Permission[] }[] = [
  { key: 'administrator', name: 'Administrator', permissions: [...PERMISSIONS] },
  { key: 'member', name: 'Member', permissions: MEMBER },
  { key: 'viewer', name: 'Viewer', permissions: VIEWER },
]

/** The project lead always holds these on their project, whatever their role. */
export const LEAD_PERMISSIONS: Permission[] = ['project.admin', 'time.view_all', 'time.approve']

/** Workspace owner and admins hold everything; anyone else gets their role, the lead's extras, and browse. */
export function effectivePermissions(i: { access: Access; isLead: boolean; rolePermissions: readonly Permission[] }): Set<Permission> {
  if (i.access !== 'member') return new Set(PERMISSIONS)
  return new Set<Permission>(['project.browse', ...i.rolePermissions, ...(i.isLead ? LEAD_PERMISSIONS : [])])
}

export const covers = (have: Set<Permission>, need: Iterable<Permission>) => [...need].every(p => have.has(p))

const KNOWN = new Set<string>(PERMISSIONS)
export const parsePermissions = (list: readonly string[]): Permission[] =>
  [...new Set(list.filter((p): p is Permission => KNOWN.has(p)))]
