import { useEffect, useState } from 'react'

export type RouteName = 'home' | 'tasks' | 'calendar' | 'projects' | 'insights' | 'team' | 'settings' | 'signin' | 'signup' | 'signedout'
export const AUTH_ROUTES: RouteName[] = ['signin', 'signup', 'signedout']

export interface Route {
  name: RouteName
  param?: string
}

const NAMES: RouteName[] = ['home', 'tasks', 'calendar', 'projects', 'insights', 'team', 'settings', 'signin', 'signup', 'signedout']

function read(): Route {
  const [name, param] = location.hash.replace(/^#\/?/, '').split('/')
  if (NAMES.includes(name as RouteName)) return { name: name as RouteName, param: param || undefined }
  return { name: 'home' }
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
