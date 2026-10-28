import { Controller, Get, UseGuards } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Repository } from 'typeorm'
import { JwtAuthGuard, type AuthUser } from '../auth/jwt-auth.guard'
import { CurrentUser } from '../common/current-user.decorator'
import { AppError } from '../common/http-exception.filter'
import { OAuthAccount } from './oauth-account.entity'
import { toPublicUser } from './public-user'
import { UsersService } from './users.service'

@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(
    private readonly users: UsersService,
    @InjectRepository(OAuthAccount) private readonly oauth: Repository<OAuthAccount>,
  ) {}

  @Get()
  async me(@CurrentUser() current: AuthUser) {
    const user = await this.users.findById(current.id)
    if (!user) throw new AppError(401, 'unauthorized', 'Sign in to continue.')
    const linked = await this.oauth.find({ where: { userId: user.id }, order: { provider: 'ASC' } })
    const providers = [...(user.passwordHash ? ['password'] : []), ...linked.map(a => a.provider)]
    return { ...toPublicUser(user), providers }
  }
}
