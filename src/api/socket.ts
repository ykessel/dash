import { io } from 'socket.io-client'
import { API_URL, clientId, getToken, refresh } from './client'

/**
 * Opens the live connection and hands every server event to `onEvent`. The handshake reads the
 * current access token each time, so a reconnect after a refresh uses the new one. A rejected
 * handshake refreshes once; if that fails too the socket stays closed (the API client signs out).
 * `onReconnect` runs after every reconnect (not the first connect), so the caller can catch up.
 * Returns a function that closes it.
 */
export function connectLive(onEvent: (type: string, payload: Record<string, unknown>) => void, onReconnect?: () => void): () => void {
  const socket = io(`${API_URL}/realtime`, {
    auth: cb => cb({ token: getToken() ?? '', clientId }),
    transports: ['websocket'],
  })
  let retried = false
  let connectedOnce = false
  socket.on('connect', () => {
    retried = false
    if (connectedOnce) onReconnect?.()
    connectedOnce = true
  })
  socket.on('connect_error', async () => {
    if (retried || socket.active) return
    retried = true
    if (await refresh()) socket.connect()
  })
  socket.onAny((type: string, payload: Record<string, unknown>) => onEvent(type, payload ?? {}))
  return () => { socket.close() }
}
