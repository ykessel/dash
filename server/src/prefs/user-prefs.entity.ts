import { Column, Entity, PrimaryColumn } from 'typeorm'

export const THEMES = ['light', 'dark', 'system'] as const
export const WALLS = ['ash', 'sand', 'sage', 'aurora', 'smoke', 'tide', 'bloom', 'ember', 'grove', 'dusk'] as const
export const ACCENTS = ['blue', 'purple', 'pink', 'orange', 'green', 'graphite'] as const
export const GLASS = ['clear', 'tinted'] as const

export interface Notify { mentions: boolean; due: boolean; meetings: boolean; digest: boolean; focus: boolean }
export interface Look {
  theme: (typeof THEMES)[number]
  wall: (typeof WALLS)[number]
  accent: (typeof ACCENTS)[number]
  glass: (typeof GLASS)[number]
  solid: boolean
}

/** The frontend's `Prefs`, plus `look` (theme, wallpaper, accent) so it follows me across devices. */
export interface PrefsView {
  notify: Notify
  session: number
  pause: number
  look: Look
}

export const DEFAULT_PREFS: PrefsView = {
  notify: { mentions: true, due: true, meetings: true, digest: false, focus: true },
  session: 25,
  pause: 5,
  look: { theme: 'dark', wall: 'ash', accent: 'blue', glass: 'tinted', solid: false },
}

/** Only what the person changed is stored; defaults fill the rest, so new defaults reach everyone. */
@Entity('user_prefs')
export class UserPrefs {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' }) userId: string
  @Column({ type: 'jsonb', default: {} }) notify: Partial<Notify>
  @Column({ name: 'session_min', type: 'int', nullable: true }) sessionMin: number | null
  @Column({ name: 'pause_min', type: 'int', nullable: true }) pauseMin: number | null
  @Column({ type: 'jsonb', default: {} }) look: Partial<Look>
}

export function toPrefsView(p: UserPrefs | null): PrefsView {
  return {
    notify: { ...DEFAULT_PREFS.notify, ...p?.notify },
    session: p?.sessionMin ?? DEFAULT_PREFS.session,
    pause: p?.pauseMin ?? DEFAULT_PREFS.pause,
    look: { ...DEFAULT_PREFS.look, ...p?.look },
  }
}
