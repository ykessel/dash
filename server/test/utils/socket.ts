import { io, type Socket } from 'socket.io-client'
import type { TestApp } from './app'

const open: Socket[] = []

/** Connects to `/realtime`; rejects with the server's refusal message (e.g. 'unauthorized'). */
export function connect(t: TestApp, token: string, clientId?: string): Promise<Socket> {
  const s = io(`${t.url}/realtime`, {
    auth: clientId ? { token, clientId } : { token },
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  })
  open.push(s)
  return new Promise((resolve, reject) => {
    s.once('connect', () => resolve(s))
    s.once('connect_error', e => { s.close(); reject(e) })
  })
}

/** Resolves with the next `name` payload, or fails after `ms`. */
export function nextEvent<T = any>(s: Socket, name: string, ms = 1000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { s.off(name, on); reject(new Error(`no ${name} within ${ms}ms`)) }, ms)
    const on = (payload: T) => { clearTimeout(timer); resolve(payload) }
    s.once(name, on)
  })
}

/** Fails if `name` arrives within `ms`. */
export function noEvent(s: Socket, name: string, ms = 300): Promise<void> {
  return new Promise((resolve, reject) => {
    const on = (payload: unknown) => { clearTimeout(timer); reject(new Error(`unexpected ${name}: ${JSON.stringify(payload)}`)) }
    const timer = setTimeout(() => { s.off(name, on); resolve() }, ms)
    s.once(name, on)
  })
}

/** Closes every socket opened with `connect`. Call in `afterEach`. */
export function closeSockets(): void {
  for (const s of open.splice(0)) s.close()
}

/** Resolves with the next `name` payload that matches `pred`, ignoring others; fails after `ms`. */
export function eventWhere<T = any>(s: Socket, name: string, pred: (p: T) => boolean, ms = 1000): Promise<T> {
  return new Promise((resolve, reject) => {
    const on = (payload: T) => {
      if (!pred(payload)) return
      clearTimeout(timer); s.off(name, on); resolve(payload)
    }
    const timer = setTimeout(() => { s.off(name, on); reject(new Error(`no matching ${name} within ${ms}ms`)) }, ms)
    s.on(name, on)
  })
}
