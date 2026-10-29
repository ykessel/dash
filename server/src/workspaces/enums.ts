// Same values as src/data/types.ts in the frontend.
export const TEAMS = ['Product', 'Design', 'Engineering', 'Marketing'] as const
export type Team = (typeof TEAMS)[number]
export const PRESENCES = ['online', 'focus', 'meeting', 'away'] as const
export type Presence = (typeof PRESENCES)[number]
export type Access = 'owner' | 'admin' | 'member'
