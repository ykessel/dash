import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, type Repository } from 'typeorm'
import type { Actor } from '../common/actor.decorator'
import { isForeignKeyViolation, isUniqueViolation } from '../common/db-errors'
import { DomainEvents } from '../common/domain-events'
import { AppError, type ErrorField } from '../common/http-exception.filter'
import { UUID } from '../workspaces/workspace-member.guard'
import { DEFAULT_ROLES, type Permission } from './permissions'
import { memberRoleId } from './roles.seed'
import { ProjectRole } from './project-role.entity'
import { type RoleView, toRoleView } from './role-view'

export interface RoleInput {
  name: string
  description?: string
  permissions: Permission[]
}

const roleNotFound = () => new AppError(404, 'role_not_found', 'That role doesn’t exist.')
const nameTaken = () => new AppError(409, 'role_name_taken', 'A role with that name already exists.', 'name')
const locked = () => new AppError(403, 'role_locked', 'Built-in roles can’t be changed. Duplicate one instead.')
const KEY_ORDER = DEFAULT_ROLES.map(r => r.key)

/** Every role holds browse: without it nothing else in the project is reachable. */
const withBrowse = (p: Permission[]): Permission[] => [...new Set<Permission>(['project.browse', ...p])]

@Injectable()
export class RolesService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(ProjectRole) private readonly roles: Repository<ProjectRole>,
    private readonly events: DomainEvents,
  ) {}

  /** The built-in roles first (Administrator, Member, Viewer), then the workspace's own by name. */
  async list(wsId: string): Promise<RoleView[]> {
    const rows = await this.roles.findBy({ workspaceId: wsId })
    const rank = (r: ProjectRole) => (r.key ? KEY_ORDER.indexOf(r.key) : KEY_ORDER.length)
    return rows.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)).map(toRoleView)
  }

  /** A role of this workspace sent in a body; anything else is 400 on `field`. */
  async find(wsId: string, id: string, field: ErrorField = 'roleId'): Promise<ProjectRole> {
    const r = UUID.test(id) ? await this.roles.findOneBy({ id, workspaceId: wsId }) : null
    if (!r) throw new AppError(400, 'invalid', 'Pick a role from this workspace.', field)
    return r
  }

  async create(wsId: string, input: RoleInput, actor: Actor): Promise<RoleView> {
    const id = await this.insert(wsId, input.name, input.description ?? '', withBrowse(input.permissions))
    return this.publish('role.created', wsId, id, actor)
  }

  async update(wsId: string, id: string, patch: Partial<RoleInput>, actor: Actor): Promise<RoleView> {
    const r = await this.editable(wsId, id)
    const set = {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.permissions !== undefined ? { permissions: withBrowse(patch.permissions) } : {}),
    }
    if (Object.keys(set).length) {
      try {
        await this.roles.update({ id: r.id }, set)
      } catch (e) {
        throw isUniqueViolation(e) ? nameTaken() : e
      }
    }
    const view = await this.publish('role.updated', wsId, r.id, actor)
    this.events.publish('project.access_changed', wsId, actor, { projectId: null })
    return view
  }

  /** "Viewer copy", then "Viewer copy 2", 3…: a duplicate is a new, editable role. */
  async duplicate(wsId: string, id: string, actor: Actor): Promise<RoleView> {
    const src = await this.own(wsId, id)
    for (let n = 1; n < 50; n++) {
      const name = `${src.name} copy${n > 1 ? ` ${n}` : ''}`.slice(0, 40)
      try {
        const newId = await this.insert(wsId, name, src.description, src.permissions as Permission[])
        return this.publish('role.created', wsId, newId, actor)
      } catch (e) {
        if (!(e instanceof AppError && e.code === 'role_name_taken')) throw e
      }
    }
    throw nameTaken()
  }

  /**
   * Only unused custom roles: a live project's default, or a current workspace member holding it on a
   * live project, is 409. Places nobody can see (deleted projects, people who left) fall back to Member.
   */
  async remove(wsId: string, id: string, actor: Actor): Promise<void> {
    const r = await this.editable(wsId, id)
    await this.ds.transaction(async em => {
      await em.query(`SELECT 1 FROM project_roles WHERE id = $1 FOR UPDATE`, [r.id])
      const [{ n }] = await em.query(
        `SELECT (SELECT count(*) FROM project_members pm
                   JOIN projects p ON p.id = pm.project_id AND p.deleted_at IS NULL
                   JOIN memberships m ON m.workspace_id = p.workspace_id AND m.user_id = pm.user_id
                  WHERE pm.role_id = $1)
              + (SELECT count(*) FROM projects WHERE default_role_id = $1 AND deleted_at IS NULL) AS n`, [r.id])
      const count = Number(n)
      if (count) throw new AppError(409, 'role_in_use', `This role is used in ${count} place${count === 1 ? '' : 's'}. Reassign them first.`)
      const member = await memberRoleId(em, wsId)
      await em.query(`UPDATE project_members SET role_id = $2 WHERE role_id = $1`, [r.id, member])
      await em.query(`UPDATE projects SET default_role_id = $2 WHERE default_role_id = $1`, [r.id, member])
      try {
        await em.delete(ProjectRole, { id: r.id })
      } catch (e) {
        // Someone assigned it between the count and the delete.
        if (isForeignKeyViolation(e)) throw new AppError(409, 'role_in_use', 'This role was just assigned. Reassign it first.')
        throw e
      }
    })
    this.events.publish('role.deleted', wsId, actor, { id: r.id })
    this.events.publish('project.access_changed', wsId, actor, { projectId: null })
  }

  private async insert(wsId: string, name: string, description: string, permissions: Permission[]): Promise<string> {
    try {
      const { identifiers } = await this.roles.insert({ workspaceId: wsId, key: null, name, description, permissions })
      return identifiers[0].id as string
    } catch (e) {
      throw isUniqueViolation(e) ? nameTaken() : e
    }
  }

  private async own(wsId: string, id: string): Promise<ProjectRole> {
    const r = UUID.test(id) ? await this.roles.findOneBy({ id, workspaceId: wsId }) : null
    if (!r) throw roleNotFound()
    return r
  }

  private async editable(wsId: string, id: string): Promise<ProjectRole> {
    const r = await this.own(wsId, id)
    if (r.key) throw locked()
    return r
  }

  private async publish(type: 'role.created' | 'role.updated', wsId: string, id: string, actor: Actor): Promise<RoleView> {
    const role = toRoleView(await this.roles.findOneByOrFail({ id }))
    this.events.publish(type, wsId, actor, { role })
    return role
  }
}
