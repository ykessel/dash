import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { AuthShowcase } from '../components/AuthShowcase'
import { BrandMark, Icon } from '../components/Icon'
import { Avatar, Seg } from '../components/ui'
import type { Person, Team } from '../data/types'
import { go, type Route, type RouteName } from '../lib/router'
import { useStore, type AuthResult } from '../store'

/* Sign-in, sign-up, signed-out and link screens, built from the app's glass,
   gel buttons, fields and motion, talking to the Pane API. */

export function AuthPage({ route: r }: { route: Route }) {
  const route = r.name
  return (
    <div className="auth">
      <AuthShowcase />
      <main className="auth__main" id="main">
        {route === 'signup' ? <SignUp />
          : route === 'signedout' ? <SignedOut />
          : route === 'auth' || route === 'invite' ? <LinkLanding route={route} step={r.param} query={r.query} />
          : <SignIn error={r.query.error} />}
      </main>
    </div>
  )
}

/* ---------------- Shared bits ---------------- */

function AuthCard({ children, shake }: { children: ReactNode; shake: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!shake || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    ref.current?.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-10px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(2px)' }, { transform: 'translateX(0)' }],
      { duration: 460, easing: 'cubic-bezier(.36, .07, .19, .97)' },
    )
  }, [shake])
  return <div ref={ref} className="auth-card glass glass--thick">{children}</div>
}

function Brand() {
  return (
    <a className="auth-brand" href="#/signin" aria-label="Pane">
      <span className="brand__mark"><BrandMark /></span>
      <span>Pane</span>
    </a>
  )
}

function Field({ label, error, hint, children, aside }: { label: string; error?: string; hint?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <label className={`field auth-field ${error ? 'is-invalid' : ''}`}>
      <span className="auth-field__label">{label}{aside}</span>
      {children}
      {error ? <small className="auth-field__err" role="alert">{error}</small> : hint ? <small className="auth-field__hint">{hint}</small> : null}
    </label>
  )
}

function PasswordInput({ value, onChange, autoComplete, invalid }: { value: string; onChange: (v: string) => void; autoComplete: string; invalid?: boolean }) {
  const [show, setShow] = useState(false)
  return (
    <span className="auth-pass">
      <input
        className="input"
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder="••••••••"
        aria-invalid={invalid}
      />
      <button type="button" className="ibtn auth-pass__eye" onClick={() => setShow(v => !v)} aria-label={show ? 'Hide password' : 'Show password'}>
        <Icon name={show ? 'eyeoff' : 'eye'} size={19} />
      </button>
    </span>
  )
}

function Submit({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button type="submit" className={`btn btn--primary auth-submit ${busy ? 'is-busy' : ''}`} disabled={busy}>
      {busy ? <span className="spinner" aria-hidden="true" /> : null}
      <span>{busy ? 'One moment…' : children}</span>
    </button>
  )
}

function Social({ onPick }: { onPick: (provider: 'google' | 'github') => void }) {
  return (
    <div className="auth-social">
      <button type="button" className="btn btn--glass" onClick={() => onPick('google')}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9.1L6.4 14Z"/><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.5L6.4 10C7.2 7.7 9.4 6 12 6Z"/></svg>
        Google
      </button>
      <button type="button" className="btn btn--glass" onClick={() => onPick('github')}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.4-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .8.1-.7.4-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.5 9.5 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.3 4.7-4.6 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10 10 0 0 0 12 2Z"/></svg>
        GitHub
      </button>
    </div>
  )
}

function Divider({ children }: { children: ReactNode }) {
  return <div className="auth-or"><span>{children}</span></div>
}

/* Busy while a request runs, so the button shows its spinner. */
function useSubmit() {
  const [busy, setBusy] = useState(false)
  const run = (work: () => void | Promise<void>) => {
    setBusy(true)
    Promise.resolve().then(work).finally(() => setBusy(false))
  }
  return [busy, run] as const
}

/* ---------------- Sign in ---------------- */

/** Messages for the `?error=` codes OAuth and expired links send back. */
const LINK_ERRORS: Record<string, string> = {
  oauth_failed: 'That sign-in didn’t finish. Try again.',
  oauth_email_unverified: 'Verify that email with the provider first, then try again.',
  email_unverified: 'Verify your email with Pane first, then link the provider.',
  provider_disabled: 'That sign-in option isn’t set up yet.',
}

function SignIn({ error }: { error?: string }) {
  const { signIn, signInWith, requestMagicLink, forgotPassword, notify, lastUser } = useStore()
  const [email, setEmail] = useState(lastUser?.email ?? '')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [err, setErr] = useState<Extract<AuthResult, { ok: false }> | null>(
    error ? { ok: false, field: 'email', error: LINK_ERRORS[error] ?? 'That sign-in didn’t finish. Try again.' } : null,
  )
  const [shake, setShake] = useState(0)
  const [busy, run] = useSubmit()

  const fail = (r: Extract<AuthResult, { ok: false }>) => { setErr(r); setShake(s => s + 1) }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    run(async () => {
      const r = await signIn(email, password, remember)
      if (!r.ok) return fail(r)
      notify('Welcome back', 'ok')
      go('home')
    })
  }

  const needEmail = () => {
    if (/^\S+@\S+\.\S+$/.test(email.trim())) return false
    fail({ ok: false, field: 'email', error: 'Enter your email first.' })
    return true
  }
  const forgot = () => {
    if (needEmail()) return
    run(async () => {
      const r = await forgotPassword(email)
      if (!r.ok) return fail(r)
      notify(`If ${email.trim()} has an account, a reset link is on its way`, 'ok')
    })
  }
  const magic = () => {
    if (needEmail()) return
    run(async () => {
      const r = await requestMagicLink(email)
      if (!r.ok) return fail(r)
      notify(`Sign-in link sent to ${email.trim()}`, 'ok')
    })
  }

  return (
    <AuthCard shake={shake}>
      <Brand />
      <header className="auth-head">
        <h1>Welcome back</h1>
        <p>Sign in to your team’s workspace.</p>
      </header>
      <Social onPick={signInWith} />
      <Divider>or with email</Divider>
      <form className="auth-form" onSubmit={submit} noValidate>
        <Field label="Email" error={err?.field === 'email' ? err.error : undefined}>
          <input
            className="input"
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setErr(null) }}
            autoComplete="username"
            placeholder="name@company.com"
            aria-invalid={err?.field === 'email'}
            autoFocus={!email}
          />
        </Field>
        <Field
          label="Password"
          error={err?.field === 'password' ? err.error : undefined}
          aside={<button type="button" className="link auth-forgot" onClick={forgot}>Forgot?</button>}
        >
          <PasswordInput value={password} onChange={v => { setPassword(v); setErr(null) }} autoComplete="current-password" invalid={err?.field === 'password'} />
        </Field>
        <label className="auth-check">
          <input type="checkbox" className="sr-only" checked={remember} onChange={e => setRemember(e.target.checked)} />
          <span className="check" aria-checked={remember} role="presentation" />
          Keep me signed in
        </label>
        <Submit busy={busy}>Sign in</Submit>
        <button type="button" className="btn btn--glass auth-submit" onClick={magic} disabled={busy}>Email me a sign-in link</button>
      </form>

      <p className="auth-foot">New to Pane? <a className="link" href="#/signup">Create an account</a></p>
    </AuthCard>
  )
}

/* ---------------- Sign up ---------------- */

function strength(pw: string) {
  let s = 0
  if (pw.length >= 8) s++
  if (pw.length >= 12) s++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++
  return Math.min(4, s)
}
const STRENGTH = ['Too short', 'Weak', 'Okay', 'Good', 'Strong']

function SignUp() {
  const { signUp, notify } = useStore()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [team, setTeam] = useState<Team>('Product')
  const [role, setRole] = useState('')
  const [terms, setTerms] = useState(false)
  const [err, setErr] = useState<{ field: string; error: string } | null>(null)
  const [shake, setShake] = useState(0)
  const [busy, run] = useSubmit()
  const st = strength(password)

  const fail = (field: string, error: string) => { setErr({ field, error }); setShake(s => s + 1) }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!terms) return fail('terms', 'Please accept the terms to continue.')
    run(async () => {
      const r = await signUp({ name, email, password, team, role })
      if (!r.ok) return fail(r.field, r.error)
      notify(`Welcome to Pane, ${name.trim().split(' ')[0]}! Check your email to confirm it.`, 'ok')
      go('home')
    })
  }
  const clear = () => setErr(null)

  return (
    <AuthCard shake={shake}>
      <Brand />
      <header className="auth-head">
        <h1>Create your account</h1>
        <p>Join your team’s workspace in under a minute.</p>
      </header>
      <form className="auth-form" onSubmit={submit} noValidate>
        <Field label="Full name" error={err?.field === 'name' ? err.error : undefined}>
          <input className="input" value={name} onChange={e => { setName(e.target.value); clear() }} autoComplete="name" placeholder="Alex Rivera" autoFocus aria-invalid={err?.field === 'name'} />
        </Field>
        <Field label="Work email" error={err?.field === 'email' ? err.error : undefined}>
          <input className="input" type="email" value={email} onChange={e => { setEmail(e.target.value); clear() }} autoComplete="email" placeholder="name@company.com" aria-invalid={err?.field === 'email'} />
        </Field>
        <Field
          label="Password"
          error={err?.field === 'password' ? err.error : undefined}
          hint={password ? <span className="auth-meter" data-level={st}><i /><i /><i /><i /><b>{STRENGTH[st]}</b></span> : 'At least 8 characters.'}
        >
          <PasswordInput value={password} onChange={v => { setPassword(v); clear() }} autoComplete="new-password" invalid={err?.field === 'password'} />
        </Field>
        <div className="field auth-field">
          <span className="auth-field__label">Team</span>
          <Seg block size="sm" value={team} onChange={setTeam} options={(['Product', 'Design', 'Engineering', 'Marketing'] as const).map(t => ({ value: t, label: t }))} label="Team" />
        </div>
        <Field label="Role" hint="Shown on your profile. Optional.">
          <input className="input" value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Product Designer" autoComplete="organization-title" />
        </Field>
        <label className={`auth-check ${err?.field === 'terms' ? 'is-invalid' : ''}`}>
          <input type="checkbox" className="sr-only" checked={terms} onChange={e => { setTerms(e.target.checked); clear() }} />
          <span className="check" aria-checked={terms} role="presentation" />
          <span>I agree to the <a className="link" href="#/signup" onClick={e => e.preventDefault()}>Terms</a> and <a className="link" href="#/signup" onClick={e => e.preventDefault()}>Privacy Policy</a></span>
        </label>
        {err?.field === 'terms' && <small className="auth-field__err" role="alert">{err.error}</small>}
        <Submit busy={busy}>Create account</Submit>
      </form>
      <p className="auth-foot">Already have an account? <a className="link" href="#/signin">Sign in</a></p>
    </AuthCard>
  )
}

/* ---------------- Signed out ---------------- */

function SignedOut() {
  const { lastUser } = useStore()
  const first = lastUser?.name.split(' ')[0]
  return (
    <AuthCard shake={0}>
      <Brand />
      <div className="auth-out">
        <span className="auth-out__av">
          {lastUser
            ? <Avatar p={{ id: lastUser.email, name: lastUser.name, skin: lastUser.skin, presence: 'away' } as Person} size={88} />
            : <Icon name="user" size={40} />}
          <span className="auth-out__badge"><Icon name="check" size={16} /></span>
        </span>
        <h1>You’re signed out</h1>
        <p>{first ? `See you soon, ${first}. Your workspace is just as you left it.` : 'Your workspace is just as you left it.'}</p>
      </div>
      <div className="auth-form">
        <a className="btn btn--primary auth-submit" href="#/signin">{first ? `Sign in as ${first}` : 'Sign in'}</a>
      </div>
      <p className="auth-foot">Want a fresh start? <a className="link" href="#/signup">Create an account</a></p>
    </AuthCard>
  )
}

/* ---------------- Links from email and OAuth ---------------- */

/**
 * Where links land: `#/auth/callback` (back from Google/GitHub), `#/auth/magic`, `#/auth/verify`,
 * `#/auth/reset` (asks for a new password) and `#/invite`.
 */
function LinkLanding({ route, step, query }: { route: RouteName; step?: string; query: Record<string, string> }) {
  const { completeSignIn, acceptInvite, signedIn, ready, notify } = useStore()
  const [err, setErr] = useState<string | null>(null)
  const started = useRef(false)
  const token = query.token ?? ''

  useEffect(() => {
    if (!ready || started.current || (route === 'auth' && step === 'reset')) return
    started.current = true
    const finish = (r: AuthResult, ok: string) => {
      if (!r.ok) return setErr(r.error)
      notify(ok, 'ok')
      go('home')
    }
    if (route === 'invite') {
      if (!signedIn) {
        // Remember the invite through sign-in; App sends us back here afterwards.
        try { sessionStorage.setItem('pane:invite', token) } catch { /* ignore */ }
        go('signin')
        return
      }
      acceptInvite(token).then(r => finish(r, 'You joined the team'))
    } else if (step === 'magic') completeSignIn({ magic: token }).then(r => finish(r, 'Signed in'))
    else if (step === 'verify') completeSignIn({ verify: token }).then(r => finish(r, 'Email confirmed'))
    else completeSignIn({}).then(r => finish(r, 'Signed in'))
  }, [ready, route, step, token, signedIn, acceptInvite, completeSignIn, notify])

  if (route === 'auth' && step === 'reset') return <ResetPassword token={token} />
  return (
    <AuthCard shake={0}>
      <Brand />
      <header className="auth-head">
        <h1>{err ? 'That link didn’t work' : 'One moment…'}</h1>
        <p>{err ?? 'Finishing up.'}</p>
      </header>
      {err && <a className="btn btn--primary auth-submit" href="#/signin">Back to sign in</a>}
    </AuthCard>
  )
}

function ResetPassword({ token }: { token: string }) {
  const { completeSignIn, notify } = useStore()
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [shake, setShake] = useState(0)
  const [busy, run] = useSubmit()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    run(async () => {
      const r = await completeSignIn({ reset: { token, password } })
      if (!r.ok) { setErr(r.error); setShake(s => s + 1); return }
      notify('Password changed', 'ok')
      go('home')
    })
  }
  return (
    <AuthCard shake={shake}>
      <Brand />
      <header className="auth-head">
        <h1>Choose a new password</h1>
        <p>You’ll be signed in right after.</p>
      </header>
      <form className="auth-form" onSubmit={submit} noValidate>
        <Field label="New password" error={err ?? undefined} hint="At least 8 characters.">
          <PasswordInput value={password} onChange={v => { setPassword(v); setErr(null) }} autoComplete="new-password" invalid={!!err} />
        </Field>
        <Submit busy={busy}>Save and sign in</Submit>
      </form>
    </AuthCard>
  )
}
