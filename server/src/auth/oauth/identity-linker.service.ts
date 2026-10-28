import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Repository } from 'typeorm'
import { AppError } from '../../common/http-exception.filter'
import type { OAuthAccount, OAuthProvider } from '../../users/oauth-account.entity'
import { OAuthAccount as OAuthAccountEntity } from '../../users/oauth-account.entity'
import type { User } from '../../users/user.entity'
import { UsersService } from '../../users/users.service'

export interface OAuthProfile {
  provider: OAuthProvider
  providerUserId: string
  email: string
  emailVerified: boolean
  name: string
}

/**
 * Turns a provider identity into a Pane user. Links by email only when both
 * sides have proven the address, so a provider account can't take over a
 * local account someone registered with an address they don't own.
 */
@Injectable()
export class IdentityLinker {
  constructor(
    private readonly users: UsersService,
    @InjectRepository(OAuthAccountEntity) private readonly accounts: Repository<OAuthAccount>,
  ) {}

  async resolve(p: OAuthProfile): Promise<User> {
    const linked = await this.accounts.findOneBy({ provider: p.provider, providerUserId: p.providerUserId })
    if (linked) {
      const user = await this.users.findById(linked.userId)
      if (user) return user
    }
    if (!p.emailVerified || !p.email) {
      throw new AppError(409, 'email_unverified', 'Your account with that provider has no verified email.')
    }
    let user = await this.users.findByEmail(p.email)
    if (user && !user.emailVerifiedAt) {
      throw new AppError(409, 'account_exists_unverified', 'An account with this email exists but isn’t verified. Sign in with your password or a magic link first.')
    }
    user ??= await this.users.create({ email: p.email, name: p.name, emailVerified: true })
    await this.accounts.insert({ userId: user.id, provider: p.provider, providerUserId: p.providerUserId })
    return user
  }
}
