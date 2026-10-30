import { Injectable } from '@nestjs/common'
import { DataSource, type EntityManager } from 'typeorm'
import { AppError } from '../common/http-exception.filter'
import { forbidden } from '../workspaces/errors'
import type { Membership } from '../workspaces/membership.entity'
import { UUID } from '../workspaces/workspace-member.guard'
import { effectivePermissions, type Permission, parsePermissions } from './permissions'

const projectNotFound = () => new AppError(404, 'project_not_found', 'That project doesn’t exist.')

interface Row { id: string; lead_id: string | null; permissions: string[] }

/**
 * What one person may do in a project: workspace owner and admins everything; anyone else their
 * role on the project (or the project's default role), the lead's extras on their own project,
 * and browse. Services call `assert` before any write.
 */
@Injectable()
export class AccessService {
  constructor(private readonly ds: DataSource) {}

  async permissions(wsId: string, projectId: string, m: Membership, em?: EntityManager): Promise<Set<Permission>> {
    const rows = UUID.test(projectId) ? await this.rows(wsId, m.userId, projectId, em) : []
    if (!rows.length) throw projectNotFound()
    return this.toSet(rows[0], m)
  }

  /** Throws 403 unless the caller holds every permission in `need`; returns what they hold. */
  async assert(wsId: string, projectId: string, m: Membership, ...need: Permission[]): Promise<Set<Permission>> {
    const have = await this.permissions(wsId, projectId, m)
    if (!need.every(p => have.has(p))) throw forbidden()
    return have
  }

  /** Every live project of the workspace → the caller's permissions there, in one query. */
  async byProject(wsId: string, m: Membership): Promise<Record<string, Permission[]>> {
    const rows = await this.rows(wsId, m.userId)
    return Object.fromEntries(rows.map(r => [r.id, [...this.toSet(r, m)]]))
  }

  private toSet(r: Row, m: Membership): Set<Permission> {
    return effectivePermissions({ access: m.role, isLead: r.lead_id === m.userId, rolePermissions: parsePermissions(r.permissions) })
  }

  private rows(wsId: string, userId: string, projectId?: string, em?: EntityManager): Promise<Row[]> {
    return (em ?? this.ds).query(
      `SELECT p.id, p.lead_id, r.permissions
         FROM projects p
         LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $2
         JOIN project_roles r ON r.id = coalesce(pm.role_id, p.default_role_id)
        WHERE p.workspace_id = $1 AND p.deleted_at IS NULL ${projectId ? 'AND p.id = $3' : ''}`,
      projectId ? [wsId, userId, projectId] : [wsId, userId],
    )
  }
}
