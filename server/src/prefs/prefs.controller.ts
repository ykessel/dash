import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { type AuthUser, JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CurrentUser } from '../common/current-user.decorator'
import { parseBody } from '../common/validate'
import { PrefsService } from './prefs.service'
import { ACCENTS, GLASS, THEMES, WALLS } from './user-prefs.entity'

const minutes = (max: number) => {
  const message = `Use 1 to ${max} minutes.`
  return z.number({ error: message }).int(message).min(1, message).max(max, message)
}

const PatchBody = z.object({
  notify: z.object({
    mentions: z.boolean(), due: z.boolean(), meetings: z.boolean(), digest: z.boolean(), focus: z.boolean(),
  }).partial().strict().optional(),
  session: minutes(180).optional(),
  pause: minutes(60).optional(),
  look: z.object({
    theme: z.enum(THEMES), wall: z.enum(WALLS), accent: z.enum(ACCENTS), glass: z.enum(GLASS), solid: z.boolean(),
  }).partial().strict().optional(),
})

@Controller('me/prefs')
@UseGuards(JwtAuthGuard)
export class PrefsController {
  constructor(private readonly prefs: PrefsService) {}

  @Get()
  get(@CurrentUser() me: AuthUser) {
    return this.prefs.get(me.id)
  }

  @Patch()
  update(@CurrentUser() me: AuthUser, @Body() body: unknown) {
    return this.prefs.update(me.id, parseBody(PatchBody, body))
  }
}
