import { useEffect } from 'react'
import { Finder } from './components/Finder'
import { Island } from './components/Island'
import { DrawerHost, ModalHost } from './components/Overlays'
import { Sidebar, TabBar, Toolbar } from './components/Shell'
import { Wallpaper } from './components/Wallpaper'
import { AUTH_ROUTES, go, LINK_ROUTES, useRoute, type RouteName } from './lib/router'
import { AuthPage } from './pages/Auth'
import { Calendar } from './pages/Calendar'
import { Home } from './pages/Home'
import { Insights } from './pages/Insights'
import { Timesheet } from './pages/Timesheet'
import { ProjectDetail } from './pages/ProjectDetail'
import { Projects } from './pages/Projects'
import { Settings } from './pages/Settings'
import { Tasks } from './pages/Tasks'
import { Team } from './pages/Team'
import { useStore } from './store'

const GO_KEYS: Record<string, RouteName> = { h: 'home', t: 'tasks', c: 'calendar', p: 'projects', i: 'insights', m: 'team', s: 'settings' }

export function App() {
  const route = useRoute()
  const { openModal, startFocus, setLook, modal, drawer, finder, signedIn, ready, loaded, loadError, retryLoad, signOut } = useStore()
  const isAuth = AUTH_ROUTES.includes(route.name)

  // Auth gate: signed-out visitors land on Sign in; signed-in users skip it (except link pages,
  // which finish on their own). An invite opened while signed out is accepted by sign-in itself.
  useEffect(() => {
    if (!ready) return
    // Read the hash itself: a redirect may already be on its way (e.g. to "signed out").
    const target = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0] as RouteName
    if (!signedIn && !AUTH_ROUTES.includes(target)) go('signin')
    else if (signedIn && isAuth && !LINK_ROUTES.includes(target)) go('home')
  }, [signedIn, isAuth, ready])

  // Scroll to top when the page changes.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [route.name, route.param])

  useEffect(() => {
    const t: Partial<Record<RouteName, string>> = { signin: 'Sign in', signup: 'Create account', signedout: 'Signed out', auth: 'Signing in', invite: 'Invite' }
    document.title = `${t[route.name] ?? route.name[0].toUpperCase() + route.name.slice(1)} · Pane`
  }, [route.name])

  // The light that follows the pointer across glass surfaces.
  useEffect(() => {
    let raf = 0
    let last: HTMLElement | null = null
    const on = (e: PointerEvent) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const el = (e.target as HTMLElement | null)?.closest?.('.glass') as HTMLElement | null
        if (last && last !== el) {
          last.style.removeProperty('--gx')
          last.style.removeProperty('--gy')
        }
        if (el) {
          const r = el.getBoundingClientRect()
          el.style.setProperty('--gx', `${e.clientX - r.left}px`)
          el.style.setProperty('--gy', `${e.clientY - r.top}px`)
        }
        last = el
      })
    }
    window.addEventListener('pointermove', on, { passive: true })
    return () => window.removeEventListener('pointermove', on)
  }, [])

  // Single-key shortcuts (ignored while typing or with an overlay open).
  useEffect(() => {
    let pendingG = 0
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (/INPUT|TEXTAREA|SELECT/.test(el.tagName) || el.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey || modal || drawer || finder || !signedIn) return
      const k = e.key.toLowerCase()
      if (Date.now() - pendingG < 900 && GO_KEYS[k]) { go(GO_KEYS[k]); pendingG = 0; return }
      if (k === 'g') { pendingG = Date.now(); return }
      if (k === 'n') openModal({ kind: 'task' })
      else if (k === 'e') openModal({ kind: 'event' })
      else if (k === 'f') startFocus()
      else if (k === 't') setLook({ theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' })
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [openModal, startFocus, setLook, modal, drawer, finder, signedIn])

  if (signedIn && !loaded && !isAuth && loadError) {
    return (
      <>
        <Wallpaper />
        <div className="boot boot--error" role="alert">
          <h1>Your workspace didn’t load</h1>
          <p>{loadError}</p>
          <div className="boot__actions">
            <button type="button" className="btn btn--primary" onClick={retryLoad}>Try again</button>
            <button type="button" className="btn btn--glass" onClick={signOut}>Sign out</button>
          </div>
        </div>
        <Island />
      </>
    )
  }

  if (!ready || (signedIn && !loaded && !isAuth)) {
    return (
      <>
        <Wallpaper />
        <div className="boot" role="status" aria-live="polite"><span className="spinner" aria-hidden="true" /><span className="sr-only">Loading your workspace…</span></div>
        <Island />
      </>
    )
  }

  if (isAuth || !signedIn) {
    return (
      <>
        <Wallpaper />
        {isAuth && <AuthPage route={route} />}
        <Island />
      </>
    )
  }

  let page
  switch (route.name) {
    case 'tasks': page = <Tasks />; break
    case 'calendar': page = <Calendar />; break
    case 'projects': page = route.param ? <ProjectDetail id={route.param} /> : <Projects />; break
    case 'insights': page = <Insights />; break
    case 'timesheet': page = <Timesheet />; break
    case 'team': page = <Team />; break
    case 'settings': page = <Settings />; break
    default: page = <Home />
  }

  return (
    <>
      <a className="skip" href="#main" onClick={e => { e.preventDefault(); document.getElementById('main')?.focus() }}>Skip to content</a>
      <Wallpaper />
      <div className="app">
        <Sidebar route={route} />
        <Toolbar route={route} />
        <main id="main" className="main" tabIndex={-1}>
          <section className="view" key={`${route.name}/${route.param ?? ''}`}>{page}</section>
        </main>
        <TabBar route={route} />
      </div>
      <Island />
      <Finder />
      <ModalHost />
      <DrawerHost />
    </>
  )
}
