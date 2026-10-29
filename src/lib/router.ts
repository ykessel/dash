import { useEffect, useState } from 'react'

export type RouteName = 'home' | 'tasks' | 'calendar' | 'projects' | 'insights' | 'team' | 'settings' | 'signin' | 'signup' | 'signedout' | 'auth' | 'invite'
export const AUTH_ROUTES: RouteName[] = ['signin', 'signup', 'signedout', 'auth', 'invite']
/** Routes that finish a sign-in from a link; they stay put even when a session exists. */
export const LINK_ROUTES: RouteName[] = ['auth', 'invite']

export interface Route {
  name: RouteName
  param?: string
  /** `?a=b` after the path, e.g. `#/auth/magic?token=…`. */
  query: Record<string, string>
}

const NAMES: RouteName[] = ['home', 'tasks', 'calendar', 'projects', 'insights', 'team', 'settings', 'signin', 'signup', 'signedout', 'auth', 'invite']

function read(): Route {
  const [path, search = ''] = location.hash.replace(/^#\/?/, '').split('?')
  const [name, param] = path.split('/')
  const query = Object.fromEntries(new URLSearchParams(search))
  if (NAMES.includes(name as RouteName)) return { name: name as RouteName, param: param || undefined, query }
  return { name: 'home', query }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const on = () => setRoute(read())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

export function go(path: string) {
  location.hash = `#/${path}`
}
