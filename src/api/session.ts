import { ApiError } from './client'

export type AuthResult = { ok: true } | { ok: false; field: 'email' | 'password' | 'name'; error: string }
export interface WorkspaceRef { id: string; name: string }

const FORM_FIELDS = ['email', 'password', 'name'] as const

/** Turns whatever an auth call threw into the error the auth forms already know how to show. */
export function toAuthResult(e: unknown): Extract<AuthResult, { ok: false }> {
  if (e instanceof ApiError) {
    const field = (FORM_FIELDS as readonly string[]).includes(e.field ?? '') ? (e.field as (typeof FORM_FIELDS)[number]) : 'email'
    return { ok: false, field, error: e.message }
  }
  return { ok: false, field: 'email', error: 'Can’t reach Pane. Check your connection.' }
}

/** The workspace to open: the last one if I still belong to it, else my first, else none. */
export function pickWorkspace(list: WorkspaceRef[], lastId: string | null): string | null {
  return list.find(w => w.id === lastId)?.id ?? list[0]?.id ?? null
}
