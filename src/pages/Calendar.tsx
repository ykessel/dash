import { useLayoutEffect, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { Avatar, Check, Seg, Stack, useTick } from '../components/ui'
import type { CalEvent, Hue, Project } from '../data/types'
import { addDays, fmtDur, fmtHourLabel, fmtTime, iso, MONTHS_LONG, nowMinutes, parse, startOfDay, todayIso, weekStart, WEEKDAYS_LONG } from '../lib/date'
import { sortByDue } from '../lib/metrics'
import { go } from '../lib/router'
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
const H0 = 8 // first hour in the week grid
const HOURS = 11

let mode0: 'month' | 'week' = 'month'

/** Has this event already finished, on the demo clock? */
function isPast(e: CalEvent) {
  const today = todayIso()
  return e.date < today || (e.date === today && e.start + e.dur <= nowMinutes())
}

/** Project milestones that fall on a day, for the little flags. */
function useMilestones() {
  const { data } = useStore()
  return (day: string) =>
    data.projects.flatMap(p => p.milestones.filter(m => m.due === day).map(m => ({ p, m })))
}

export function Calendar() {
  const { data, openModal } = useStore()
  useTick(30_000)
  const [mode, setModeState] = useState<'month' | 'week'>(mode0)
  const setMode = (m: 'month' | 'week') => { mode0 = m; setModeState(m) }
  const [selected, setSelected] = useState(todayIso())
  const [month, setMonth] = useState(() => { const d = startOfDay(); d.setDate(1); return d })

  const pick = (day: string) => {
    setSelected(day)
    const d = parse(day)
    if (d.getMonth() !== month.getMonth() || d.getFullYear() !== month.getFullYear()) setMonth(new Date(d.getFullYear(), d.getMonth(), 1))
  }
  const shift = (dir: number) => {
    if (mode === 'week') pick(iso(addDays(parse(selected), dir * 7)))
    else {
      const m = new Date(month.getFullYear(), month.getMonth() + dir, 1)
      setMonth(m)
      setSelected(m.getMonth() === new Date().getMonth() && m.getFullYear() === new Date().getFullYear() ? todayIso() : iso(m))
    }
  }

  const ws = weekStart(new Date())
  const thisWeek = data.events.filter(e => e.date >= iso(ws) && e.date <= iso(addDays(ws, 6))).length
  const titleDate = mode === 'week' ? weekStart(parse(selected)) : month
  const title = `${MONTHS_LONG[titleDate.getMonth()]} ${titleDate.getFullYear()}`

  return (
    <>
      <header className="page-head">
        <h1 key={title}>{title}</h1>
        <p>{thisWeek} events this week</p>
      </header>
      <div className="page-bar">
        <div className="page-actions cal-actions">
          <div className="cal-nav">
            <button className="cal-nav__btn" onClick={() => shift(-1)} aria-label={mode === 'week' ? 'Previous week' : 'Previous month'}><Icon name="left" /></button>
            <button className="cal-nav__btn cal-nav__today" onClick={() => pick(todayIso())}>Today</button>
            <button className="cal-nav__btn" onClick={() => shift(1)} aria-label={mode === 'week' ? 'Next week' : 'Next month'}><Icon name="right" /></button>
          </div>
          <span className="cal-viewseg"><Seg block value={mode} onChange={setMode} options={[{ value: 'month', label: 'Month' }, { value: 'week', label: 'Week' }]} label="Calendar view" /></span>
          <button className="btn btn--primary" onClick={() => openModal({ kind: 'event', preset: { date: selected } })}><Icon name="calplus" /> New event</button>
        </div>
      </div>

      <div className={`cal ${mode === 'week' ? 'is-week' : ''}`}>
        {mode === 'month'
          ? <><Month month={month} selected={selected} onSelect={pick} /><Agenda date={selected} /></>
          : <Week start={weekStart(parse(selected))} />}
      </div>
    </>
  )
}

/* ---------------- Month ---------------- */

function Month({ month, selected, onSelect }: { month: Date; selected: string; onSelect: (d: string) => void }) {
  const { data, openDrawer, openModal } = useStore()
  const milestones = useMilestones()
  const gridRef = useRef<HTMLDivElement>(null)
  const [ring, setRing] = useState<React.CSSProperties>({ opacity: 0 })
  const start = weekStart(month)
  const today = todayIso()
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i))
  const shown = days // always six weeks, like the reference

  // The selection ring glides from day to day.
  useLayoutEffect(() => {
    const grid = gridRef.current
    const measure = () => {
      const el = grid?.querySelector<HTMLElement>(`[data-day="${selected}"]`)
      setRing(r => (el
        ? { opacity: 1, width: el.offsetWidth, height: el.offsetHeight, transform: `translate(${el.offsetLeft}px, ${el.offsetTop}px)`, transition: r.opacity ? undefined : 'none' }
        : { opacity: 0 }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (grid) ro.observe(grid)
    return () => ro.disconnect()
  }, [selected, month])

  return (
    <section className="card glass rise cal-monthcard" style={{ ['--i' as string]: 1 }}>
      <div className="cal-wd" aria-hidden="true">{DOW.map(d => <span key={d}>{d}</span>)}</div>
      <div className="cal-stage" ref={gridRef}>
        <div className="cal-grid" role="grid" aria-label={`${MONTHS_LONG[month.getMonth()]} ${month.getFullYear()}`}>
          {shown.map((d, i) => {
            const key = iso(d)
            const out = d.getMonth() !== month.getMonth()
            const weekend = d.getDay() === 0 || d.getDay() === 6
            const evs = data.events.filter(e => e.date === key).sort((a, b) => a.start - b.start)
            const flags = milestones(key)
            const more = evs.length - 3
            return (
              <div
                key={key}
                data-day={key}
                role="gridcell"
                tabIndex={key === selected ? 0 : -1}
                aria-selected={key === selected}
                aria-label={`${WEEKDAYS_LONG[d.getDay()]} ${MONTHS_LONG[d.getMonth()]} ${d.getDate()}, ${evs.length} events`}
                className={`cal-day ${out ? 'is-out' : ''} ${weekend ? 'is-weekend' : ''} ${key === today ? 'is-today' : ''}`}
                style={{ animationDelay: `${60 + i * 7}ms` }}
                onClick={() => onSelect(key)}
                onDoubleClick={() => openModal({ kind: 'event', preset: { date: key } })}
                onKeyDown={e => {
                  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]
                  if (step) { e.preventDefault(); onSelect(iso(addDays(d, step))); requestAnimationFrame(() => gridRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus()) }
                  if (e.key === 'Enter') openModal({ kind: 'event', preset: { date: key } })
                }}
              >
                <div className="cal-day__top">
                  <span className="cal-day__n">{d.getDate()}</span>
                  {more > 0 && <span className="cal-more">+{more}<span className="cal-more__w"> more</span></span>}
                  {flags.slice(0, 2).map(({ p, m }) => (
                    <span key={p.id + m.id} className="cal-flag" data-hue={p.hue} title={`${p.name}: ${m.title}`}><Icon name="flag" /></span>
                  ))}
                </div>
                <div className="cal-day__evs">
                  {evs.slice(0, 3).map(e => (
                    <button
                      key={e.id}
                      className={`cal-ev ${isPast(e) ? 'is-past' : ''}`}
                      data-hue={e.hue}
                      onClick={ev => { ev.stopPropagation(); onSelect(key); openDrawer({ kind: 'event', id: e.id }) }}
                      title={`${fmtTime(e.start)} ${e.title}`}
                    >
                      <span>{e.title}</span>
                    </button>
                  ))}
                </div>
                {evs.length > 0 && (
                  <span className="cal-day__dots" aria-hidden="true">
                    {evs.slice(0, 4).map(e => <i key={e.id} data-hue={e.hue} />)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
        <span className="cal-ring" style={ring} aria-hidden="true" />
      </div>
    </section>
  )
}

/* ---------------- Day agenda ---------------- */

function Agenda({ date }: { date: string }) {
  const { data, person, project, openDrawer, openModal, toggleDone } = useStore()
  const milestones = useMilestones()
  const evs = data.events.filter(e => e.date === date).sort((a, b) => a.start - b.start)
  const isToday = date === todayIso()
  const d = parse(date)
  const now = nowMinutes()
  const due = data.tasks
    .filter(t => (isToday ? (t.status !== 'done' && t.due <= date) || t.doneAt === date : t.status !== 'done' && t.due === date))
    .sort((a, b) => (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0) || sortByDue(a, b))
  const nowAt = isToday ? evs.findIndex(e => e.start > now) : -2
  const ms = milestones(date)

  const nowLine = <li className="cal-tl__now" key="now"><i /><span>{fmtTime(now)}</span></li>

  return (
    <aside className="card glass rise cal-agenda" style={{ ['--i' as string]: 2 }} key={date}>
      <div className="card__head">
        <div>
          <h2 className="card__title">{isToday ? 'Today' : WEEKDAYS_LONG[d.getDay()]}</h2>
          <p>{MONTHS_LONG[d.getMonth()]} {d.getDate()} · {evs.length} event{evs.length === 1 ? '' : 's'}</p>
        </div>
        <button className="btn btn--glass btn--sm" onClick={() => openModal({ kind: 'event', preset: { date } })}><Icon name="plus" /> Add event</button>
      </div>
      <div className="cal-ag">
        {ms.map(({ p, m }) => <Milestone key={p.id + m.id} p={p} title={m.title} done={m.done} />)}

        {evs.length === 0 ? (
          <div className="cal-free">
            <p className="cal-none">Nothing scheduled. A good day for deep work.</p>
          </div>
        ) : (
          <ol className="cal-tl">
            {evs.flatMap((e, i) => {
              const live = isToday && e.start <= now && now < e.start + e.dur
              const ppl = e.people.map(person)
              const item = (
                <li key={e.id} className={`cal-tl__item ${isPast(e) ? 'is-past' : ''}`} data-hue={e.hue} style={{ animationDelay: `${120 + i * 50}ms` }}>
                  <button className="cal-tl__btn" onClick={() => openDrawer({ kind: 'event', id: e.id })}>
                    <span className="cal-tl__time"><b>{fmtTime(e.start)}</b><small>{fmtDur(e.dur)}</small></span>
                    <span className="cal-tl__rail" />
                    <span className="cal-tl__body">
                      <span className="cal-tl__title">{e.title}</span>
                      {e.kind !== 'focus' && <span className="cal-tl__meta"><Icon name={e.where === 'Video call' ? 'video' : 'pin'} /> {e.where}</span>}
                      <span className="cal-tl__foot">
                        {ppl.length > 1 ? <Stack people={ppl} size={24} max={4} /> : <Avatar p={ppl[0]} size={24} />}
                        {live && <span className="cal-live">Now</span>}
                        <span className="cal-kind" data-hue={e.hue}><Icon name={KIND[e.kind].icon} /> {KIND[e.kind].label}</span>
                      </span>
                    </span>
                  </button>
                </li>
              )
              return i === nowAt ? [nowLine, item] : [item]
            })}
            {isToday && nowAt === -1 && nowLine}
          </ol>
        )}

        {(isToday || due.length > 0) && <div className="cal-due">
          <h3 className="cal-due__h">{isToday ? 'Due today' : 'Due'} <span className="badge num">{due.length}</span></h3>
          {due.length === 0 && <p className="cal-none">Nothing due.</p>}
          <ul>
            {due.slice(0, 5).map(t => {
              const p = project(t.project)
              return (
                <li key={t.id} className={`cal-task ${t.status === 'done' ? 'is-done' : ''}`}>
                  <Check on={t.status === 'done'} onToggle={() => toggleDone(t.id)} label={`Complete ${t.title}`} />
                  <button className="cal-task__t" onClick={() => openDrawer({ kind: 'task', id: t.id })}>
                    <span>{t.title}</span>
                    <small><i data-hue={p.hue} /> {p.name}</small>
                  </button>
                </li>
              )
            })}
          </ul>
          {due.length > 5 && <a className="btn btn--ghost btn--sm cal-due__all" href="#/tasks">{due.length - 5} more in Tasks</a>}
        </div>}
      </div>
    </aside>
  )
}

function Milestone({ p, title, done }: { p: Project; title: string; done: boolean }) {
  return (
    <button className="cal-ms" data-hue={p.hue as Hue} onClick={() => go(`projects/${p.id}`)}>
      <Icon name={done ? 'check' : 'flag'} />
      <span><b>{title}</b><small>{p.name} · milestone{done ? ' reached' : ''}</small></span>
    </button>
  )
}

/* ---------------- Week ---------------- */

function Week({ start }: { start: Date }) {
  const { data, openDrawer, openModal } = useStore()
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const today = todayIso()
  const now = nowMinutes()
  const evs = data.events.filter(e => e.date >= iso(days[0]) && e.date <= iso(days[6]))
  const end = days[6]
  const range = `${MON3[start.getMonth()]} ${start.getDate()} – ${start.getMonth() === end.getMonth() ? '' : MON3[end.getMonth()] + ' '}${end.getDate()}`
  const hours = Array.from({ length: HOURS }, (_, i) => H0 + i)

  const onSlot = (e: React.MouseEvent<HTMLDivElement>, day: string) => {
    const r = e.currentTarget.getBoundingClientRect()
    const hh = r.height / HOURS
    const half = Math.floor(((e.clientY - r.top) / hh) * 2) / 2
    openModal({ kind: 'event', preset: { date: day, start: Math.min((H0 + HOURS - 1) * 60, (H0 + half) * 60) } })
  }

  return (
    <section className="card glass rise cal-weekcard" style={{ ['--i' as string]: 1 }}>
      <div className="card__head">
        <div><h2>{range}</h2><p>{evs.length} event{evs.length === 1 ? '' : 's'}</p></div>
        <span className="cal-hint">Click an empty slot to add</span>
      </div>
      <div className="cal-wk__scroll">
        <div className="cal-wk">
          <div className="cal-wk__head">
            <span />
            {days.map(d => (
              <span key={iso(d)} className={`cal-wk__day ${iso(d) === today ? 'is-today' : ''}`}>
                <small>{DOW[(d.getDay() + 6) % 7]}</small><b>{d.getDate()}</b>
              </span>
            ))}
          </div>
          <div className="cal-wk__body">
            <div className="cal-wk__hours" aria-hidden="true">
              {hours.map((h, i) => <span key={h} style={{ top: `calc(var(--hh) * ${i})` }}>{fmtHourLabel(h)}</span>)}
            </div>
            {days.map(d => {
              const k = iso(d)
              const weekend = d.getDay() === 0 || d.getDay() === 6
              return (
                <div key={k} className={`cal-wk__col ${k === today ? 'is-today' : ''} ${weekend ? 'is-weekend' : ''}`} onClick={e => onSlot(e, k)}>
                  {evs.filter(e => e.date === k).map((e, i) => {
                    const top = (e.start - H0 * 60) / 60
                    const h = e.dur / 60
                    const short = e.dur < 45
                    return (
                      <button
                        key={e.id}
                        className={`cal-blk ${short ? 'is-short' : ''} ${isPast(e) ? 'is-past' : ''}`}
                        data-hue={e.hue}
                        style={{ top: `calc(var(--hh) * ${top})`, height: `max(22px, calc(var(--hh) * ${h}))`, animationDelay: `${100 + i * 40}ms` }}
                        onClick={ev => { ev.stopPropagation(); openDrawer({ kind: 'event', id: e.id }) }}
                      >
                        <b>{e.title}</b>
                        <small>{fmtTime(e.start)}{short ? '' : ` · ${e.where}`}</small>
                      </button>
                    )
                  })}
                  {k === today && now >= H0 * 60 && now <= (H0 + HOURS) * 60 && (
                    <div className="cal-now" style={{ top: `calc(var(--hh) * ${(now - H0 * 60) / 60})` }} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
