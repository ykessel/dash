import { useMemo, useState } from 'react'
import { Bars, Donut, LineChart } from '../components/Charts'
import { Icon } from '../components/Icon'
import { Avatar, CountUp, ProjectTag, Seg } from '../components/ui'
import { short } from '../lib/date'
import { dayLabels, focusHours, pct, sum, throughput, throughputPrev } from '../lib/metrics'
import { downloadCsv } from '../lib/csv'
import { useStore } from '../store'

type Range = '7' | '30' | '90'

export function Insights() {
  const { data, person, project, openDrawer, notify } = useStore()
  const [range, setRange] = useState<Range>('30')
  const [table, setTable] = useState(false)
  const n = Number(range)

  const m = useMemo(() => {
    const cur = throughput(n)
    const prev = throughputPrev(n)
    const labels = dayLabels(n)
    const focus = focusHours(n)
    const prevFocus = focusHours(n * 2).slice(0, n)
    const total = sum(cur)
    const late = Math.max(1, Math.round(total * 0.037))
    return { cur, prev, labels, focus, prevFocus, total, prevTotal: sum(prev), late }
  }, [n])

  const onTime = Math.round(((m.total - m.late) / Math.max(1, m.total)) * 100)
  const focusTotal = sum(m.focus)

  // Share of finished work per project, scaled to the period's total.
  const byProject = useMemo(() => {
    const weights: Record<string, number> = { orbit: 21, sprout: 21, tide: 20, facet: 20, north: 17, q4: 1 }
    const ps = data.projects.filter(p => (weights[p.id] ?? 3) > 0)
    const wsum = ps.reduce((s, p) => s + (weights[p.id] ?? 3), 0)
    let left = m.total
    return ps
      .map((p, i) => {
        const v = i === ps.length - 1 ? left : Math.round((m.total * (weights[p.id] ?? 3)) / wsum)
        left -= v
        return { p, v }
      })
      .filter(x => x.v > 0)
      .sort((a, b) => b.v - a.v)
  }, [data.projects, m.total])

  const workload = data.people
    .map(p => ({ p, h: data.tasks.filter(t => t.assignee === p.id && t.status !== 'done').reduce((s, t) => s + t.estimate, 0) }))
    .sort((a, b) => b.h / b.p.capacity - a.h / a.p.capacity)
  const over = workload.filter(w => w.h > w.p.capacity).length

  const slow = data.tasks
    .filter(t => t.status !== 'done')
    .map((t, i) => ({ t, age: 8 + ((t.title.length * 13 + i * 7) % 43) }))
    .sort((a, b) => b.age - a.age)
    .slice(0, 3)

  const exportCsv = () => {
    downloadCsv(`pane-insights-${range}d.csv`, [
      ['date', 'finished', 'previous_period', 'focus_hours'],
      ...m.labels.map((d, i) => [d, m.cur[i], m.prev[i], m.focus[i]]),
    ])
    notify('Exported insights as CSV', 'ok')
  }

  const fmtLabel = (s: string) => short(s)
  const cycle = (4 + (n === 7 ? -0.6 : n === 90 ? 0.3 : 0)).toFixed(1)

  return (
    <>
      <header className="page-head">
        <h1>Insights</h1>
        <p>How the team worked over the last {n} days</p>
      </header>
      <div className="page-bar">
        <div className="stats">
          <div className="stat"><small>Completed</small><b><CountUp value={m.total} /></b><span className="delta delta--up">+{pct(m.total, m.prevTotal)}%</span></div>
          <div className="stat"><small>On-time rate</small><b><CountUp value={onTime} />%</b><span className="delta delta--down">−3 pts</span></div>
          <div className="stat"><small>Focus hours</small><b><CountUp value={focusTotal} /><i>h</i></b><span className="delta delta--up">+{Math.max(1, pct(focusTotal, sum(m.prevFocus)))}%</span></div>
          <div className="stat"><small>Avg cycle time</small><b>{cycle}d</b><span className="delta delta--down">+0.4d</span></div>
        </div>
        <div className="page-actions">
          <Seg value={range} onChange={setRange} options={[{ value: '7', label: '7D' }, { value: '30', label: '30D' }, { value: '90', label: '90D' }]} label="Range" />
          <button className="btn btn--glass" onClick={exportCsv}><Icon name="download" /> Export CSV</button>
        </div>
      </div>

      <div className="ins-grid">
        <section className="card glass rise ins-thr" style={{ ['--i' as string]: 0 }}>
          <div className="card__head">
            <div><h2>Throughput</h2><p>Tasks finished each day</p></div>
            <div className="card__tools">
              <button className={`btn btn--glass btn--sm ${table ? 'is-on' : ''}`} onClick={() => setTable(t => !t)} aria-pressed={table}><Icon name={table ? 'chart' : 'list'} /> {table ? 'Chart' : 'Table'}</button>
            </div>
          </div>
          <div className="ins-thr__top">
            <div className="big-line"><span className="big"><CountUp value={m.total} /></span> finished <span className="delta delta--up">+{pct(m.total, m.prevTotal)}% vs previous {n} days</span></div>
            <div className="legend">
              <span><i style={{ ['--c' as string]: 'var(--blue)' }} /> Last {n} days</span>
              <span><i className="dash" /> Previous {n} days</span>
            </div>
          </div>
          {table ? (
            <div className="ins-table">
              <table>
                <thead><tr><th>Day</th><th>Finished</th><th>Previous</th><th>Focus</th></tr></thead>
                <tbody>
                  {m.labels.map((d, i) => (
                    <tr key={d}><td>{short(d)}</td><td>{m.cur[i]}</td><td>{m.prev[i]}</td><td>{m.focus[i]}h</td></tr>
                  )).reverse()}
                </tbody>
              </table>
            </div>
          ) : (
            <LineChart
              key={range}
              height={290}
              labels={m.labels.map(fmtLabel)}
              yMax={10}
              series={[
                { name: 'Previous', values: m.prev, color: 'var(--text-3)', dashed: true },
                { name: 'Finished', values: m.cur, color: 'var(--blue)', area: true },
              ]}
              fmtTip={i => <>{m.cur[i]} finished<small>{fmtLabel(m.labels[i])} · prev {m.prev[i]}</small></>}
            />
          )}
        </section>

        <section className="card glass rise ins-proj" style={{ ['--i' as string]: 1 }}>
          <div className="card__head"><div><h2>By project</h2><p>Where the finished work went</p></div></div>
          <div className="ins-proj__donut">
            <Donut key={range} parts={byProject.map(x => ({ name: x.p.name, value: x.v, color: `var(--${x.p.hue})` }))} size={132} stroke={14}>
              <span className="donut-label"><b className="num">{m.total}</b><small>finished</small></span>
            </Donut>
          </div>
          <ul className="ins-proj__list">
            {byProject.map(x => (
              <li key={x.p.id}>
                <span className="sq" data-hue={x.p.hue} />
                <a href={`#/projects/${x.p.id}`}>{x.p.name}</a>
                <b className="num">{x.v}</b>
                <small className="num">{Math.round((x.v / m.total) * 100)}%</small>
              </li>
            ))}
          </ul>
        </section>

        <section className="card glass rise ins-focus" style={{ ['--i' as string]: 2 }}>
          <div className="card__head"><div><h2>Focus</h2><p>Team focus hours each day</p></div></div>
          <div className="big-line"><span className="big"><CountUp value={focusTotal} /></span> hours <span>about {(focusTotal / n).toFixed(1)}h a day</span></div>
          <Bars
            key={range}
            height={200}
            values={m.focus}
            labels={m.labels.map(fmtLabel)}
            yMax={20}
            color="var(--purple)"
            fmtTip={i => <>{m.focus[i]}h focus<small>{fmtLabel(m.labels[i])}</small></>}
          />
        </section>

        <section className="card glass rise ins-work" style={{ ['--i' as string]: 3 }}>
          <div className="card__head">
            <div><h2>Workload</h2><p>Open task hours against weekly capacity</p></div>
            <span className={`pill-note ${over ? 'is-warn' : ''}`}>{over ? `${over} over capacity` : 'All within capacity'}</span>
          </div>
          <div className="legend">
            <span><i style={{ ['--c' as string]: 'var(--blue)' }} /> Open work</span>
            <span><i className="bar" style={{ ['--c' as string]: 'var(--text)' }} /> Capacity</span>
            <span><i style={{ ['--c' as string]: 'var(--danger)' }} /> Over capacity</span>
          </div>
          <ul className="work-list">
            {workload.map(({ p, h }, i) => {
              const max = 40
              return (
                <li key={p.id} onClick={() => openDrawer({ kind: 'person', id: p.id })} style={{ ['--i' as string]: i }}>
                  <Avatar p={p} size={30} />
                  <div className="work-list__who"><b>{p.name}</b><small>{p.role}</small></div>
                  <div className="work-list__bar">
                    <i className={h > p.capacity ? 'is-over' : ''} style={{ width: `${Math.min(1, h / max) * 100}%` }} />
                    <span className="cap" style={{ left: `${(p.capacity / max) * 100}%` }} />
                  </div>
                  <span className="work-list__h num"><b>{h}h</b> / {p.capacity}h</span>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="card glass rise ins-ontime" style={{ ['--i' as string]: 4 }}>
          <div className="card__head"><div><h2>On time</h2><p>Tasks finished in the last {n} days</p></div></div>
          <div className="big-line"><span className="huge"><CountUp value={onTime} /><i>%</i></span> finished on or before the due day</div>
          <div className="ontime-bar">
            <i style={{ flex: m.total - m.late }} />
            <i className="late" style={{ flex: m.late }} />
          </div>
          <div className="legend" style={{ marginTop: 10 }}>
            <span><i className="sq" style={{ ['--c' as string]: 'var(--green)', borderRadius: '50%' }} /> <b style={{ color: 'var(--text)' }}>{m.total - m.late}</b> on time</span>
            <span><i className="sq" style={{ ['--c' as string]: 'var(--danger)', borderRadius: '50%' }} /> <b style={{ color: 'var(--text)' }}>{m.late}</b> late</span>
          </div>
          <div className="section-title" style={{ marginTop: 16 }}>Slowest open tasks</div>
          <ul className="slow-list">
            {slow.map(({ t, age }) => (
              <li key={t.id} onClick={() => openDrawer({ kind: 'task', id: t.id })}>
                <Avatar p={person(t.assignee)} size={30} />
                <div><b>{t.title}</b><span><ProjectTag p={project(t.project)} /> <small>{person(t.assignee).name.split(' ')[0]}</small></span></div>
                <span className="slow-list__age"><b>{age}d</b><small>open</small></span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  )
}
