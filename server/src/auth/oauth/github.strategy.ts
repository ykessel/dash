import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { Strategy, type Profile, type StrategyOptions } from 'passport-github2'
import type { Env } from '../../config/env'
import { CookieStateStore } from './cookie-state-store'
import { githubProfile } from './profiles'

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(config: ConfigService<Env, true>) {
    super({
      clientID: config.get('GITHUB_CLIENT_ID', { infer: true }) || 'disabled',
      clientSecret: config.get('GITHUB_CLIENT_SECRET', { infer: true }) || 'disabled',
      callbackURL: `${config.get('API_URL', { infer: true })}/api/v1/auth/github/callback`,
      scope: ['user:email'],
      // Every address with its primary/verified flags, instead of just the first one.
      allRawEmails: true,
      store: new CookieStateStore(config.get('COOKIE_SECURE', { infer: true })),
      // @types/passport-github2 lacks allRawEmails and store, both supported at runtime.
    } as unknown as StrategyOptions)
  }

  validate(_access: string, _refresh: string, profile: Profile) {
    return githubProfile(profile as unknown as Parameters<typeof githubProfile>[0])
  }
}
