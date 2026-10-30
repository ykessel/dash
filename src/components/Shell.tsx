import { useLayoutEffect, useRef, useState } from 'react'
import type { Theme } from '../data/types'
import { ago } from '../lib/date'
import { go, type Route, type RouteName } from '../lib/router'
import { useStore } from '../store'
import { BrandMark, Icon } from './Icon'
import { Avatar, Popover } from './ui'

const NAV: { route: RouteName; label: string; icon: string }[] = [
  { route: 'home', label: 'Home', icon: 'home' },
  { route: 'tasks', label: 'Tasks', icon: 'tasks' },
  { route: 'calendar', label: 'Calendar', icon: 'calendar' },
  { route: 'projects', label: 'Projects', icon: 'folder' },
  { route: 'insights', label: 'Insights', icon: 'chart' },
  { route: 'timesheet', label: 'Timesheet', icon: 'clock' },
  { route: 'team', label: 'Team', icon: 'team' },
  { route: 'settings', label: 'Settings', icon: 'gear' },
]

export const TITLES: Record<RouteName, string> = {
  home: 'Home', tasks: 'Tasks', calendar: 'Calendar', projects: 'Projects', insights: 'Insights', timesheet: 'Timesheet', team: 'Team', settings: 'Settings',
  signin: 'Sign in', signup: 'Sign up', auth: 'Signing in', invite: 'Invite', signedout: 'Signed out',
}

function useLens(dep: unknown, axis: 'y' | 'x') {
  const ref = useRef<HTMLDivElement>(null)
  const [s, setS] = useState<React.CSSProperties>({ opacity: 0 })
  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    const measure = () => {
      const el = root.querySelector<HTMLElement>('.is-active')
      if (!el) return setS({ opacity: 0 })
      setS(axis === 'y'
        ? { opacity: 1, transform: `translateY(${el.offsetTop}px)`, height: el.offsetHeight }
        : { opacity: 1, transform: `translateX(${el.offsetLeft}px)`, width: el.offsetWidth })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(root)
    return () => ro.disconnect()
  }, [dep, axis])
  return [ref, s] as const
}

export function AccountMenu({ anchor, onClose, placement = 'below', align = 'right', matchWidth = false }: {
  anchor: HTMLElement | null; onClose: () => void; placement?: 'below' | 'above'; align?: 'left' | 'right'; matchWidth?: boolean
}) {
  const { look, setLook, openModal, signOut, workspaces, workspaceId, switchWorkspace } = useStore()
  const pick = (t: Theme) => { setLook({ theme: t }); onClose() }
  return (
    <Popover anchor={anchor} onClose={onClose} placement={placement} align={align} matchWidth={matchWidth}>
      <button className="menu__item" onClick={() => { go('settings'); onClose() }}>Settings <Icon name="gear" /></button>
      <button className="menu__item" onClick={() => { openModal({ kind: 'shortcuts' }); onClose() }}>Keyboard shortcuts <Icon name="keyboard" /></button>
      <div className="menu__sep" />
      {(['light', 'dark', 'system'] as Theme[]).map(t => (
        <button key={t} className="menu__item" onClick={() => pick(t)} role="menuitemradio" aria-checked={look.theme === t}>
          {t === 'system' ? 'Match system' : t[0].toUpperCase() + t.slice(1)}
          {look.theme === t && <Icon name="check" className="on" />}
        </button>
      ))}
      <div className="menu__sep" />
      {workspaces.map(w => (
        <button key={w.id} className="menu__item" role="menuitemradio" aria-checked={w.id === workspaceId}
          onClick={() => { switchWorkspace(w.id); go('home'); onClose() }}>
          {w.name}
          {w.id === workspaceId && <Icon name="check" className="on" />}
        </button>
      ))}
      <div className="menu__sep" />
      <button className="menu__item" onClick={() => { onClose(); signOut(); go('signedout') }}>Sign out <Icon name="logout" /></button>
    </Popover>
  )
}

export function NewMenu({ anchor, onClose }: { anchor: HTMLElement | null; onClose: () => void }) {
  const { openModal, startFocus, data } = useStore()
  const run = (f: () => void) => () => { f(); onClose() }
  return (
    <Popover anchor={anchor} onClose={onClose}>
      <button className="menu__item" onClick={run(() => openModal({ kind: 'task' }))}>New task <Icon name="tasks" /></button>
      <button className="menu__item" onClick={run(() => openModal({ kind: 'event' }))}>New event <Icon name="calplus" /></button>
      <button className="menu__item" onClick={run(() => openModal({ kind: 'project' }))}>New project <Icon name="folder" /></button>
      <div className="menu__sep" />
      <button className="menu__item" onClick={run(() => startFocus())}>Focus for {data.prefs.session} min <Icon name="moon" /></button>
    </Popover>
  )
}

function Notifications({ anchor, onClose }: { anchor: HTMLElement | null; onClose: () => void }) {
  const { data, person, markAllRead } = useStore()
  return (
    <Popover anchor={anchor} onClose={onClose} className="notes">
      <div className="notes__head">
        <h2>Notifications</h2>
        <button className="link" onClick={markAllRead}>Mark all read</button>
      </div>
      {data.notices.map(n => {
        const p = person(n.who)
        const isPlain = n.text.startsWith('Orbit')
        return (
          <div key={n.id} className={`note-row ${n.read ? '' : 'unread'}`}>
            <Avatar p={p} size={36} />
            <div>
              <p>{isPlain ? n.text : `${p.name.split(' ')[0]} ${n.text}`}</p>
              <small>{ago(n.at)}</small>
            </div>
          </div>
        )
      })}
    </Popover>
  )
}

export function Sidebar({ route }: { route: Route }) {
  const { data, me } = useStore()
  const [navRef, lens] = useLens(route.name, 'y')
  const meRef = useRef<HTMLButtonElement>(null)
  const [menu, setMenu] = useState(false)
  const open = data.tasks.filter(t => t.assignee === me.id && t.status !== 'done').length
  const pinned = data.projects.filter(p => p.pinned)

  return (
    <aside className="side glass glass--chrome" aria-label="Workspace">
      <a className="brand" href="#/home" aria-label="Pane — home">
        <span className="brand__mark"><BrandMark /></span>
        <span className="brand__name">Pane</span>
      </a>
      <nav aria-label="Main">
        <div className="nav" ref={navRef}>
          <span className="nav__lens" style={lens} />
          {NAV.map(n => (
            <a key={n.route} href={`#/${n.route}`} className={`nav__item ${route.name === n.route ? 'is-active' : ''}`} aria-current={route.name === n.route ? 'page' : undefined} title={n.label}>
              <Icon name={n.icon} />
              <span>{n.label}</span>
              {n.route === 'tasks' && open > 0 && <b className="count">{open}</b>}
            </a>
          ))}
        </div>
      </nav>
      {pinned.length > 0 && (
        <>
          <p className="side__label">Pinned</p>
          <ul className="pinned">
            {pinned.map(p => (
              <li key={p.id}>
                <a href={`#/projects/${p.id}`} data-hue={p.hue} className={route.param === p.id ? 'is-active' : ''}><span>{p.name}</span></a>
              </li>
            ))}
          </ul>
        </>
      )}
      <button ref={meRef} type="button" className="side__me" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(m => !m)}>
        <Avatar p={me} size={36} />
        <span className="side__me-text"><b>{me.name}</b><small>{me.role}</small></span>
        <Icon name="down" size={18} />
      </button>
      {menu && <AccountMenu anchor={meRef.current} onClose={() => setMenu(false)} placement="above" align="left" matchWidth />}
    </aside>
  )
}

export function Toolbar({ route }: { route: Route }) {
  const { data, me, look, setLook, setFinder } = useStore()
  const [open, setOpen] = useState<null | 'new' | 'bell' | 'me'>(null)
  const refs = { new: useRef<HTMLButtonElement>(null), bell: useRef<HTMLButtonElement>(null), me: useRef<HTMLButtonElement>(null) }
  const dark = look.theme === 'dark' || (look.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  const unread = data.notices.some(n => !n.read)
  const toggle = (k: 'new' | 'bell' | 'me') => setOpen(o => (o === k ? null : k))

  return (
    <header className="toolbar" aria-label="Toolbar">
      <div className="toolbar__title glass glass--chrome" key={route.name}>{TITLES[route.name]}</div>
      <div className="toolbar__tools glass glass--chrome">
        <button type="button" className="search-pill" onClick={() => setFinder(true)} aria-label="Search (⌘K)">
          <Icon name="search" size={18} />
          <span>Search</span>
          <kbd>⌘K</kbd>
        </button>
        <button ref={refs.new} type="button" className="tbtn" title="Create" aria-label="Create new" aria-haspopup="menu" aria-expanded={open === 'new'} onClick={() => toggle('new')}>
          <Icon name="plus" />
        </button>
        <button type="button" className="tbtn" title="Theme" aria-label={`Switch to ${dark ? 'light' : 'dark'} theme`} onClick={() => setLook({ theme: dark ? 'light' : 'dark' })}>
          <Icon name={dark ? 'sun' : 'moon'} className="theme-ico" key={dark ? 's' : 'm'} />
        </button>
        <button ref={refs.bell} type="button" className="tbtn" title="Notifications" aria-label="Notifications" aria-expanded={open === 'bell'} onClick={() => toggle('bell')}>
          <Icon name="bell" />
          {unread && <span className="badge-dot" />}
        </button>
        <button ref={refs.me} type="button" className="tbtn tbtn--me" aria-label="Account menu" aria-expanded={open === 'me'} onClick={() => toggle('me')}>
          <Avatar p={me} size={34} />
        </button>
      </div>
      {open === 'new' && <NewMenu anchor={refs.new.current} onClose={() => setOpen(null)} />}
      {open === 'bell' && <Notifications anchor={refs.bell.current} onClose={() => setOpen(null)} />}
      {open === 'me' && <AccountMenu anchor={refs.me.current} onClose={() => setOpen(null)} />}
    </header>
  )
}

export function TabBar({ route }: { route: Route }) {
  const { setFinder } = useStore()
  const more = !['home', 'tasks', 'calendar', 'projects'].includes(route.name)
  const [ref, lens] = useLens(`${route.name}${more}`, 'x')
  const moreRef = useRef<HTMLButtonElement>(null)
  const [menu, setMenu] = useState(false)
  const tabs = NAV.slice(0, 4)
  return (
    <nav className="tabbar" aria-label="Main">
      <div className="tabbar__bar glass glass--chrome">
        <div className="tabbar__track" ref={ref}>
          <span className="tabbar__lens" style={lens} />
          {tabs.map(t => (
            <a key={t.route} href={`#/${t.route}`} className={`tab ${route.name === t.route ? 'is-active' : ''}`}>
              <Icon name={t.icon} size={22} />
              <span>{t.label}</span>
            </a>
          ))}
          <button ref={moreRef} type="button" className={`tab ${more ? 'is-active' : ''}`} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(m => !m)}>
            <Icon name="more" size={22} />
            <span>More</span>
          </button>
        </div>
      </div>
      <button type="button" className="tabbar__search glass glass--chrome" aria-label="Search" onClick={() => setFinder(true)}>
        <Icon name="search" size={22} />
      </button>
      {menu && (
        <Popover anchor={moreRef.current} onClose={() => setMenu(false)} placement="above">
          {NAV.slice(4).map(n => (
            <button key={n.route} className="menu__item" onClick={() => { go(n.route); setMenu(false) }}>
              {n.label} <Icon name={n.icon} />
            </button>
          ))}
        </Popover>
      )}
    </nav>
  )
}
