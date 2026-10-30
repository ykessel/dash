import { describe, expect, it } from 'vitest'
import { can, PERMISSION_LABELS } from './access'

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
