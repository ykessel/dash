import { Controller, Get, Logger, Req, Res, UseGuards } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Request, Response } from 'express'
import type { Env } from '../../config/env'
import { AppError } from '../../common/http-exception.filter'
import { metaOf } from '../auth.controller'
import { setRefreshCookie } from '../cookies'
import { SessionService } from '../session.service'
import { IdentityLinker, type OAuthProfile } from './identity-linker.service'
import { GithubOAuthGuard, GoogleOAuthGuard, ProviderEnabled } from './oauth.guards'

type CallbackUser = OAuthProfile | { error: string }

@Controller('auth')
export class OAuthController {
  private readonly log = new Logger('OAuth')

  constructor(
    private readonly linker: IdentityLinker,
    private readonly sessions: SessionService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // The guards redirect to the provider; these handlers never run.
  @Get('google')
  @UseGuards(ProviderEnabled('google'), GoogleOAuthGuard)
  google() {}

  @Get('github')
  @UseGuards(ProviderEnabled('github'), GithubOAuthGuard)
  github() {}

  @Get('google/callback')
  @UseGuards(GoogleOAuthGuard)
  googleCallback(@Req() req: Request, @Res() res: Response) {
    return this.finish(req, res)
  }

  @Get('github/callback')
  @UseGuards(GithubOAuthGuard)
  githubCallback(@Req() req: Request, @Res() res: Response) {
    return this.finish(req, res)
  }

  /** Signs in and sends the browser back to the app, which then calls /auth/refresh for its access token. */
  private async finish(req: Request, res: Response) {
    const app = this.config.get('APP_URL', { infer: true })
    const back = (code: string) => res.redirect(302, `${app}/#/signin?error=${encodeURIComponent(code)}`)
    const got = req.user as CallbackUser | undefined
    if (!got || 'error' in got) return back(got && 'error' in got ? got.error : 'oauth_failed')
    try {
      const user = await this.linker.resolve(got)
      const s = await this.sessions.start(user, { ...metaOf(req), persistent: true })
      setRefreshCookie(res, s.refreshToken, s.refreshExpiresAt, this.config.get('COOKIE_SECURE', { infer: true }))
      return res.redirect(302, `${app}/#/auth/callback`)
    } catch (e) {
      if (e instanceof AppError) return back(e.code)
      // Never leave the browser on a raw JSON error page mid-redirect.
      this.log.error(e)
      return back('oauth_failed')
    }
  }
}
