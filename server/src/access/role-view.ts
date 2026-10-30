import { parsePermissions, type Permission, type RoleKey } from './permissions'
import type { ProjectRole } from './project-role.entity'

export interface RoleView {
  id: string
  key: RoleKey | null
  name: string
  description: string
  permissions: Permission[]
}

export const toRoleView = (r: ProjectRole): RoleView => ({
  id: r.id,
  key: r.key,
  name: r.name,
  description: r.description,
  permissions: parsePermissions(r.permissions),
})
