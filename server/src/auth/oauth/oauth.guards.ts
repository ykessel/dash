import { type CanActivate, Injectable, type Type } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AuthGuard } from '@nestjs/passport'
import type { Env } from '../../config/env'
import { RedirectError } from '../../common/http-exception.filter'
import type { OAuthProvider } from '../../users/oauth-account.entity'

/** Never throws: a failed or cancelled round trip becomes `{ error }` so the callback can redirect. */
function providerGuard(name: OAuthProvider) {
  @Injectable()
  class ProviderGuard extends AuthGuard(name) {
    handleRequest<T>(err: unknown, user: T): T {
      return (err || !user ? { error: 'oauth_failed' } : user) as T
    }
  }
  return ProviderGuard
}

export const GoogleOAuthGuard = providerGuard('google')
export const GithubOAuthGuard = providerGuard('github')

const KEYS: Record<OAuthProvider, keyof Env> = { google: 'GOOGLE_CLIENT_ID', github: 'GITHUB_CLIENT_ID' }

/**
 * A provider without credentials sends the browser back to Sign in with `provider_disabled`,
 * before Passport redirects anywhere (the button is a full-page navigation, not a fetch).
 */
export function ProviderEnabled(name: OAuthProvider): Type<CanActivate> {
  @Injectable()
  class Enabled implements CanActivate {
    constructor(private readonly config: ConfigService<Env, true>) {}
    canActivate() {
      if (!this.config.get(KEYS[name])) {
        throw new RedirectError(`${this.config.get('APP_URL', { infer: true })}/#/signin?error=provider_disabled`)
      }
      return true
    }
  }
  return Enabled
}
