import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Person, Priority, Project } from '../data/types'
import { Icon } from './Icon'

/* ---------- Avatar: an illustrated portrait generated from the person id ---------- */

const SKIN = ['#f6d5c0', '#e9b897', '#c98e66', '#a76d48', '#7d4e32', '#5a3624']
const HAIR = ['#2b1d16', '#4a3020', '#1a1414', '#8a5a2b', '#d9b26a', '#3b2a22', '#b4502f']
const BG = [
  ['#a7c4ff', '#6c8df0'], ['#ffc4a8', '#ef8f6c'], ['#b9e6c9', '#5fbf8a'], ['#e4c6ff', '#a47cf0'],
  ['#ffd98a', '#f0a23c'], ['#a8e8ec', '#3cb7c2'], ['#ffc2d9', '#ec6e9e'],
]
const SHIRT = ['#2d3a5c', '#e7e3dc', '#5b6cff', '#1f2933', '#c2502f', '#3f8f6b', '#7c4dcc']

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

export function Face({ id, skin }: { id: string; skin: number }) {
  const h = hash(id)
  const bg = BG[h % BG.length]
  const hair = HAIR[(h >> 3) % HAIR.length]
  const shirt = SHIRT[(h >> 6) % SHIRT.length]
  const style = (h >> 9) % 4
  const gid = `g${h.toString(36)}`
  return (
    <svg className="av__face" viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={bg[0]} />
          <stop offset="1" stopColor={bg[1]} />
        </linearGradient>
      </defs>
      <rect width="40" height="40" fill={`url(#${gid})`} />
      {style === 1 && <path d="M9 20c0-9 5-13 11-13s11 4 11 13v14H9z" fill={hair} />}
      <path d="M6 40c1.5-7.5 7-11 14-11s12.5 3.5 14 11z" fill={shirt} />
      <rect x="17" y="22" width="6" height="8" rx="3" fill={SKIN[skin % SKIN.length]} />
      <ellipse cx="20" cy="17.5" rx="7.2" ry="8.2" fill={SKIN[skin % SKIN.length]} />
      {style === 0 && <path d="M12.6 16c0-5.5 3.4-8.4 7.4-8.4s7.4 2.9 7.4 8.4c-1.6-2.6-4.4-4-7.4-4s-5.8 1.4-7.4 4z" fill={hair} />}
      {style === 1 && <path d="M12.8 15.5c.4-5 3.4-7.5 7.2-7.5s6.8 2.5 7.2 7.5c-2.2-2.8-5-3.7-7.2-3.7s-5 .9-7.2 3.7z" fill={hair} />}
      {style === 2 && <path d="M12.8 14.5c.8-4.2 3.6-6.3 7.2-6.3s6.4 2.1 7.2 6.3c-2.4-1.3-4.8-1.8-7.2-1.8s-4.8.5-7.2 1.8z" fill={hair} />}
      {style === 3 && <path d="M12.4 17c-.6-6.4 3.3-9.6 7.6-9.6 4.6 0 8.4 3.2 7.6 9.6-.8-3.6-3-5.4-5-5.8-1.6 1.6-6 3-10.2 5.8z" fill={hair} />}
    </svg>
  )
}

export function Avatar({ p, size = 32, presence = false }: { p: Person; size?: number; presence?: boolean }) {
  return (
    <span className="av" style={{ ['--s' as string]: `${size}px` }} data-presence={p.presence} title={p.name}>
      <Face id={p.id} skin={p.skin} />
      {presence && <span className="av__dot" />}
    </span>
  )
}

export function Stack({ people, size = 26, max = 4 }: { people: Person[]; size?: number; max?: number }) {
  const shown = people.slice(0, max)
  const more = people.length - shown.length
  return (
    <span className="stack" style={{ ['--s' as string]: `${size}px` }}>
      {shown.map(p => <Avatar key={p.id} p={p} size={size} />)}
      {more > 0 && <span className="stack__more">+{more}</span>}
    </span>
  )
}

/* ---------- Segmented control with a sliding lens ---------- */

export function Seg<T extends string>({
  value, options, onChange, size, label, block,
}: {
  value: T
  options: { value: T; label: ReactNode; icon?: string }[]
  onChange: (v: T) => void
  size?: 'sm'
  label?: string
  /** Stretch to the full width, with equal buttons. */
  block?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [lens, setLens] = useState<{ x: number; w: number } | null>(null)

  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    const measure = () => {
      const el = root.querySelector<HTMLElement>('[aria-pressed="true"]')
      if (el) setLens({ x: el.offsetLeft, w: el.offsetWidth })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(root)
    return () => ro.disconnect()
  }, [value, options.length])

  return (
    <div className={`seg ${size ? `seg--${size}` : ''} ${block ? 'seg--block' : ''}`} ref={ref} role="group" aria-label={label}>
      {lens && <span className="seg__lens" style={{ width: lens.w, transform: `translateX(${lens.x}px)` }} />}
      {options.map(o => (
        <button key={o.value} type="button" className="seg__btn" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.icon && <Icon name={o.icon} />}
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ---------- Small atoms ---------- */

export function ProjectTag({ p, onClick }: { p: Project; onClick?: () => void }) {
  return (
    <span className="tag" data-hue={p.hue} onClick={onClick} role={onClick ? 'link' : undefined}>
      <span>{p.name}</span>
    </span>
  )
}

const PRIO_LABEL: Record<Priority, string> = { urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low' }
export function Prio({ v, hideLow = false }: { v: Priority; hideLow?: boolean }) {
  if (hideLow && (v === 'low' || v === 'medium')) return null
  return (
    <span className={`prio prio--${v}`}>
      {v === 'urgent' && <Icon name="flag" />}
      {PRIO_LABEL[v]}
    </span>
  )
}

export function Check({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  // Pop only when the box becomes checked, not when an already-checked box mounts.
  const ref = useRef<HTMLButtonElement>(null)
  const was = useRef(on)
  useEffect(() => {
    if (on && !was.current && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      ref.current?.animate(
        [{ transform: 'scale(.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }],
        { duration: 600, easing: 'cubic-bezier(.3, 1.9, .5, 1)' },
      )
    }
    was.current = on
  }, [on])
  return (
    <button
      ref={ref}
      type="button"
      className="check"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      onClick={e => { e.stopPropagation(); onToggle() }}
    />
  )
}

export function Switch({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return <button type="button" className="switch" role="switch" aria-checked={on} aria-label={label} onClick={onToggle} />
}

export function Bar({ value, hue }: { value: number; hue?: string }) {
  const [w, setW] = useState(0)
  useEffect(() => {
    const r = requestAnimationFrame(() => setW(value))
    return () => cancelAnimationFrame(r)
  }, [value])
  return (
    <div className="bar" data-hue={hue}>
      <i style={{ width: `${Math.max(0, Math.min(1, w)) * 100}%` }} />
    </div>
  )
}

/** A progress ring whose arc draws itself in on mount. */
export function Ring({
  value, size = 64, stroke = 6, color = 'var(--accent)', track = 'var(--fill-2)', children, delay = 0,
}: {
  value: number
  size?: number
  stroke?: number
  color?: string
  track?: string
  children?: ReactNode
  delay?: number
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const [v, setV] = useState(0)
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), 60 + delay)
    return () => window.clearTimeout(t)
  }, [value, delay])
  return (
    <span className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0.001, Math.min(1, v)))}
          style={{ transition: 'stroke-dashoffset 1.2s var(--ease)' }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {children && <span className="ring__in">{children}</span>}
    </span>
  )
}

/** Animated number that counts up from 0 (or the previous value). */
export function CountUp({ value, decimals = 0, duration = 900 }: { value: number; decimals?: number; duration?: number }) {
  const [v, setV] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    const start = performance.now()
    const a = from.current
    let raf = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / duration)
      const e = 1 - Math.pow(1 - k, 3)
      setV(a + (value - a) * e)
      if (k < 1) raf = requestAnimationFrame(tick)
      else from.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return <>{v.toFixed(decimals)}</>
}

export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="stat">
      <small>{label}</small>
      <b>{children}</b>
    </div>
  )
}

export function PageHead({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-head">
      {children}
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
    </header>
  )
}

/** Fixed-position popover anchored to a button. Closes on outside click / Escape. */
export function Popover({
  anchor, onClose, children, align = 'right', className = '', placement = 'below', matchWidth = false,
}: {
  anchor: HTMLElement | null
  onClose: () => void
  children: ReactNode
  align?: 'left' | 'right'
  className?: string
  placement?: 'below' | 'above'
  /** Make the menu exactly as wide as the button that opened it. */
  matchWidth?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<React.CSSProperties>({ visibility: 'hidden' })

  useLayoutEffect(() => {
    if (!anchor) return
    const r = anchor.getBoundingClientRect()
    const s: React.CSSProperties = {}
    if (placement === 'below') s.top = r.bottom + 8
    else s.bottom = window.innerHeight - r.top + 8
    if (align === 'right') s.right = Math.max(8, window.innerWidth - r.right)
    else s.left = Math.max(8, r.left)
    if (matchWidth && r.width >= 200) { s.width = r.width; s.minWidth = 0 }
    ;(s as Record<string, string>)['--origin'] = `${placement === 'below' ? 'top' : 'bottom'} ${align}`
    setPos(s)
  }, [anchor, align, placement, matchWidth])

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || anchor?.contains(t)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [anchor, onClose])

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button, a, input')?.focus({ preventScroll: true })
  }, [])

  // Rendered at the top of the page: inside another glass panel the frost
  // would only see that panel, and the menu would look see-through.
  return createPortal(
    <div ref={ref} className={`pop glass glass--thick ${className}`} style={pos} role="menu">
      {children}
    </div>,
    document.body,
  )
}

/** Hook: true when the viewport is phone-sized. */
export function usePhone() {
  const q = '(max-width: 760px)'
  const [m, setM] = useState(() => matchMedia(q).matches)
  useEffect(() => {
    const mq = matchMedia(q)
    const on = () => setM(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return m
}

/** Keeps an element mounted for its exit animation. */
export function usePresence<T>(value: T | null | false, ms = 220): [T | null, boolean] {
  const [shown, setShown] = useState<T | null>(value || null)
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    if (value) {
      setShown(value)
      setLeaving(false)
      return
    }
    if (!shown) return
    setLeaving(true)
    const t = window.setTimeout(() => { setShown(null); setLeaving(false) }, ms)
    return () => window.clearTimeout(t)
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  return [shown, leaving]
}

/** Re-render every `ms` milliseconds (for clocks and "in 20 min" labels). */
export function useTick(ms: number) {
  const [, set] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => set(x => x + 1), ms)
    return () => window.clearInterval(t)
  }, [ms])
}
