import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { Actor } from '../common/actor.decorator'
import { dateField } from '../common/dates'
import { HUES, PROJECT_ICONS, PROJECT_STATUSES } from '../common/enums'
import { parseBody } from '../common/validate'
import { versionField } from '../common/version'
import type { Membership } from '../workspaces/membership.entity'
import { CurrentMembership } from '../workspaces/roles.decorator'
import { WorkspaceMemberGuard } from '../workspaces/workspace-member.guard'
import { ProjectsService } from './projects.service'

const name = z.string().trim().min(1, 'Give the project a name.').max(80)
const desc = z.string().trim().max(2000)
const ids = z.array(z.string()).max(200)

const CreateBody = z.object({
  name,
  desc: desc.default(''),
  hue: z.enum(HUES),
  icon: z.enum(PROJECT_ICONS),
  status: z.enum(PROJECT_STATUSES).default('planning'),
  start: dateField.optional(),
  due: dateField,
  lead: z.string().optional(),
  members: ids.optional(),
})
const PatchBody = z.object({
  version: versionField,
  name: name.optional(),
  desc: desc.optional(),
  hue: z.enum(HUES).optional(),
  icon: z.enum(PROJECT_ICONS).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  start: dateField.optional(),
  due: dateField.optional(),
  lead: z.string().optional(),
  defaultRole: z.string().optional(),
})
const MembersBody = z.object({ userIds: ids })
const MemberBody = z.object({ roleId: z.string({ error: 'Pick a role.' }) })
const PrefsBody = z.object({ pinned: z.boolean().optional(), starred: z.boolean().optional() })
const MilestoneBody = z.object({ title: z.string().trim().min(1).max(120), due: dateField, done: z.boolean().optional() })
const MilestonePatch = z.object({ title: z.string().trim().min(1).max(120).optional(), due: dateField.optional(), done: z.boolean().optional() })

@Controller('workspaces/:wsId/projects')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@Param('wsId') wsId: string, @Actor() actor: Actor) {
    return this.projects.list(wsId, actor.userId)
  }

  @Post()
  create(@Param('wsId') wsId: string, @Actor() actor: Actor, @Body() body: unknown) {
    return this.projects.create(wsId, parseBody(CreateBody, body), actor)
  }

  @Get(':id')
  get(@Param('wsId') wsId: string, @Param('id') id: string, @Actor() actor: Actor) {
    return this.projects.get(wsId, id, actor.userId)
  }

  @Patch(':id')
  update(@Param('wsId') wsId: string, @Param('id') id: string, @CurrentMembership() m: Membership, @Actor() actor: Actor, @Body() body: unknown) {
    return this.projects.update(wsId, id, parseBody(PatchBody, body), m, actor)
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('wsId') wsId: string, @Param('id') id: string, @CurrentMembership() m: Membership, @Actor() actor: Actor) {
    return this.projects.remove(wsId, id, m, actor)
  }

  @Put(':id/members')
  setMembers(@Param('wsId') wsId: string, @Param('id') id: string, @CurrentMembership() m: Membership, @Actor() actor: Actor, @Body() body: unknown) {
    return this.projects.setMembers(wsId, id, parseBody(MembersBody, body).userIds, m, actor)
  }

  @Put(':id/members/:userId')
  setMember(@Param('wsId') wsId: string, @Param('id') id: string, @Param('userId') userId: string, @CurrentMembership() m: Membership, @Actor() actor: Actor, @Body() body: unknown) {
    return this.projects.setMember(wsId, id, userId, parseBody(MemberBody, body).roleId, m, actor)
  }

  @Delete(':id/members/:userId')
  removeMember(@Param('wsId') wsId: string, @Param('id') id: string, @Param('userId') userId: string, @CurrentMembership() m: Membership, @Actor() actor: Actor) {
    return this.projects.removeMember(wsId, id, userId, m, actor)
  }

  @Put(':id/prefs')
  setPrefs(@Param('wsId') wsId: string, @Param('id') id: string, @Actor() actor: Actor, @Body() body: unknown) {
    return this.projects.setPrefs(wsId, id, actor.userId, parseBody(PrefsBody, body))
  }

  @Post(':id/milestones')
  addMilestone(@Param('wsId') wsId: string, @Param('id') id: string, @CurrentMembership() m: Membership, @Actor() actor: Actor, @Body() body: unknown) {
    return this.projects.addMilestone(wsId, id, parseBody(MilestoneBody, body), m, actor)
  }

  @Patch(':id/milestones/:mid')
  updateMilestone(@Param('wsId') wsId: string, @Param('id') id: string, @Param('mid') mid: string, @CurrentMembership() m: Membership, @Actor() actor: Actor, @Body() body: unknown) {
    return this.projects.updateMilestone(wsId, id, mid, parseBody(MilestonePatch, body), m, actor)
  }

  @Delete(':id/milestones/:mid')
  @HttpCode(204)
  removeMilestone(@Param('wsId') wsId: string, @Param('id') id: string, @Param('mid') mid: string, @CurrentMembership() m: Membership, @Actor() actor: Actor) {
    return this.projects.removeMilestone(wsId, id, mid, m, actor)
  }
}
