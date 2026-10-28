import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { Avatar, Check, Seg, Stack, useTick } from '../components/ui'
import type { CalEvent } from '../data/types'
import { addDays, fmtDur, fmtHourLabel, fmtTime, iso, MONTHS_LONG, nowMinutes, parse, startOfDay, todayIso, weekStart, WEEKDAYS_LONG } from '../lib/date'
import { sortByDue } from '../lib/metrics'
import { useStore } from '../store'

const KIND: Record<CalEvent['kind'], { label: string; icon: string }> = {
  meeting: { label: 'Meeting', icon: 'team' },
  review: { label: 'Review', icon: 'sparkle' },
  team: { label: 'Team', icon: 'comment' },
  focus: { label: 'Focus block', icon: 'moon' },
  call: { label: 'Call', icon: 'video' },
  milestone: { label: 'Milestone', icon: 'flag' },
}
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

let mode0: 'month' | 'week' = 'month'

export function Calendar() {
  const { data, openModal } = useStore()
  useTick(30_000)
  const [mode, setModeState] = useState<'month' | 'week'>(mode0)
  const setMode = (m: 'month' | 'week') => { mode0 = m; setModeState(m) }
  const [anchor, setAnchor] = useState(() => startOfDay())
  const [selected, setSelected] = useState(todayIso())

  const ws = weekStart(anchor)
  const we = addDays(ws, 6)
  const weekEvents = data.events.filter(e => e.date >= iso(ws) && e.date <= iso(we))

  const title = mode === 'month'
    ? `${MONTHS_LONG[anchor.getMonth()]} ${anchor.getFullYear()}`
    : ws.getMonth() === we.getMonth()
      ? `${MONTHS_LONG[ws.getMonth()]} ${ws.getFullYear()}`
      : `${MON3[ws.getMonth()]} – ${MON3[we.getMonth()]} ${we.getFullYear()}`

  const shift = (dir: number) => {
    setAnchor(a => {
      if (mode === 'week') return addDays(a, dir * 7)
      const d = new Date(a.getFullYear(), a.getMonth() + dir, 1)
      return d
    })
  }
  const today = () => { setAnchor(startOfDay()); setSelected(todayIso()) }

  return (
    <>
      <header className="page-head">
        <h1 key={title}>{title}</h1>
        <p>{weekEvents.length} events this week</p>
      </header>
      <div className="page-bar">
        <div className="page-actions" style={{ animationDelay: '0.06s' }}>
          <div className="cal-nav seg">
            <button className="seg__btn" onClick={() => shift(-1)} aria-label="Previous"><Icon name="left" size={18} /></button>
            <button className="seg__btn" onClick={today} style={{ fontWeight: 600, color: 'var(--text)', padding: '0 18px' }}>Today</button>
            <button className="seg__btn" onClick={() => shift(1)} aria-label="Next"><Icon name="right" size={18} /></button>
          </div>
          <Seg value={mode} onChange={setMode} options={[{ value: 'month', label: 'Month' }, { value: 'week', label: 'Week' }]} label="Calendar view" />
          <button className="btn btn--primary" onClick={() => openModal({ kind: 'event', preset: { date: selected } })}><Icon name="calplus" /> New event</button>
        </div>
      </div>

      {mode === 'month' ? (
        <div className="cal-layout">
          <Month anchor={anchor} selected={selected} onSelect={setSelected} />
          <DayPanel date={selected} />
        </div>
      ) : (
        <Week start={ws} />
      )}
    </>
  )
}

function Month({ anchor, selected, onSelect }: { anchor: Date; selected: string; onSelect: (d: string) => void }) {
  const { data, project, openDrawer, openModal } = useStore()
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const start = weekStart(first)
  const today = todayIso()
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i))
  const rows = days[35].getMonth() !== anchor.getMonth() && days[28].getMonth() !== anchor.getMonth() ? 5 : 6
  return (
    <section className="card glass rise month" style={{ ['--i' as string]: 1 }}>
      <div className="month__dow">{DOW.map(d => <span key={d}>{d}</span>)}</div>
      <div className="month__grid" style={{ gridTemplateRows: `repeat(${rows}, minmax(96px, 1fr))` }}>
        {days.slice(0, rows * 7).map((d, i) => {
          const key = iso(d)
          const inMonth = d.getMonth() === anchor.getMonth()
          const evs = data.events.filter(e => e.date === key).sort((a, b) => a.start - b.start)
          const due = data.tasks.filter(t => t.status !== 'done' && t.due === key)
          const dueProject = due.length ? project(due[0].project) : null
          const shown = evs.slice(0, 3)
          return (
            <div
              key={key}
              className={`day ${inMonth ? '' : 'is-out'} ${key === today ? 'is-today' : ''} ${key === selected ? 'is-sel' : ''}`}
              style={{ animationDelay: `${i * 8}ms` }}
              onClick={() => onSelect(key)}
              onDoubleClick={() => openModal({ kind: 'event', preset: { date: key } })}
              role="button"
              tabIndex={0}
              aria-label={`${WEEKDAYS_LONG[d.getDay()]} ${d.getDate()}, ${evs.length} events`}
              onKeyDown={e => e.key === 'Enter' && onSelect(key)}
            >
              <div className="day__head">
                <b>{d.getDate()}</b>
                {evs.length > 3 && <small>+{evs.length - 3} more</small>}
                {dueProject && <span className="day__flag" data-hue={dueProject.hue} title={`${due.length} due`}><Icon name="flag" size={12} /></span>}
              </div>
              {shown.map(e => (
                <button key={e.id} className="day__ev" data-hue={e.hue} onClick={ev => { ev.stopPropagation(); openDrawer({ kind: 'event', id: e.id }) }}>
                  {e.title}
                </button>
              ))}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function DayPanel({ date }: { date: string }) {
  const { data, person, project, openDrawer, openModal, toggleDone } = useStore()
  const evs = data.events.filter(e => e.date === date).sort((a, b) => a.start - b.start)
  const isToday = date === todayIso()
  const d = parse(date)
  const now = nowMinutes()
  const due = data.tasks.filter(t => t.status !== 'done' && (isToday ? t.due <= date : t.due === date)).sort(sortByDue)
  const nowIndex = isToday ? evs.findIndex(e => e.start > now) : -1
  const label = isToday ? 'Today' : WEEKDAYS_LONG[d.getDay()]

  return (
    <aside className="card glass rise day-panel" style={{ ['--i' as string]: 2 }} key={date}>
      <div className="card__head">
        <div>
          <h2 className="day-panel__title">{label}</h2>
          <p>{MONTHS_LONG[d.getMonth()]} {d.getDate()} · {evs.length} events</p>
        </div>
        <button className="btn btn--glass btn--sm" onClick={() => openModal({ kind: 'event', preset: { date } })}><Icon name="plus" /> Add event</button>
      </div>
      <ol className="agenda">
        {evs.map((e, i) => (
          <li key={e.id} style={{ display: 'contents' }}>
            {i === nowIndex && <NowRow now={now} />}
            <div className="agenda__ev" data-hue={e.hue} onClick={() => openDrawer({ kind: 'event', id: e.id })} style={{ animationDelay: `${i * 50}ms` }}>
              <div className="agenda__time"><b>{fmtTime(e.start)}</b><small>{fmtDur(e.dur)}</small></div>
              <div className="agenda__body">
                <b>{e.title}</b>
                <small><Icon name={e.where === 'Video call' ? 'video' : e.kind === 'focus' ? 'moon' : 'pin'} size={14} /> {e.where}</small>
                <div className="agenda__foot">
                  {e.people.length > 1 ? <Stack people={e.people.map(person)} size={24} max={4} /> : <Avatar p={person(e.people[0])} size={24} />}
                  <span className="tag tag--plain agenda__kind" data-hue={e.hue}><Icon name={KIND[e.kind].icon} /> {KIND[e.kind].label}</span>
                </div>
              </div>
            </div>
          </li>
        ))}
        {isToday && nowIndex === -1 && evs.length > 0 && <NowRow now={now} />}
        {evs.length === 0 && <li className="empty">A clear day. Double-click a day to add an event.</li>}
      </ol>
      <div className="day-panel__due">
        <div className="section-title" style={{ justifyContent: 'flex-start', gap: 8 }}>{isToday ? 'Due today' : 'Due'} <span className="count">{due.length}</span></div>
        <ul>
          {due.slice(0, 5).map(t => (
            <li key={t.id} onClick={() => openDrawer({ kind: 'task', id: t.id })}>
              <Check on={false} onToggle={() => toggleDone(t.id)} label={t.title} />
              <div><b>{t.title}</b><small><span className="dot" data-hue={project(t.project).hue} /> {project(t.project).name}</small></div>
            </li>
          ))}
        </ul>
        {due.length > 5 && <a className="link" href="#/tasks" style={{ display: 'inline-block', marginTop: 10, paddingLeft: 10 }}>{due.length - 5} more in Tasks</a>}
      </div>
    </aside>
  )
}

function NowRow({ now }: { now: number }) {
  return (
    <div className="now-row"><b>{fmtTime(now)}</b><i /></div>
  )
}

const H0 = 8
const H1 = 19
const ROW = 50

function Week({ start }: { start: Date }) {
  const { data, openDrawer, openModal } = useStore()
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const today = todayIso()
  const [now, setNow] = useState(nowMinutes())
  useEffect(() => {
    const t = window.setInterval(() => setNow(nowMinutes()), 30_000)
    return () => window.clearInterval(t)
  }, [])
  const evs = data.events.filter(e => e.date >= iso(days[0]) && e.date <= iso(days[6]))
  const end = days[6]
  const range = `${MON3[start.getMonth()]} ${start.getDate()} – ${start.getMonth() === end.getMonth() ? '' : MON3[end.getMonth()] + ' '}${end.getDate()}`
  const hours = Array.from({ length: H1 - H0 }, (_, i) => H0 + i)

  const onSlot = (e: React.MouseEvent<HTMLDivElement>, day: string) => {
    const r = e.currentTarget.getBoundingClientRect()
    const min = Math.round(((e.clientY - r.top) / ROW) * 2) / 2
    const startMin = Math.max(H0 * 60, Math.min((H1 - 1) * 60, H0 * 60 + Math.floor(min * 60 / 30) * 30))
    openModal({ kind: 'event', preset: { date: day, start: startMin } })
  }

  return (
    <section className="card glass rise week-view" style={{ ['--i' as string]: 1 }}>
      <div className="card__head">
        <div><h2>{range}</h2><p>{evs.length} events</p></div>
        <span className="card__sub">Click an empty slot to add</span>
      </div>
      <div className="wk">
        <div className="wk__head">
          <span />
          {days.map(d => {
            const k = iso(d)
            return (
              <span key={k} className={k === today ? 'is-today' : ''}>
                <small>{DOW[(d.getDay() + 6) % 7]}</small> <b>{d.getDate()}</b>
              </span>
            )
          })}
        </div>
        <div className="wk__body" style={{ height: hours.length * ROW }}>
          <div className="wk__hours">
            {hours.map(h => <span key={h} style={{ top: (h - H0) * ROW }}>{fmtHourLabel(h)}</span>)}
          </div>
          {days.map(d => {
            const k = iso(d)
            const dayEvs = evs.filter(e => e.date === k)
            return (
              <div key={k} className={`wk__col ${k === today ? 'is-today' : ''}`} onClick={e => onSlot(e, k)}>
                {hours.map(h => <i key={h} className="wk__line" style={{ top: (h - H0) * ROW }} />)}
                {dayEvs.map((e, i) => {
                  const top = ((e.start - H0 * 60) / 60) * ROW
                  const h = Math.max(22, (e.dur / 60) * ROW - 3)
                  return (
                    <button
                      key={e.id}
                      className={`wk__ev ${h < 40 ? 'is-short' : ''}`}
                      data-hue={e.hue}
                      style={{ top, height: h, animationDelay: `${i * 40}ms` }}
                      onClick={ev => { ev.stopPropagation(); openDrawer({ kind: 'event', id: e.id }) }}
                    >
                      <b>{e.title}</b>
                      {h >= 40 && <small>{fmtTime(e.start)} · {e.where}</small>}
                    </button>
                  )
                })}
                {k === today && now >= H0 * 60 && now <= H1 * 60 && (
                  <div className="wk__now" style={{ top: ((now - H0 * 60) / 60) * ROW }} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
