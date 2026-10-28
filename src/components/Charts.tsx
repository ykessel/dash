import { useEffect, useRef, useState } from 'react'

/** Catmull-Rom spline through the points, as an SVG path. */
export function smooth(pts: [number, number][], tension = 0.5, yMin = -Infinity, yMax = Infinity): string {
  if (pts.length < 2) return ''
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const t = tension / 3
    const clamp = (v: number) => Math.max(yMin, Math.min(yMax, v))
    const c1 = [p1[0] + (p2[0] - p0[0]) * t, clamp(p1[1] + (p2[1] - p0[1]) * t)]
    const c2 = [p2[0] - (p3[0] - p1[0]) * t, clamp(p2[1] - (p3[1] - p1[1]) * t)]
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }
  return d
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(600)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

export interface Series {
  name: string
  values: number[]
  color: string
  dashed?: boolean
  area?: boolean
}

export function LineChart({
  series, labels, height = 260, yMax, yTicks = 3, fmtY = (v: number) => String(v), fmtTip, xTicks = 8, curve = true,
}: {
  series: Series[]
  labels: string[]
  height?: number
  yMax?: number
  yTicks?: number
  fmtY?: (v: number) => string
  fmtTip?: (i: number) => React.ReactNode
  xTicks?: number
  curve?: boolean
}) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const padL = 34
  const padR = 8
  const padT = 10
  const padB = 26
  const n = labels.length
  const max = yMax ?? Math.max(1, ...series.flatMap(s => s.values))
  const x = (i: number) => padL + (i / Math.max(1, n - 1)) * (w - padL - padR)
  const y = (v: number) => padT + (1 - v / max) * (height - padT - padB)
  const step = Math.max(1, Math.round(n / xTicks))
  const gid = useRef(`lc${Math.random().toString(36).slice(2, 7)}`).current

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const i = Math.round(((e.clientX - r.left - padL) / (w - padL - padR)) * (n - 1))
    setHover(Math.max(0, Math.min(n - 1, i)))
  }

  return (
    <div className="chart" ref={ref} style={{ height }}>
      <svg width={w} height={height} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <defs>
          {series.filter(s => s.area).map((s, k) => (
            <linearGradient key={k} id={`${gid}${k}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={s.color} stopOpacity="0.32" />
              <stop offset="1" stopColor={s.color} stopOpacity="0.02" />
            </linearGradient>
          ))}
        </defs>
        {Array.from({ length: yTicks }, (_, k) => {
          const v = (max / (yTicks - 1)) * k
          return (
            <g key={k}>
              <line x1={padL} x2={w - padR} y1={y(v)} y2={y(v)} className="chart__grid" />
              <text x={padL - 8} y={y(v) + 4} textAnchor="end" className="chart__y">{fmtY(Math.round(v))}</text>
            </g>
          )
        })}
        {labels.map((l, i) => (i % step === 0 || i === n - 1) && (n - 1 - i >= step / 2 || i === n - 1) ? (
          <text key={i} x={x(i)} y={height - 6} textAnchor="middle" className="chart__x">{l}</text>
        ) : null)}
        {series.map((s, k) => {
          const pts = s.values.map((v, i) => [x(i), y(v)] as [number, number])
          const d = curve ? smooth(pts, 0.5, padT, y(0)) : `M${pts.map(p => p.join(',')).join(' L')}`
          const areaIdx = series.filter(z => z.area).indexOf(s)
          return (
            <g key={s.name}>
              {s.area && <path d={`${d} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#${gid}${areaIdx})`} className="chart__area" />}
              <path d={d} fill="none" stroke={s.color} strokeWidth={s.dashed ? 1.6 : 2.4} strokeDasharray={s.dashed ? '5 5' : undefined} strokeLinecap="round" className={s.dashed ? 'chart__line chart__line--dash' : 'chart__line'} pathLength={s.dashed ? undefined : 1} style={{ animationDelay: `${k * 120}ms` }} />
            </g>
          )
        })}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={height - padB} className="chart__cursor" />
            {series.map(s => <circle key={s.name} cx={x(hover)} cy={y(s.values[hover])} r={4.5} fill={s.color} stroke="var(--glass-solid)" strokeWidth={2} />)}
          </g>
        )}
      </svg>
      {hover !== null && (
        <span className="tip" style={{ left: x(hover), top: Math.min(...series.map(s => y(s.values[hover]))) }}>
          {fmtTip ? fmtTip(hover) : <>{series[0].values[hover]}<small>{labels[hover]}</small></>}
        </span>
      )}
    </div>
  )
}

export function Bars({
  values, labels, height = 200, color = 'var(--purple)', fmtTip, yMax, yTicks = 3, fmtY = (v: number) => `${v}h`, highlightLast = true,
}: {
  values: number[]
  labels: string[]
  height?: number
  color?: string
  fmtTip?: (i: number) => React.ReactNode
  yMax?: number
  yTicks?: number
  fmtY?: (v: number) => string
  highlightLast?: boolean
}) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const padL = 34
  const padB = 26
  const padT = 8
  const n = values.length
  const max = yMax ?? Math.max(1, ...values)
  const slot = (w - padL) / n
  const bw = Math.max(3, Math.min(22, slot * 0.62))
  const y = (v: number) => padT + (1 - v / max) * (height - padT - padB)
  const step = Math.max(1, Math.round(n / 7))
  return (
    <div className="chart" ref={ref} style={{ height }}>
      <svg width={w} height={height} onPointerLeave={() => setHover(null)}>
        {Array.from({ length: yTicks }, (_, k) => {
          const v = (max / (yTicks - 1)) * k
          return (
            <g key={k}>
              <line x1={padL} x2={w} y1={y(v)} y2={y(v)} className="chart__grid" />
              <text x={padL - 8} y={y(v) + 4} textAnchor="end" className="chart__y">{fmtY(Math.round(v))}</text>
            </g>
          )
        })}
        {values.map((v, i) => {
          const cx = padL + slot * i + slot / 2
          const h = Math.max(v > 0 ? 3 : 2, height - padB - y(v))
          return (
            <g key={i} onPointerEnter={() => setHover(i)}>
              <rect x={cx - slot / 2} y={0} width={slot} height={height} fill="transparent" />
              <rect
                x={cx - bw / 2} y={height - padB - h} width={bw} height={h} rx={Math.min(5, bw / 2)}
                fill={color}
                opacity={hover === null ? (highlightLast && i === n - 1 ? 1 : 0.72) : hover === i ? 1 : 0.45}
                className="chart__bar"
                style={{ animationDelay: `${i * 14}ms` }}
              />
            </g>
          )
        })}
        {labels.map((l, i) => (i % step === 0 && n - 1 - i >= step / 2) || i === n - 1 ? (
          <text key={i} x={padL + slot * i + slot / 2} y={height - 6} textAnchor="middle" className="chart__x">{l}</text>
        ) : null)}
      </svg>
      {hover !== null && (
        <span className="tip" style={{ left: padL + slot * hover + slot / 2, top: y(values[hover]) }}>
          {fmtTip ? fmtTip(hover) : values[hover]}
        </span>
      )}
    </div>
  )
}

export function Donut({ parts, size = 132, stroke = 14, children }: { parts: { value: number; color: string; name: string }[]; size?: number; stroke?: number; children?: React.ReactNode }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const gap = 4
  const [on, setOn] = useState(false)
  useEffect(() => { const t = setTimeout(() => setOn(true), 60); return () => clearTimeout(t) }, [])
  let acc = 0
  return (
    <span className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        {parts.map(p => {
          const len = (p.value / total) * c
          const seg = (
            <circle
              key={p.name}
              cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={`${on ? Math.max(0.1, len - gap - stroke * 0.0) : 0} ${c}`}
              strokeDashoffset={-acc}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              style={{ transition: 'stroke-dasharray 1.1s var(--ease)' }}
            >
              <title>{p.name}</title>
            </circle>
          )
          acc += len
          return seg
        })}
      </svg>
      <span className="ring__in">{children}</span>
    </span>
  )
}
