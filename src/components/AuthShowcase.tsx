import { useEffect, useState } from 'react'
import { people as SAMPLE } from '../data/seed'
import { useStore } from '../store'
import { Icon } from './Icon'
import { Avatar } from './ui'

/* The left panel of the sign-in screens: a product tour. A small app window
   in perspective rotates between Home, Tasks and Calendar while a matching
   island toast pops in; four feature cards sit below, the one the current
   screen shows is lit. Advances on its own; pauses on hover or focus. */

const SLIDES = [
  { name: 'Home', toast: { icon: 'check', tone: 'ok', text: 'Done: Approve Orbit press kit', undo: true }, feature: 3 },
  { name: 'Tasks', toast: { icon: 'board', tone: 'info', text: 'Moved to In review', undo: true }, feature: 0 },
  { name: 'Calendar', toast: { icon: 'calplus', tone: 'info', text: 'Design critique added · Thu 10 AM', undo: false }, feature: 2 },
] as const

const FEATURES = [
  { icon: 'board', hue: 'blue', title: 'A board you can feel', text: 'Pick up a card, tilt it across columns and drop it where it belongs.' },
  { icon: 'timer', hue: 'orange', title: 'Focus that stays out of the way', text: 'The island keeps the timer at the top while you work.' },
  { icon: 'calendar', hue: 'purple', title: 'Your day, with a now-line', text: 'Meetings, milestones and due tasks in one calendar.' },
  { icon: 'chart', hue: 'teal', title: 'Insights without a dashboard tax', text: 'Throughput, focus hours and workload, ready to export.' },
]

const NAV = ['Home', 'Tasks', 'Calendar', 'Projects', 'Insights']

export function AuthShowcase() {
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const n = SLIDES.length
  const go = (d: number) => setI(x => (x + d + n) % n)

  useEffect(() => {
    if (paused || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = window.setTimeout(() => go(1), 6000)
    return () => window.clearTimeout(t)
  }, [i, paused]) // eslint-disable-line react-hooks/exhaustive-deps

  const s = SLIDES[i]
  return (
    <aside
      className="auth-show"
      aria-label="About Pane"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="tour">
        <div className="tour__hero">
          <div className="tour__copy">
            <span className="tour__eyebrow">Your workspace, at a glance</span>
            <h2>Everything your team runs on, in one pane.</h2>
            <p>Pick up exactly where you left off: today’s meetings, the board, and the work that’s due.</p>
          </div>

          <div className="tour__window glass" aria-hidden="true">
            <div className="tour__chrome"><i /><i /><i /></div>
            <div className="tour__app">
              <nav className="tour__nav">
                {NAV.map(x => <span key={x} className={x === s.name ? 'is-on' : ''}>{x}</span>)}
              </nav>
              <div className="tour__screen" key={i}>
                {i === 0 && <HomeScreen />}
                {i === 1 && <TasksScreen />}
                {i === 2 && <CalendarScreen />}
              </div>
            </div>
          </div>

          <div className={`tour__toast tour__toast--${s.toast.tone}`} key={`t${i}`} aria-hidden="true">
            <span className="tour__toast-ico"><Icon name={s.toast.icon} size={15} /></span>
            {s.toast.text}
            {s.toast.undo && <span className="tour__undo">Undo</span>}
          </div>
        </div>

        <ul className="tour__features">
          {FEATURES.map((f, k) => (
            <li key={f.title} className={`tour__feature glass ${k === s.feature ? 'is-on' : ''}`} style={{ ['--i' as string]: k }}>
              <span className="picon tour__tile" data-hue={f.hue}><Icon name={f.icon} /></span>
              <div><b>{f.title}</b><p>{f.text}</p></div>
            </li>
          ))}
        </ul>

        <div className="tour__foot">
          <div className="tour__dots" role="tablist" aria-label="Tour screens">
            {SLIDES.map((x, k) => (
              <button key={x.name} role="tab" aria-selected={k === i} aria-label={x.name} className={k === i ? 'is-on' : ''} onClick={() => setI(k)}>
                {k === i && !paused && <i key={i} />}
              </button>
            ))}
            <span className="tour__count">{i + 1} of {n} · {s.name}</span>
          </div>
          <div className="tour__arrows">
            <button className="ibtn" aria-label="Previous screen" onClick={() => go(-1)}><Icon name="left" size={18} /></button>
            <button className="ibtn" aria-label="Next screen" onClick={() => go(1)}><Icon name="right" size={18} /></button>
          </div>
        </div>
      </div>
    </aside>
  )
}

/* ---- the three mini screens ---- */

function HomeScreen() {
  const { lastUser } = useStore()
  const first = (lastUser ?? SAMPLE[0]).name.split(' ')[0]
  return (
    <>
      <b className="tour__h">Good morning, {first}</b>
      <div className="tour__kpis">
        <div><small>Done today</small><b>2<i> / 8</i></b></div>
        <div><small>Focus</small><b>1.1h</b></div>
        <div><small>Overdue</small><b>0</b></div>
      </div>
      <div className="tour__duo">
        <div className="tour__next">
          <small>in 20 min</small>
          <b>Tide sync review</b>
          <span className="tour__bar"><i style={{ width: '40%' }} /></span>
        </div>
        <div className="tour__mine">
          <small>My tasks</small>
          <span className="is-done"><i />Share sprint notes</span>
          <span><i />Approve press kit</span>
          <span><i />Plan sprint goals</span>
        </div>
      </div>
      <div className="tour__bars">
        {[40, 70, 95, 12, 12, 12, 12].map((h, k) => <i key={k} style={{ height: `${h}%` }} className={k === 2 ? 'is-today' : k > 2 ? 'is-future' : ''} />)}
      </div>
    </>
  )
}

function TasksScreen() {
  const p = (id: string) => SAMPLE.find(x => x.id === id) ?? SAMPLE[0]
  const cols: { name: string; dot: string; cards: { t: string; hue: string; who: string; lifted?: boolean }[] }[] = [
    { name: 'To do', dot: 'todo', cards: [{ t: 'Moodboard round one', hue: 'orange', who: 'camila' }, { t: 'Media plan budget', hue: 'orange', who: 'ines' }] },
    { name: 'In progress', dot: 'progress', cards: [{ t: 'Creative brief draft', hue: 'orange', who: 'freya' }, { t: 'Settings search', hue: 'blue', who: 'haruto' }] },
    { name: 'In review', dot: 'review', cards: [{ t: 'Push permissions flow', hue: 'blue', who: 'kwame', lifted: true }, { t: 'Date picker', hue: 'pink', who: 'elise' }] },
  ]
  return (
    <>
      <b className="tour__h">Tasks</b>
      <div className="tour__board">
        {cols.map(c => (
          <div key={c.name} className="tour__col">
            <small><span className={`sdot sdot--${c.dot}`} /> {c.name}</small>
            {c.cards.map(card => (
              <div key={card.t} className={`tour__card ${card.lifted ? 'is-lifted' : ''}`}>
                <span className="tour__tag" data-hue={card.hue} />
                <b>{card.t}</b>
                <Avatar p={p(card.who)} size={16} />
              </div>
            ))}
            {c.name === 'In review' && <div className="tour__slot" />}
          </div>
        ))}
      </div>
    </>
  )
}

function CalendarScreen() {
  const evs = [
    { t: 'Stand-up', at: '9:30', hue: 'indigo', past: true },
    { t: 'Tide sync review', at: '11:00', hue: 'blue' },
    { t: 'Lunch & learn', at: '12:30', hue: 'pink' },
    { t: 'Deep work', at: '2:00', hue: 'purple' },
  ]
  return (
    <>
      <b className="tour__h">October 2026</b>
      <div className="tour__cal">
        <div className="tour__month">
          {Array.from({ length: 21 }, (_, k) => {
            const d = k + 12
            return <span key={k} className={d === 28 ? 'is-today' : ''}>{d}{[14, 16, 20, 23, 27, 28, 29, 30].includes(d) && <i />}</span>
          })}
        </div>
        <ol className="tour__agenda">
          {evs.map((e, k) => (
            <li key={e.t} data-hue={e.hue} className={e.past ? 'is-past' : ''}>
              {k === 1 && <span className="tour__now" />}
              <small>{e.at}</small><b>{e.t}</b>
            </li>
          ))}
        </ol>
      </div>
    </>
  )
}
