import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { Icon } from './Icon'

const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`

function MiniRing({ k, size }: { k: number; size: number }) {
  const r = size / 2 - 2.5
  const c = 2 * Math.PI * r
  return (
    <span className="island__ring">
      <svg width={size} height={size}>
        <circle className="trk" cx={size / 2} cy={size / 2} r={r} />
        <circle className="fil" cx={size / 2} cy={size / 2} r={r} strokeDasharray={c} strokeDashoffset={c * (1 - k)} />
      </svg>
    </span>
  )
}

/**
 * A black pill at the top of the screen that morphs between three shapes:
 * a compact timer, a notification, and the expanded focus controls.
 */
export function Island() {
  const { focus, note, pauseFocus, stopFocus, extendFocus } = useStore()
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!focus) setExpanded(false)
  }, [focus])

  // A new focus session opens expanded for a moment, then tucks itself away.
  const started = focus?.total
  useEffect(() => {
    if (!started) return
    setExpanded(true)
    const t = window.setTimeout(() => setExpanded(false), 3200)
    return () => window.clearTimeout(t)
  }, [started])

  const mode = note ? 'note' : focus ? (expanded ? 'full' : 'compact') : 'hidden'
  const k = focus ? 1 - focus.left / focus.total : 0

  return (
    <div className={`island ${focus?.paused ? 'is-paused' : ''}`} data-mode={mode} role="status" aria-live="polite">
      {mode === 'note' && note && (
        <div className="island__in island__note" key={note.id}>
          <span className={`island__ico island__ico--${note.tone}`}>
            <Icon name={note.tone === 'ok' ? 'check' : note.tone === 'warn' ? 'trash' : 'sparkle'} />
          </span>
          <span className="island__msg">{note.text}</span>
          {note.undo && (
            <button className="island__undo" onClick={note.undo}>Undo</button>
          )}
        </div>
      )}
      {mode === 'compact' && focus && (
        <button className="island__in island__compact" onClick={() => setExpanded(true)} aria-label="Focus timer — expand">
          <MiniRing k={k} size={24} />
          <span className="lbl">{focus.paused ? 'Paused' : 'Focus'}</span>
          <span className="island__time">{mmss(focus.left)}</span>
        </button>
      )}
      {mode === 'full' && focus && (
        <div className="island__in island__full" onMouseLeave={() => setExpanded(false)}>
          <div className="island__top">
            <MiniRing k={k} size={38} />
            <div className="island__what">
              <small>Focus session</small>
              <b>{focus.label}</b>
            </div>
            <span className="island__big">{mmss(focus.left)}</span>
          </div>
          <div className="island__ctrls">
            <button className="island__btn" onClick={() => extendFocus(5)}>+5 min</button>
            <button className="island__btn island__btn--round" onClick={pauseFocus} aria-label={focus.paused ? 'Resume' : 'Pause'}>
              <Icon name={focus.paused ? 'play' : 'pause'} />
            </button>
            <button className="island__btn island__btn--round island__btn--stop" onClick={stopFocus} aria-label="End session">
              <Icon name="stop" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
