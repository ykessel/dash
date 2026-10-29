import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Repository } from 'typeorm'
import { z } from 'zod'
import { JwtAuthGuard, type AuthUser } from '../auth/jwt-auth.guard'
import { CurrentUser } from '../common/current-user.decorator'
import { AppError } from '../common/http-exception.filter'
import { parseBody } from '../common/validate'
import { OAuthAccount } from './oauth-account.entity'
import { toPublicUser } from './public-user'
import { UsersService } from './users.service'

const skin = 'Pick one of the six avatars.'
const ProfileBody = z.object({
  name: z.string().trim().min(1, 'Tell us your name.').max(80).optional(),
  avatarSkin: z.number({ error: skin }).int(skin).min(0, skin).max(5, skin).optional(),
})

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

  /** Renames me everywhere: name and avatar live on the user, not on each membership. */
  @Patch()
  async update(@CurrentUser() current: AuthUser, @Body() body: unknown) {
    await this.users.updateProfile(current.id, parseBody(ProfileBody, body))
    return this.me(current)
  }
}
