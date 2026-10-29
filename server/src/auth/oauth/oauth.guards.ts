import { type CanActivate, Injectable, type Type } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AuthGuard } from '@nestjs/passport'
import type { Env } from '../../config/env'
import { AppError } from '../../common/http-exception.filter'
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

/** 404 for a provider without credentials, before Passport redirects anywhere. */
export function ProviderEnabled(name: OAuthProvider): Type<CanActivate> {
  @Injectable()
  class Enabled implements CanActivate {
    constructor(private readonly config: ConfigService<Env, true>) {}
    canActivate() {
      if (!this.config.get(KEYS[name])) throw new AppError(404, 'provider_disabled', `Sign-in with ${name} isn’t set up.`)
      return true
    }
  }
  return Enabled
}
