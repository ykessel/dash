import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { AppError, type ErrorField } from '../common/http-exception.filter'
import { UUID } from './workspace-member.guard'

const invalid = (field: ErrorField, message: string) => new AppError(400, 'invalid', message, field)

/**
 * Checks that ids sent in a body belong to the same workspace, so no row of team A
 * ever points at team B.
 */
@Injectable()
export class WorkspaceRefs {
  constructor(private readonly ds: DataSource) {}

  async assertMembers(wsId: string, userIds: string[], field: ErrorField): Promise<void> {
    const ids = [...new Set(userIds)]
    if (!ids.length) return
    if (!ids.every(id => UUID.test(id))) throw invalid(field, 'Pick people from this workspace.')
    const [{ n }] = await this.ds.query(
      `SELECT count(*)::int AS n FROM memberships WHERE workspace_id = $1 AND user_id = ANY($2::uuid[])`,
      [wsId, ids],
    )
    if (n !== ids.length) throw invalid(field, 'Pick people from this workspace.')
  }

  async assertProject(wsId: string, projectId: string, field: ErrorField = 'project'): Promise<void> {
    if (!UUID.test(projectId)) throw invalid(field, 'Pick a project from this workspace.')
    const rows = await this.ds.query(
      `SELECT 1 FROM projects WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`,
      [projectId, wsId],
    )
    if (!rows.length) throw invalid(field, 'Pick a project from this workspace.')
  }

  async assertTask(wsId: string, taskId: string, field: ErrorField = 'taskId'): Promise<void> {
    if (!UUID.test(taskId)) throw invalid(field, 'Pick a task from this workspace.')
    const rows = await this.ds.query(
      `SELECT 1 FROM tasks WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`,
      [taskId, wsId],
    )
    if (!rows.length) throw invalid(field, 'Pick a task from this workspace.')
  }
}
