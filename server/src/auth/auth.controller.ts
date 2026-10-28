import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Request, Response } from 'express'
import type { Env } from '../config/env'
import { parseBody } from '../common/validate'
import { toPublicUser } from '../users/public-user'
import { AuthService } from './auth.service'
import { clearRefreshCookie, REFRESH_COOKIE, setRefreshCookie } from './cookies'
import { emailDto, loginDto, signupDto, tokenDto } from './dto/auth.dto'
import { SessionService, type Issued } from './session.service'

export const metaOf = (req: Request) => ({ ip: req.ip ?? '', userAgent: String(req.headers['user-agent'] ?? '') })

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Sets the refresh cookie and returns what the client keeps in memory. */
  respond(res: Response, s: Issued) {
    setRefreshCookie(res, s.refreshToken, s.persistent ? s.refreshExpiresAt : null, this.secure)
    return { accessToken: s.accessToken, user: toPublicUser(s.user) }
  }

  get secure() {
    return this.config.get('COOKIE_SECURE', { infer: true })
  }

  @Post('signup')
  async signup(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const input = parseBody(signupDto, body)
    return this.respond(res, await this.auth.signup(input, { ...metaOf(req), persistent: true }))
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { remember, ...input } = parseBody(loginDto, body)
    return this.respond(res, await this.auth.login(input, { ...metaOf(req), persistent: remember }))
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      return this.respond(res, await this.sessions.rotate(req.cookies?.[REFRESH_COOKIE], metaOf(req)))
    } catch (e) {
      clearRefreshCookie(res, this.secure)
      throw e
    }
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.sessions.revoke(req.cookies?.[REFRESH_COOKIE])
    clearRefreshCookie(res, this.secure)
  }

  @Post('verify-email')
  @HttpCode(204)
  async verifyEmail(@Body() body: unknown) {
    await this.auth.verifyEmail(parseBody(tokenDto, body).token)
  }

  @Post('verify-email/resend')
  @HttpCode(202)
  async resend(@Body() body: unknown) {
    await this.auth.resendVerification(parseBody(emailDto, body).email)
  }
}
