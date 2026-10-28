import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { QueryFailedError } from 'typeorm'
import type { Env } from '../config/env'
import { AppError } from '../common/http-exception.filter'
import { MailService } from '../mail/mail.service'
import type { User } from '../users/user.entity'
import { UsersService } from '../users/users.service'
import { AuthTokensService } from './auth-tokens.service'
import { hashPassword } from './passwords'

const emailTaken = () => new AppError(409, 'email_taken', 'That email already has an account. Sign in instead.', 'email')

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: AuthTokensService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Frontend route that receives the token; the API never consumes tokens on GET. */
  link(route: 'verify' | 'reset' | 'magic', token: string) {
    return `${this.config.get('APP_URL', { infer: true })}/#/auth/${route}?token=${token}`
  }

  async signup(input: { name: string; email: string; password: string }): Promise<User> {
    if (await this.users.findByEmail(input.email)) throw emailTaken()
    let user: User
    try {
      user = await this.users.create({ ...input, passwordHash: await hashPassword(input.password), emailVerified: false })
    } catch (e) {
      // Two sign-ups racing for one address: the unique index decides.
      if (e instanceof QueryFailedError && (e as QueryFailedError & { code?: string }).code === '23505') throw emailTaken()
      throw e
    }
    await this.sendVerification(user)
    return user
  }

  async resendVerification(email: string): Promise<void> {
    const user = await this.users.findByEmail(email)
    if (user && !user.emailVerifiedAt) await this.sendVerification(user)
  }

  async verifyEmail(token: string): Promise<void> {
    const row = await this.tokens.consume('verify_email', token)
    if (row.userId) await this.users.markVerified(row.userId)
  }

  private async sendVerification(user: User) {
    await this.tokens.invalidatePending('verify_email', user.email)
    const raw = await this.tokens.issue('verify_email', user.email, user.id)
    await this.mail.sendVerifyEmail(user.email, this.link('verify', raw))
  }
}
