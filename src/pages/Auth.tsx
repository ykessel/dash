import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { AuthShowcase } from '../components/AuthShowcase'
import { BrandMark, Icon } from '../components/Icon'
import { Avatar, Seg } from '../components/ui'
import type { Team } from '../data/types'
import { go, type RouteName } from '../lib/router'
import { DEMO_PASSWORD, useStore, type AuthResult } from '../store'

/* Mock sign-in, sign-up and signed-out screens, built from the app's glass,
   gel buttons, fields and motion. Nothing leaves the browser. */

export function AuthPage({ route }: { route: RouteName }) {
  return (
    <div className="auth">
      <AuthShowcase />
      <main className="auth__main" id="main">
        {route === 'signup' ? <SignUp /> : route === 'signedout' ? <SignedOut /> : <SignIn />}
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

function Social({ onPick }: { onPick: (provider: string) => void }) {
  return (
    <div className="auth-social">
      <button type="button" className="btn btn--glass" onClick={() => onPick('Google')}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9.1L6.4 14Z"/><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.5L6.4 10C7.2 7.7 9.4 6 12 6Z"/></svg>
        Google
      </button>
      <button type="button" className="btn btn--glass" onClick={() => onPick('Apple')}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d="M16.4 12.6c0-2.4 2-3.6 2.1-3.7a4.6 4.6 0 0 0-3.6-2c-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.3-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.8 1.2 1.8 2.6 3.1 2.6 1.2-.1 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.4a10 10 0 0 0 1.4-2.8 4.3 4.3 0 0 1-2.4-4.5ZM14 5.3c.7-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1 .1 2.1-.6 2.8-1.4Z"/></svg>
        Apple
      </button>
    </div>
  )
}

function Divider({ children }: { children: ReactNode }) {
  return <div className="auth-or"><span>{children}</span></div>
}

/* Short fake delay so the button can show its busy state, like a real request. */
function useSubmit() {
  const [busy, setBusy] = useState(false)
  const run = (work: () => void, ms = 750) => {
    setBusy(true)
    window.setTimeout(() => { setBusy(false); work() }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms)
  }
  return [busy, run] as const
}

/* ---------------- Sign in ---------------- */

function SignIn() {
  const { data, signIn, signInAs, notify, lastUser } = useStore()
  const [email, setEmail] = useState(lastUser?.email ?? '')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [err, setErr] = useState<Extract<AuthResult, { ok: false }> | null>(null)
  const [shake, setShake] = useState(0)
  const [busy, run] = useSubmit()
  const demo = ['lin', 'nia', 'kwame', 'ines'].map(id => data.people.find(p => p.id === id)).filter(Boolean) as typeof data.people

  const submit = (e: FormEvent) => {
    e.preventDefault()
    run(() => {
      const r = signIn(email, password, remember)
      if (r.ok) {
        const name = data.people.find(p => p.email.toLowerCase() === email.trim().toLowerCase())?.name.split(' ')[0]
        notify(`Welcome back, ${name}`, 'ok')
        go('home')
      } else {
        setErr(r)
        setShake(s => s + 1)
      }
    })
  }

  const social = (provider: string) => run(() => {
    signInAs(lastUser?.id ?? 'lin')
    notify(`Signed in with ${provider}`, 'ok')
    go('home')
  }, 900)

  return (
    <AuthCard shake={shake}>
      <Brand />
      <header className="auth-head">
        <h1>Welcome back</h1>
        <p>Sign in to your team’s workspace.</p>
      </header>
      <Social onPick={social} />
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
          aside={<button type="button" className="link auth-forgot" onClick={() => notify(email.includes('@') ? `Reset link sent to ${email.trim()}` : 'Enter your email first, then tap “Forgot?”', email.includes('@') ? 'ok' : 'info')}>Forgot?</button>}
        >
          <PasswordInput value={password} onChange={v => { setPassword(v); setErr(null) }} autoComplete="current-password" invalid={err?.field === 'password'} />
        </Field>
        <label className="auth-check">
          <input type="checkbox" className="sr-only" checked={remember} onChange={e => setRemember(e.target.checked)} />
          <span className="check" aria-checked={remember} role="presentation" />
          Keep me signed in
        </label>
        <Submit busy={busy}>Sign in</Submit>
      </form>

      <section className="auth-demo well">
        <div className="auth-demo__head">
          <b>Demo accounts</b>
          <small>Password <code>{DEMO_PASSWORD}</code></small>
        </div>
        <ul>
          {demo.map(p => (
            <li key={p.id}>
              <button
                type="button"
                className={`auth-demo__user ${email.toLowerCase() === p.email ? 'is-on' : ''}`}
                onClick={() => { setEmail(p.email); setPassword(DEMO_PASSWORD); setErr(null) }}
              >
                <Avatar p={p} size={34} />
                <span><b>{p.name}</b><small>{p.role}</small></span>
              </button>
            </li>
          ))}
        </ul>
      </section>

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
    run(() => {
      if (!terms) return fail('terms', 'Please accept the terms to continue.')
      const r = signUp({ name, email, password, team, role })
      if (!r.ok) return fail(r.field, r.error)
      notify(`Welcome to Pane, ${name.trim().split(' ')[0]}!`, 'ok')
      go('home')
    }, 900)
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
  const { lastUser, signInAs, notify } = useStore()
  const [busy, run] = useSubmit()
  const first = lastUser?.name.split(' ')[0]
  return (
    <AuthCard shake={0}>
      <Brand />
      <div className="auth-out">
        <span className="auth-out__av">
          {lastUser ? <Avatar p={lastUser} size={88} /> : <Icon name="user" size={40} />}
          <span className="auth-out__badge"><Icon name="check" size={16} /></span>
        </span>
        <h1>You’re signed out</h1>
        <p>{first ? `See you soon, ${first}. Your workspace is just as you left it.` : 'Your workspace is just as you left it.'}</p>
      </div>
      <div className="auth-form">
        {lastUser && (
          <button
            className={`btn btn--primary auth-submit ${busy ? 'is-busy' : ''}`}
            disabled={busy}
            onClick={() => run(() => { signInAs(lastUser.id); notify(`Welcome back, ${first}`, 'ok'); go('home') })}
          >
            {busy && <span className="spinner" aria-hidden="true" />}
            <span>{busy ? 'One moment…' : `Continue as ${first}`}</span>
          </button>
        )}
        <a className="btn btn--glass auth-submit" href="#/signin">Use another account</a>
      </div>
      <p className="auth-foot">Want a fresh start? <a className="link" href="#/signup">Create an account</a></p>
    </AuthCard>
  )
}
