// Same values as src/data/types.ts in the frontend.
export const HUES = ['blue', 'purple', 'pink', 'orange', 'green', 'teal', 'indigo', 'yellow'] as const
export type Hue = (typeof HUES)[number]
export const PROJECT_ICONS = ['phone', 'grid', 'rocket', 'leaf', 'flame', 'chart'] as const
export type ProjectIcon = (typeof PROJECT_ICONS)[number]
export const PROJECT_STATUSES = ['progress', 'review', 'planning', 'shipped'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]
export const STATUSES = ['todo', 'progress', 'review', 'done'] as const
export type Status = (typeof STATUSES)[number]
export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const
export type Priority = (typeof PRIORITIES)[number]
export const EVENT_KINDS = ['meeting', 'review', 'team', 'focus', 'call', 'milestone'] as const
export type EventKind = (typeof EVENT_KINDS)[number]

/** SQL `IN (…)` list for a CHECK constraint. */
export const sqlList = (values: readonly string[]) => `(${values.map(v => `'${v}'`).join(', ')})`
