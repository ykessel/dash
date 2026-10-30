import { covers, DEFAULT_ROLES, effectivePermissions, parsePermissions, PERMISSIONS } from './permissions'

const role = (key: string) => DEFAULT_ROLES.find(r => r.key === key)!.permissions

describe('permissions', () => {
  it("member role equals today's member rights", () => {
    expect([...role('member')].sort()).toEqual([
      'project.browse', 'comments.add', 'tasks.create', 'tasks.edit_any', 'tasks.delete_any',
      'tasks.assign', 'tasks.transition', 'time.log', 'time.edit_own', 'time.delete_own',
    ].sort())
  })

  it('viewer has browse and comments.add only', () => {
    expect([...role('viewer')].sort()).toEqual(['comments.add', 'project.browse'])
  })

  it('administrator has every permission', () => {
    expect([...role('administrator')].sort()).toEqual([...PERMISSIONS].sort())
  })

  it('owner and admin get everything whatever the role', () => {
    expect(effectivePermissions({ access: 'admin', isLead: false, rolePermissions: [] }).size).toBe(PERMISSIONS.length)
    expect(effectivePermissions({ access: 'owner', isLead: false, rolePermissions: [] }).size).toBe(PERMISSIONS.length)
  })

  it('lead adds lead permissions to the role', () => {
    const p = effectivePermissions({ access: 'member', isLead: true, rolePermissions: role('viewer') })
    expect(p.has('project.admin')).toBe(true)
    expect(p.has('time.approve')).toBe(true)
    expect(p.has('time.view_all')).toBe(true)
    expect(p.has('tasks.create')).toBe(false)
  })

  it('browse is always present', () => {
    expect(effectivePermissions({ access: 'member', isLead: false, rolePermissions: [] }).has('project.browse')).toBe(true)
  })

  it('covers is true for a subset and false when one key is missing', () => {
    const have = new Set(role('member'))
    expect(covers(have, role('viewer'))).toBe(true)
    expect(covers(have, ['tasks.create', 'project.admin'])).toBe(false)
  })

  it('parsePermissions drops unknown keys and duplicates', () => {
    expect(parsePermissions(['tasks.create', 'nope', 'tasks.create'])).toEqual(['tasks.create'])
  })
})
