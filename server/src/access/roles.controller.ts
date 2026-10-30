import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { Actor } from '../common/actor.decorator'
import { parseBody } from '../common/validate'
import { Roles } from '../workspaces/roles.decorator'
import { WorkspaceMemberGuard } from '../workspaces/workspace-member.guard'
import { PERMISSIONS } from './permissions'
import { RolesService } from './roles.service'

const name = z.string().trim().min(1, 'Give the role a name.').max(40, 'Keep the name under 40 characters.')
const description = z.string().trim().max(200)
const permissions = z.array(z.enum(PERMISSIONS, { error: 'Pick permissions from the list.' })).max(PERMISSIONS.length * 2)

const CreateBody = z.object({ name, description: description.optional(), permissions })
const PatchBody = z.object({ name: name.optional(), description: description.optional(), permissions: permissions.optional() })

/** Project roles of a workspace. Anyone can read them; owner and admins shape them. */
@Controller('workspaces/:wsId/roles')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  list(@Param('wsId') wsId: string) {
    return this.roles.list(wsId)
  }

  @Post()
  @Roles('owner', 'admin')
  create(@Param('wsId') wsId: string, @Actor() actor: Actor, @Body() body: unknown) {
    return this.roles.create(wsId, parseBody(CreateBody, body), actor)
  }

  @Patch(':id')
  @Roles('owner', 'admin')
  update(@Param('wsId') wsId: string, @Param('id') id: string, @Actor() actor: Actor, @Body() body: unknown) {
    return this.roles.update(wsId, id, parseBody(PatchBody, body), actor)
  }

  @Post(':id/duplicate')
  @Roles('owner', 'admin')
  duplicate(@Param('wsId') wsId: string, @Param('id') id: string, @Actor() actor: Actor) {
    return this.roles.duplicate(wsId, id, actor)
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('owner', 'admin')
  remove(@Param('wsId') wsId: string, @Param('id') id: string, @Actor() actor: Actor) {
    return this.roles.remove(wsId, id, actor)
  }
}
