import type { Data, Permission } from '../data/types'

/** Same keys and order as the server's catalog (server/src/access/permissions.ts). */
export const PERMISSION_LABELS: Record<Permission, string> = {
  'project.browse': 'View the project',
  'project.admin': 'Manage the project',
  'tasks.create': 'Create tasks',
  'tasks.edit_own': 'Edit own tasks',
  'tasks.edit_any': 'Edit any task',
  'tasks.delete_own': 'Delete own tasks',
  'tasks.delete_any': 'Delete any task',
  'tasks.assign': 'Assign tasks',
  'tasks.transition': 'Change status',
  'comments.add': 'Comment',
  'comments.delete_any': 'Delete any comment',
  'time.log': 'Log time',
  'time.edit_own': 'Edit own time',
  'time.edit_any': 'Edit anyone’s time',
  'time.delete_own': 'Delete own time',
  'time.delete_any': 'Delete anyone’s time',
  'time.view_all': 'See everyone’s time',
  'time.approve': 'Approve time',
}

export const PERMISSION_GROUPS: { label: string; keys: Permission[] }[] = [
  { label: 'Project', keys: ['project.browse', 'project.admin'] },
  { label: 'Tasks', keys: ['tasks.create', 'tasks.edit_own', 'tasks.edit_any', 'tasks.delete_own', 'tasks.delete_any', 'tasks.assign', 'tasks.transition'] },
  { label: 'Comments', keys: ['comments.add', 'comments.delete_any'] },
  { label: 'Time', keys: ['time.log', 'time.edit_own', 'time.edit_any', 'time.delete_own', 'time.delete_any', 'time.view_all', 'time.approve'] },
]

/** What the server said I may do in a project; the server still checks every write. */
export const can = (access: Data['access'], projectId: string, p: Permission): boolean =>
  access[projectId]?.includes(p) ?? false

/**
 * Edit or delete a task: the `_any` permission, or `_own` on a task assigned to me. The server also
 * counts tasks I created as mine; the client doesn't know the creator, so those wait for the server.
 * A project I have no permissions for yet (just created, still a temp id) is left to the server too.
 */
export const canOnTask = (access: Data['access'], me: string, t: { project: string; assignee: string }, action: 'edit' | 'delete'): boolean => {
  const mine = access[t.project]
  if (!mine) return true
  return mine.includes(`tasks.${action}_any`) || (t.assignee === me && mine.includes(`tasks.${action}_own`))
}
