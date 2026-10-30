import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { Check } from '../components/ui'
import type { Permission, ProjectRole } from '../data/types'
import { PERMISSION_GROUPS, PERMISSION_LABELS } from '../lib/access'
import { useStore } from '../store'

/**
 * Settings → Roles (owner and admins). A role is a named set of permissions that people hold per
 * project; the three built-in ones are locked but can be duplicated, like Jira.
 */
export function RolesSettings({ index }: { index: number }) {
  const { data, createRole, updateRole, duplicateRole, removeRole, notify } = useStore()
  const [selected, setSelected] = useState<string | null>(data.roles[0]?.id ?? null)
  const role = data.roles.find(r => r.id === selected) ?? null

  const add = async () => {
    const taken = new Set(data.roles.map(r => r.name.toLowerCase()))
    let name = 'New role'
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `New role ${n}`
    const r = await createRole({ name, permissions: ['project.browse'] })
    if (r) setSelected(r.id)
  }
  const copy = async (id: string) => {
    const r = await duplicateRole(id)
    if (r) { setSelected(r.id); notify(`Created “${r.name}”`, 'ok') }
  }
  const drop = async (r: ProjectRole) => {
    if (await removeRole(r.id)) { setSelected(data.roles.find(x => x.id !== r.id)?.id ?? null); notify(`Deleted “${r.name}”`, 'info') }
  }

  return (
    <section id="set-roles" className="card glass rise set-wide" style={{ ['--i' as string]: index }}>
      <div className="card__head">
        <div><h2>Roles</h2><p>What people can do in each project they’re part of</p></div>
        <button className="btn btn--glass btn--sm" onClick={add}><Icon name="plus" /> New role</button>
      </div>
      <div className="roles">
        <ul className="roles__list" aria-label="Roles">
          {data.roles.map(r => (
            <li key={r.id}>
              <button className={`roles__item ${r.id === selected ? 'is-active' : ''}`} onClick={() => setSelected(r.id)} aria-pressed={r.id === selected}>
                <b>{r.name}</b>
                <small>{r.permissions.length} permissions</small>
                {r.key && <span className="roles__lock" title="Built-in"><Icon name="shield" size={14} /></span>}
              </button>
            </li>
          ))}
        </ul>
        {role ? <RoleEditor key={role.id} role={role} onSave={patch => updateRole(role.id, patch)} onCopy={() => copy(role.id)} onDelete={() => drop(role)} /> : <p className="tp-none">Pick a role.</p>}
      </div>
    </section>
  )
}

function RoleEditor({ role, onSave, onCopy, onDelete }: {
  role: ProjectRole
  onSave: (patch: { name: string; description: string; permissions: Permission[] }) => Promise<boolean>
  onCopy: () => void
  onDelete: () => void
}) {
  const locked = role.key !== null
  const [name, setName] = useState(role.name)
  const [description, setDescription] = useState(role.description)
  const [perms, setPerms] = useState<Set<Permission>>(new Set(role.permissions))
  useEffect(() => { setName(role.name); setDescription(role.description); setPerms(new Set(role.permissions)) }, [role])

  const dirty = name.trim() !== role.name || description.trim() !== role.description
    || perms.size !== role.permissions.length || role.permissions.some(p => !perms.has(p))
  const toggle = (p: Permission) => {
    // Browse is what every role starts from: without it nothing else in the project is reachable.
    if (locked || p === 'project.browse') return
    setPerms(s => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n })
  }

  return (
    <div className="roles__edit">
      <div className="roles__fields">
        <label className="field"><span>Name</span>
          <input className="input" value={name} maxLength={40} disabled={locked} onChange={e => setName(e.target.value)} />
        </label>
        <label className="field"><span>Description</span>
          <input className="input" value={description} maxLength={200} disabled={locked} placeholder="Who this role is for" onChange={e => setDescription(e.target.value)} />
        </label>
      </div>
      {locked && <p className="roles__note"><Icon name="shield" size={14} /> Built-in roles can’t be changed. Duplicate one to make your own.</p>}
      <div className="roles__grid">
        {PERMISSION_GROUPS.map(g => (
          <fieldset key={g.label} className="roles__group">
            <legend>{g.label}</legend>
            {g.keys.map(p => (
              <div key={p} className={`roles__perm ${locked || p === 'project.browse' ? 'is-locked' : ''}`}>
                <Check on={perms.has(p)} onToggle={() => toggle(p)} label={PERMISSION_LABELS[p]} />
                <span onClick={() => toggle(p)}>{PERMISSION_LABELS[p]}</span>
              </div>
            ))}
          </fieldset>
        ))}
      </div>
      <div className="roles__actions">
        <button className="btn btn--glass btn--sm" onClick={onCopy}><Icon name="layers" /> Duplicate</button>
        {!locked && <button className="btn btn--ghost btn--sm" onClick={onDelete}><Icon name="trash" /> Delete</button>}
        {!locked && (
          <button className="btn btn--primary btn--sm" disabled={!dirty || !name.trim()}
            onClick={() => onSave({ name: name.trim(), description: description.trim(), permissions: [...perms] })}>
            Save
          </button>
        )}
      </div>
    </div>
  )
}
