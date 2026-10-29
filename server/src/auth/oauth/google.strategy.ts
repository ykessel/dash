import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { Strategy, type Profile, type StrategyOptions } from 'passport-google-oauth20'
import type { Env } from '../../config/env'
import { CookieStateStore } from './cookie-state-store'
import { googleProfile } from './profiles'

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService<Env, true>) {
    super({
      // Passport refuses an empty id; the start route is closed by ProviderEnabled when it's unset.
      clientID: config.get('GOOGLE_CLIENT_ID', { infer: true }) || 'disabled',
      clientSecret: config.get('GOOGLE_CLIENT_SECRET', { infer: true }) || 'disabled',
      callbackURL: `${config.get('API_URL', { infer: true })}/api/v1/auth/google/callback`,
      scope: ['email', 'profile'],
      store: new CookieStateStore(config.get('COOKIE_SECURE', { infer: true })),
      // @types/passport-google-oauth20 lacks the `store` option, supported by passport-oauth2.
    } as unknown as StrategyOptions)
  }

  validate(_access: string, _refresh: string, profile: Profile) {
    return googleProfile(profile as unknown as Parameters<typeof googleProfile>[0])
  }
}
