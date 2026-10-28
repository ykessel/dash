import { useEffect, useMemo, useRef, useState } from 'react'
import { relDue } from '../lib/date'
import { go } from '../lib/router'
import { useStore } from '../store'
import { Icon } from './Icon'
import { TITLES } from './Shell'
import { Avatar, usePresence } from './ui'

interface Item {
  id: string
  group: string
  title: string
  sub: string
  icon?: string
  node?: React.ReactNode
  hue?: string
  run: () => void
}

const PAGE_ICONS: Record<string, string> = { home: 'home', tasks: 'tasks', calendar: 'calendar', projects: 'folder', insights: 'chart', team: 'team', settings: 'gear' }

export function Finder() {
  const store = useStore()
  const { finder, setFinder, data, project, openDrawer, openModal, startFocus, setLook } = store
  const [shown, leaving] = usePresence(finder, 180)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLUListElement>(null)

  // Global shortcuts: ⌘K / Ctrl+K and "/" open search.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setFinder(!finder)
      } else if (e.key === 'Escape' && finder) {
        setFinder(false)
      } else if (e.key === '/' && !typing && !finder) {
        e.preventDefault()
        setFinder(true)
      }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [finder, setFinder])

  useEffect(() => {
    if (finder) {
      setQ('')
      setSel(0)
      requestAnimationFrame(() => input.current?.focus())
    }
  }, [finder])

  const close = () => setFinder(false)

  const items = useMemo<Item[]>(() => {
    const s = q.trim().toLowerCase()
    const pages: Item[] = (Object.keys(TITLES) as (keyof typeof TITLES)[]).map(k => ({
      id: `p-${k}`, group: 'Pages', title: TITLES[k], sub: 'Go to page', icon: PAGE_ICONS[k], run: () => go(k),
    }))
    const actions: Item[] = [
      { id: 'a-task', group: 'Actions', title: 'New task', sub: 'Add to the board', icon: 'plus', run: () => openModal({ kind: 'task' }) },
      { id: 'a-event', group: 'Actions', title: 'New event', sub: 'Put it on the calendar', icon: 'calplus', run: () => openModal({ kind: 'event' }) },
      { id: 'a-project', group: 'Actions', title: 'New project', sub: 'Start something', icon: 'folder', run: () => openModal({ kind: 'project' }) },
      { id: 'a-focus', group: 'Actions', title: 'Start a focus session', sub: `${data.prefs.session} minutes`, icon: 'moon', run: () => startFocus() },
      { id: 'a-theme', group: 'Actions', title: 'Toggle theme', sub: 'Light or dark', icon: 'sun', run: () => setLook({ theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' }) },
    ]
    if (!s) return [...pages.slice(0, 4), ...actions.slice(0, 1), actions[3]]
    const has = (t: string) => t.toLowerCase().includes(s)
    const tasks: Item[] = data.tasks.filter(t => has(t.title)).slice(0, 6).map(t => ({
      id: t.id, group: 'Tasks', title: t.title, sub: `${project(t.project).name} · ${t.status === 'done' ? 'Done' : relDue(t.due)}`, icon: project(t.project).icon, hue: project(t.project).hue,
      run: () => { go('tasks'); openDrawer({ kind: 'task', id: t.id }) },
    }))
    const projects: Item[] = data.projects.filter(p => has(p.name)).map(p => ({
      id: p.id, group: 'Projects', title: p.name, sub: p.desc, icon: p.icon, hue: p.hue, run: () => go(`projects/${p.id}`),
    }))
    const people: Item[] = data.people.filter(p => has(p.name) || has(p.role)).map(p => ({
      id: p.id, group: 'People', title: p.name, sub: p.role, node: <Avatar p={p} size={36} />, run: () => { go('team'); openDrawer({ kind: 'person', id: p.id }) },
    }))
    return [...pages.filter(p => has(p.title)), ...actions.filter(a => has(a.title)), ...tasks, ...projects, ...people]
  }, [q, data, project, openModal, startFocus, setLook, openDrawer])

  useEffect(() => setSel(0), [q])
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  const run = (it: Item) => { close(); it.run() }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(items.length - 1, s + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)) }
    else if (e.key === 'Enter' && items[sel]) { e.preventDefault(); run(items[sel]) }
    else if (e.key === 'Escape') { e.preventDefault(); close() }
  }

  if (!shown) return null
  let last = ''
  return (
    <>
      <div className={`scrim ${leaving ? 'is-out' : ''}`} onClick={close} />
      <div className={`finder ${leaving ? 'is-out' : ''}`} role="dialog" aria-label="Search">
        <div className="finder__bar glass glass--thick">
          <Icon name="search" size={22} />
          <input
            ref={input}
            autoFocus
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search tasks, projects, people…"
            role="combobox"
            aria-expanded="true"
            aria-controls="finder-list"
            spellCheck={false}
            autoComplete="off"
          />
          <kbd>esc</kbd>
        </div>
        <ul className="finder__list glass glass--thick" id="finder-list" role="listbox" ref={list}>
          {items.length === 0 && <li className="finder__empty">Nothing matches “{q}”</li>}
          {items.map((it, i) => {
            const head = it.group !== last ? <li className="finder__group" role="presentation">{it.group}</li> : null
            last = it.group
            return (
              <FinderRow key={it.id} head={head} it={it} q={q} selected={i === sel} onHover={() => setSel(i)} onRun={() => run(it)} />
            )
          })}
        </ul>
      </div>
    </>
  )
}

/** Wraps every match of the query in <mark>. */
function Highlight({ text, q }: { text: string; q: string }) {
  const s = q.trim()
  if (!s) return <>{text}</>
  const parts = text.split(new RegExp(`(${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'))
  return <>{parts.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))}</>
}

function FinderRow({ head, it, selected, onHover, onRun, q }: { head: React.ReactNode; it: Item; selected: boolean; onHover: () => void; onRun: () => void; q: string }) {
  return (
    <>
      {head}
      <li className="finder__item" role="option" aria-selected={selected} onMouseMove={onHover} onClick={onRun}>
        {it.node ?? (
          <span className={`tile ${it.hue ? 'pj-icon' : ''}`} data-hue={it.hue}>
            <Icon name={it.icon ?? 'sparkle'} />
          </span>
        )}
        <span>
          <b><Highlight text={it.title} q={q} /></b>
          <small>{it.sub}</small>
        </span>
        <Icon name="right" className="go" size={18} />
      </li>
    </>
  )
}
