import { useSyncExternalStore } from 'react'

/** Wide screens can shrink the sidebar to icons by hand. Per device, so it lives in localStorage only. */
const KEY = 'pane:side'
const subs = new Set<() => void>()

function read(): boolean {
  try { return localStorage.getItem(KEY) === 'compact' } catch { return false }
}

let compact = read()
apply()

function apply() {
  if (typeof document === 'undefined') return
  if (compact) document.documentElement.dataset.side = 'compact'
  else delete document.documentElement.dataset.side
}

export function setSideCompact(on: boolean) {
  compact = on
  try { localStorage.setItem(KEY, on ? 'compact' : 'full') } catch { /* stays for this tab */ }
  apply()
  subs.forEach(f => f())
}

export const toggleSide = () => setSideCompact(!compact)

export function useSideCompact(): boolean {
  return useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f) } }, () => compact)
}
