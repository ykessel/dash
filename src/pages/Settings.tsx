import { useState } from 'react'
import { Icon } from '../components/Icon'
import { Avatar, Seg, Switch } from '../components/ui'
import type { Accent, Prefs, Theme, Wall } from '../data/types'
import { downloadCsv } from '../lib/csv'
import { useStore } from '../store'
import { STATUS_LABEL } from '../components/Overlays'

const SECTIONS = [
  { id: 'profile', label: 'Profile', icon: 'user', hue: 'blue' },
  { id: 'notifications', label: 'Notifications', icon: 'bell', hue: 'pink' },
  { id: 'appearance', label: 'Appearance', icon: 'palette', hue: 'purple' },
  { id: 'focus', label: 'Focus', icon: 'timer', hue: 'orange' },
  { id: 'data', label: 'Data', icon: 'layers', hue: 'teal' },
] as const

const WALLS: Wall[] = ['ash', 'sand', 'sage', 'aurora', 'smoke', 'tide', 'bloom', 'ember', 'grove', 'dusk']
const ACCENTS: { id: Accent; color: string }[] = [
  { id: 'blue', color: '#1f6fe6' }, { id: 'purple', color: '#7b3ff0' }, { id: 'pink', color: '#cf2068' },
  { id: 'orange', color: '#c4500f' }, { id: 'green', color: '#167f3d' }, { id: 'graphite', color: '#55555f' },
]
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

function Tile({ icon, hue }: { icon: string; hue: string }) {
  return <span className="set-tile" data-hue={hue}><Icon name={icon} size={16} /></span>
}

export function Settings() {
  const { data, me, look, setLook, setPrefs, startFocus, notify, project, person } = useStore()
  const [active, setActive] = useState<string>('profile')
  const n = data.prefs.notify
  const setN = (k: keyof Prefs['notify']) => setPrefs({ notify: { ...n, [k]: !n[k] } })

  const jump = (id: string) => {
    setActive(id)
    document.getElementById(`set-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const exportTasks = () => {
    downloadCsv('pane-tasks.csv', [
      ['title', 'project', 'assignee', 'status', 'priority', 'due', 'estimate_h'],
      ...data.tasks.map(t => [t.title, project(t.project).name, person(t.assignee).name, STATUS_LABEL[t.status], t.priority, t.due, t.estimate]),
    ])
    notify(`Exported ${data.tasks.length} tasks`, 'ok')
  }

  const notifRows: { k: keyof Prefs['notify']; title: string; sub: string; icon: string; hue: string }[] = [
    { k: 'mentions', title: 'Mentions', sub: 'When someone @mentions you', icon: 'comment', hue: 'blue' },
    { k: 'due', title: 'Due dates', sub: 'The morning a task of yours is due', icon: 'flag', hue: 'orange' },
    { k: 'meetings', title: 'Meetings', sub: 'Five minutes before they start', icon: 'calendar', hue: 'pink' },
    { k: 'digest', title: 'Daily digest', sub: 'One summary at 9:00 AM', icon: 'inbox', hue: 'teal' },
    { k: 'focus', title: 'Focus finished', sub: 'When a session ends', icon: 'timer', hue: 'purple' },
  ]

  return (
    <>
      <header className="page-head">
        <h1>Settings</h1>
        <p>Your profile, the look of Pane, and when it nudges you</p>
      </header>

      <div className="set-layout">
        <nav className="card glass rise set-nav" style={{ ['--i' as string]: 0 }} aria-label="Settings sections">
          <div className="set-nav__me">
            <Avatar p={me} size={44} />
            <div><b>{me.name}</b><small>{me.email}</small></div>
          </div>
          {SECTIONS.map(s => (
            <button key={s.id} className={`set-nav__item ${active === s.id ? 'is-active' : ''}`} onClick={() => jump(s.id)}>
              <Tile icon={s.icon} hue={s.hue} />
              <span>{s.label}</span>
              <Icon name="right" size={16} />
            </button>
          ))}
        </nav>

        <div className="set-grid">
          <section id="set-profile" className="card glass rise" style={{ ['--i' as string]: 1 }}>
            <div className="card__head"><div><h2>Profile</h2><p>How the team sees you</p></div></div>
            <div className="set-profile">
              <Avatar p={me} size={92} presence />
              <div><h3>{me.name}</h3><p>{me.role}</p><small>{me.email}</small></div>
            </div>
            <ul className="set-rows">
              <li><Tile icon="user" hue="blue" /><b>Name</b><span>{me.name}</span></li>
              <li><Tile icon="mail" hue="purple" /><b>Email</b><span>{me.email}</span></li>
              <li><Tile icon="tasks" hue="teal" /><b>Role</b><span>{me.role}</span></li>
            </ul>
          </section>

          <section id="set-notifications" className="card glass rise" style={{ ['--i' as string]: 2 }}>
            <div className="card__head"><div><h2>Notifications</h2><p>What Pane taps you on the shoulder for</p></div></div>
            <ul className="set-rows">
              {notifRows.map(r => (
                <li key={r.k}>
                  <Tile icon={r.icon} hue={r.hue} />
                  <div><b>{r.title}</b><small>{r.sub}</small></div>
                  <Switch on={n[r.k]} onToggle={() => setN(r.k)} label={r.title} />
                </li>
              ))}
            </ul>
          </section>

          <section id="set-appearance" className="card glass rise set-wide" style={{ ['--i' as string]: 3 }}>
            <div className="card__head"><div><h2>Appearance</h2><p>The whole app re-tints through its glass</p></div></div>
            <ul className="set-rows">
              <li>
                <Tile icon="moon" hue="indigo" />
                <div><b>Theme</b><small>Auto follows your system</small></div>
                <Seg<Theme> value={look.theme} onChange={t => setLook({ theme: t })} options={[{ value: 'light', label: 'Light', icon: 'sun' }, { value: 'dark', label: 'Dark', icon: 'moon' }, { value: 'system', label: 'Auto', icon: 'auto' }]} label="Theme" />
              </li>
              <li className="set-rows__block">
                <div className="set-rows__line"><Tile icon="drop" hue="pink" /><div><b>Wallpaper</b><small>{cap(look.wall)}</small></div></div>
                <div className="walls">
                  {WALLS.map(w => (
                    <button key={w} className="wall-pick" aria-pressed={look.wall === w} onClick={() => setLook({ wall: w })} aria-label={`${cap(w)} wallpaper`}>
                      <span className="wall-thumb" data-wall={w}>
                        <svg viewBox="0 0 160 100" preserveAspectRatio="none" aria-hidden="true">
                          <path d="M0 40 C 40 20, 70 60, 110 40 S 150 20, 160 30 L160 0 L0 0Z" style={{ fill: 'var(--wd1)' }} />
                          <path d="M0 70 C 40 45, 80 85, 120 60 S 160 50, 160 55 L160 25 C 120 15, 90 55, 60 45 S 20 35, 0 50Z" style={{ fill: 'var(--wa1)' }} />
                          <path d="M0 100 L0 75 C 40 60, 80 100, 120 80 S 160 70, 160 75 L160 100Z" style={{ fill: 'var(--wc1)' }} />
                          <path d="M0 85 C 40 70, 80 100, 120 85 S 160 78, 160 80 L160 60 C 130 55, 100 90, 70 80 S 20 65, 0 72Z" style={{ fill: 'var(--wb2)', opacity: 0.8 }} />
                        </svg>
                        <i className="wall-thumb__side" /><i className="wall-thumb__a" /><i className="wall-thumb__b" />
                        {look.wall === w && <span className="wall-thumb__ok"><Icon name="check" size={12} /></span>}
                      </span>
                      <span>{cap(w)}</span>
                    </button>
                  ))}
                </div>
              </li>
              <li className="set-rows__block">
                <div className="set-rows__line"><Tile icon="palette" hue="orange" /><div><b>Accent</b><small>{cap(look.accent)}</small></div></div>
                <div className="accents">
                  {ACCENTS.map(a => (
                    <button key={a.id} className="accent-pick" style={{ ['--c' as string]: a.color }} aria-pressed={look.accent === a.id} aria-label={`${cap(a.id)} accent`} onClick={() => setLook({ accent: a.id })}>
                      {look.accent === a.id && <Icon name="check" size={16} />}
                    </button>
                  ))}
                </div>
              </li>
              <li>
                <Tile icon="layers" hue="blue" />
                <div><b>Glass</b><small>Clear shows more of the wallpaper</small></div>
                <Seg value={look.glass} onChange={g => setLook({ glass: g })} options={[{ value: 'clear', label: 'Clear' }, { value: 'tinted', label: 'Tinted' }]} label="Glass" />
              </li>
              <li>
                <Tile icon="shield" hue="green" />
                <div><b>Reduce transparency</b><small>Solid surfaces, no frost</small></div>
                <Switch on={look.solid} onToggle={() => setLook({ solid: !look.solid })} label="Reduce transparency" />
              </li>
            </ul>
          </section>

          <section id="set-focus" className="card glass rise" style={{ ['--i' as string]: 4 }}>
            <div className="card__head"><div><h2>Focus</h2><p>The timer the island keeps</p></div></div>
            <div className="steppers">
              <Stepper label="Session" value={data.prefs.session} min={5} max={90} step={5} onChange={v => setPrefs({ session: v })} />
              <Stepper label="Break" value={data.prefs.pause} min={1} max={30} step={1} onChange={v => setPrefs({ pause: v })} />
            </div>
            <ul className="set-rows">
              <li>
                <Tile icon="play" hue="orange" />
                <div><b>Start a session now</b><small>{data.prefs.session} minutes, then a {data.prefs.pause}-minute break</small></div>
                <button className="btn btn--primary btn--sm" onClick={() => startFocus()}><Icon name="play" style={{ fill: 'currentColor' }} /> Start</button>
              </li>
            </ul>
          </section>

          <section id="set-data" className="card glass rise" style={{ ['--i' as string]: 5 }}>
            <div className="card__head"><div><h2>Data</h2><p>Your team’s data lives in Pane</p></div></div>
            <ul className="set-rows">
              <li className="is-link" onClick={exportTasks} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && exportTasks()}>
                <Tile icon="download" hue="green" />
                <div><b>Export tasks as CSV</b><small>{data.tasks.length} tasks, one row each</small></div>
                <Icon name="right" size={16} />
              </li>
            </ul>
          </section>
        </div>
      </div>
    </>
  )
}

function Stepper({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div className="stepper well">
      <small>{label}</small>
      <div>
        <button className="round-btn" onClick={() => onChange(Math.max(min, value - step))} disabled={value <= min} aria-label={`Less ${label}`}><Icon name="minus" size={18} /></button>
        <b key={value} className="num">{value}<i>min</i></b>
        <button className="round-btn" onClick={() => onChange(Math.min(max, value + step))} disabled={value >= max} aria-label={`More ${label}`}><Icon name="plus" size={18} /></button>
      </div>
    </div>
  )
}
