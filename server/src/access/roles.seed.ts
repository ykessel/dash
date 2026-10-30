import type { EntityManager } from 'typeorm'
import { DEFAULT_ROLES, type RoleKey } from './permissions'
import { ProjectRole } from './project-role.entity'

/** Gives a new workspace Administrator, Member and Viewer; returns their ids by key. */
export async function seedDefaultRoles(em: EntityManager, wsId: string): Promise<Record<RoleKey, string>> {
  const { identifiers } = await em.insert(ProjectRole, DEFAULT_ROLES.map(r => ({ workspaceId: wsId, key: r.key, name: r.name, permissions: r.permissions })))
  return Object.fromEntries(DEFAULT_ROLES.map((r, i) => [r.key, identifiers[i].id as string])) as Record<RoleKey, string>
}

/** The workspace's Member role: what new projects and newcomers get. */
export async function memberRoleId(em: EntityManager, wsId: string): Promise<string> {
  return (await em.findOneByOrFail(ProjectRole, { workspaceId: wsId, key: 'member' })).id
}
