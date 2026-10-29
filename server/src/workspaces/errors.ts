import { AppError } from '../common/http-exception.filter'

export const workspaceNotFound = () => new AppError(404, 'workspace_not_found', 'That workspace doesn’t exist.')
export const notAMember = () => new AppError(403, 'not_a_member', 'You’re not a member of this workspace.')
export const forbidden = () => new AppError(403, 'forbidden', 'You don’t have permission to do that.')
