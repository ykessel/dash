import { describe, expect, it } from 'vitest'
import { can, canOnTask, PERMISSION_LABELS } from './access'

describe('can', () => {
  const access = { p1: ['project.browse', 'tasks.create'] as const }
  it('is true when the permission is listed', () => {
    expect(can({ p1: [...access.p1] }, 'p1', 'tasks.create')).toBe(true)
  })
  it('is false when it is not, or for an unknown project', () => {
    expect(can({ p1: [...access.p1] }, 'p1', 'tasks.assign')).toBe(false)
    expect(can({ p1: [...access.p1] }, 'p2', 'project.browse')).toBe(false)
  })
  it('labels every permission', () => {
    expect(PERMISSION_LABELS['time.view_all']).toBe('See everyone’s time')
    expect(Object.keys(PERMISSION_LABELS)).toHaveLength(18)
  })
})

describe('canOnTask', () => {
  const t = { project: 'p1', assignee: 'me' }
  it('own permission covers tasks assigned to me only', () => {
    const access = { p1: ['project.browse' as const, 'tasks.edit_own' as const] }
    expect(canOnTask(access, 'me', t, 'edit')).toBe(true)
    expect(canOnTask(access, 'me', { ...t, assignee: 'ana' }, 'edit')).toBe(false)
  })
  it('any permission covers every task', () => {
    expect(canOnTask({ p1: ['tasks.delete_any'] }, 'me', { ...t, assignee: 'ana' }, 'delete')).toBe(true)
  })
  it('a project I know nothing about yet is left to the server', () => {
    expect(canOnTask({}, 'me', t, 'edit')).toBe(true)
  })
})
