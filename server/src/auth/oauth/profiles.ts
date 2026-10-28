import { normalizeEmail } from '../../users/email'
import type { OAuthProfile } from './identity-linker.service'

interface RawEmail {
  value: string
  primary?: boolean
  verified?: boolean
}

interface RawProfile {
  id: string
  displayName?: string
  username?: string
  emails?: RawEmail[]
  _json?: { email_verified?: boolean | string }
}

/** Google reports verification in the `email_verified` claim. */
export function googleProfile(p: RawProfile): OAuthProfile {
  const email = p.emails?.[0]?.value ?? ''
  const v = p._json?.email_verified
  return {
    provider: 'google',
    providerUserId: String(p.id),
    email: normalizeEmail(email),
    emailVerified: !!email && (v === true || v === 'true'),
    name: p.displayName || email.split('@')[0],
  }
}

/** GitHub lists every address (`allRawEmails`); only the primary verified one counts. */
export function githubProfile(p: RawProfile): OAuthProfile {
  const primary = p.emails?.find(e => e.primary && e.verified)
  return {
    provider: 'github',
    providerUserId: String(p.id),
    email: normalizeEmail(primary?.value ?? ''),
    emailVerified: !!primary,
    name: p.displayName || p.username || 'GitHub user',
  }
}
