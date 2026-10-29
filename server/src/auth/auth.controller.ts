import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Throttle } from '@nestjs/throttler'
import type { Request, Response } from 'express'
import type { Env } from '../config/env'
import { LOGIN_LIMIT, MAIL_LIMIT, SIGNUP_LIMIT } from '../common/throttle-key'
import { parseBody } from '../common/validate'
import { toPublicUser } from '../users/public-user'
import { AuthService } from './auth.service'
import { clearRefreshCookie, REFRESH_COOKIE, setRefreshCookie } from './cookies'
import { emailDto, loginDto, resetDto, signupDto, tokenDto } from './dto/auth.dto'
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
  @Throttle(SIGNUP_LIMIT)
  async signup(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const input = parseBody(signupDto, body)
    return this.respond(res, await this.auth.signup(input, { ...metaOf(req), persistent: true }))
  }

  @Post('login')
  @Throttle(LOGIN_LIMIT)
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

  @Post('password/forgot')
  @Throttle(MAIL_LIMIT)
  @HttpCode(202)
  async forgot(@Body() body: unknown) {
    await this.auth.forgotPassword(parseBody(emailDto, body).email)
  }

  @Post('password/reset')
  @HttpCode(200)
  async reset(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { token, password } = parseBody(resetDto, body)
    return this.respond(res, await this.auth.resetPassword(token, password, { ...metaOf(req), persistent: true }))
  }

  @Post('magic-link')
  @Throttle(MAIL_LIMIT)
  @HttpCode(202)
  async magicLink(@Body() body: unknown) {
    await this.auth.sendMagicLink(parseBody(emailDto, body).email)
  }

  /** POST only: mail scanners that open links with GET must not spend the token. */
  @Post('magic-link/verify')
  @HttpCode(200)
  async verifyMagicLink(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const s = await this.auth.verifyMagicLink(parseBody(tokenDto, body).token, { ...metaOf(req), persistent: true })
    return { ...this.respond(res, s), created: s.created }
  }

  @Post('verify-email')
  @HttpCode(204)
  async verifyEmail(@Body() body: unknown) {
    await this.auth.verifyEmail(parseBody(tokenDto, body).token)
  }

  @Post('verify-email/resend')
  @Throttle(MAIL_LIMIT)
  @HttpCode(202)
  async resend(@Body() body: unknown) {
    await this.auth.resendVerification(parseBody(emailDto, body).email)
  }
}
