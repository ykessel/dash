import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, In, IsNull, Not, type Repository } from 'typeorm'
import { AccessService } from '../access/access.service'
import { covers, LEAD_PERMISSIONS, type Permission, parsePermissions } from '../access/permissions'
import { ProjectRole } from '../access/project-role.entity'
import { RolesService } from '../access/roles.service'
import { memberRoleId } from '../access/roles.seed'
import type { Actor } from '../common/actor.decorator'
import { CalendarService } from '../calendar/calendar.service'
import { CLOCK, type Clock } from '../common/clock'
import { isoDay } from '../common/dates'
import { DomainEvents } from '../common/domain-events'
import type { Hue, ProjectIcon, ProjectStatus } from '../common/enums'
import { AppError } from '../common/http-exception.filter'
import { assertVersion } from '../common/version'
import { forbidden } from '../workspaces/errors'
import type { Membership } from '../workspaces/membership.entity'
import { WorkspaceRefs } from '../workspaces/refs.service'
import { UUID } from '../workspaces/workspace-member.guard'
import { Milestone, Project, ProjectMember, ProjectPrefs } from './project.entity'
import { type MilestoneView, type ProjectView, sharedProject, toMilestoneView, toProjectView } from './project-view'

export interface ProjectInput {
  name: string
  desc: string
  hue: Hue
  icon: ProjectIcon
  status: ProjectStatus
  start?: string
  due: string
  lead?: string
  members?: string[]
}

export type ProjectPatch = Partial<Omit<ProjectInput, 'members'>> & {
  version: number
  defaultRole?: string
  approvalEnabled?: boolean
  approvalPeriod?: 'week' | 'month'
}

const projectNotFound = () => new AppError(404, 'project_not_found', 'That project doesn’t exist.')
const milestoneNotFound = () => new AppError(404, 'milestone_not_found', 'That milestone doesn’t exist.')

@Injectable()
export class ProjectsService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(ProjectMember) private readonly members: Repository<ProjectMember>,
    @InjectRepository(ProjectPrefs) private readonly prefs: Repository<ProjectPrefs>,
    @InjectRepository(Milestone) private readonly milestones: Repository<Milestone>,
    private readonly refs: WorkspaceRefs,
    private readonly calendar: CalendarService,
    private readonly events: DomainEvents,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly access: AccessService,
    private readonly roles: RolesService,
  ) {}

  /** Live projects of the workspace, oldest first, with the caller's pinned/starred. */
  async list(wsId: string, userId: string): Promise<ProjectView[]> {
    const rows = await this.projects.find({ where: { workspaceId: wsId, deletedAt: IsNull() }, order: { createdAt: 'ASC' } })
    return this.views(rows, userId)
  }

  async get(wsId: string, id: string, userId: string): Promise<ProjectView> {
    return (await this.views([await this.find(wsId, id)], userId))[0]
  }

  /** Like the frontend's addProject: I lead it, I'm a member, and it starts with a Kickoff milestone. */
  async create(wsId: string, input: ProjectInput, actor: Actor): Promise<ProjectView> {
    const lead = input.lead ?? actor.userId
    await this.refs.assertMembers(wsId, [lead], 'lead')
    await this.refs.assertMembers(wsId, input.members ?? [], 'members')
    const memberIds = [...new Set([lead, ...(input.members ?? [actor.userId])])]
    const id = await this.ds.transaction(async em => {
      const roleId = await memberRoleId(em, wsId)
      const { identifiers } = await em.insert(Project, {
        workspaceId: wsId,
        name: input.name,
        description: input.desc,
        hue: input.hue,
        icon: input.icon,
        status: input.status,
        startDate: input.start ?? isoDay(this.clock.now()),
        dueDate: input.due,
        leadId: lead,
        defaultRoleId: roleId,
      })
      const projectId = identifiers[0].id as string
      await em.insert(ProjectMember, memberIds.map(userId => ({ projectId, userId, roleId })))
      await em.insert(Milestone, { projectId, title: 'Kickoff', dueDate: input.due, position: 0 })
      return projectId
    })
    const view = await this.get(wsId, id, actor.userId)
    this.events.publish('project.created', wsId, actor, { project: sharedProject(view) })
    return view
  }

  async update(wsId: string, id: string, patch: ProjectPatch, by: Membership, actor: Actor): Promise<ProjectView> {
    const p = await this.find(wsId, id)
    const have = await this.access.assert(wsId, id, by, 'project.admin')
    assertVersion(p.version, patch.version)
    const { version, desc, start, due, lead, defaultRole, ...rest } = patch
    if (lead !== undefined && lead !== p.leadId) {
      await this.refs.assertMembers(wsId, [lead], 'lead')
      // Moving the lead hands out (and takes away) the lead's powers: only someone who holds them all may.
      if (!covers(have, LEAD_PERMISSIONS)) throw forbidden()
    }
    if (defaultRole !== undefined) {
      const next = await this.roles.find(wsId, defaultRole, 'defaultRole')
      this.assertCanGrant(have, next, await this.role(p.defaultRoleId))
    }
    const set: Partial<Project> = {
      ...rest,
      ...(desc !== undefined ? { description: desc } : {}),
      ...(start !== undefined ? { startDate: start } : {}),
      ...(due !== undefined ? { dueDate: due } : {}),
      ...(lead !== undefined ? { leadId: lead } : {}),
      ...(defaultRole !== undefined ? { defaultRoleId: defaultRole } : {}),
    }
    if (!Object.values(set).some(v => v !== undefined)) return this.get(wsId, id, actor.userId)
    await this.ds.transaction(async em => {
      // Conditional on the version: of two edits racing from the same version, one gets 409.
      const res = await em.update(Project, { id, version }, { ...set, version: version + 1 })
      if (!res.affected) assertVersion(-1, version)
      // Turning approval off sends pending submissions back to open; approved ones stay as history.
      if (rest.approvalEnabled === false && p.approvalEnabled) {
        await em.query(`DELETE FROM timesheet_periods WHERE project_id = $1 AND status = 'submitted'`, [id])
      }
      // A new lead keeps the role they already hold here; a newcomer gets the project's default.
      if (lead !== undefined) {
        await em.createQueryBuilder().insert().into(ProjectMember)
          .values({ projectId: id, userId: lead, roleId: defaultRole ?? p.defaultRoleId }).orIgnore().execute()
      }
    })
    const view = await this.publishUpdated(wsId, id, actor)
    if ((lead !== undefined && lead !== p.leadId) || (defaultRole !== undefined && defaultRole !== p.defaultRoleId)) this.accessChanged(wsId, id, actor)
    return view
  }

  /** Soft delete; a project with live tasks has to be emptied first. */
  async remove(wsId: string, id: string, by: Membership, actor: Actor): Promise<void> {
    await this.find(wsId, id)
    await this.access.assert(wsId, id, by, 'project.admin')
    const unlinked = await this.ds.transaction(async em => {
      // FOR UPDATE waits for task writes holding the project FOR SHARE, so no live task slips in after the check.
      await em.query(`SELECT 1 FROM projects WHERE id = $1 FOR UPDATE`, [id])
      const [{ busy }] = await em.query(
        `SELECT EXISTS (SELECT 1 FROM tasks WHERE project_id = $1 AND deleted_at IS NULL) AS busy`, [id])
      if (busy) throw new AppError(409, 'project_has_tasks', 'Move or delete this project’s tasks first.')
      await em.update(Project, { id }, { deletedAt: this.clock.now() })
      // Events keep happening; they just stop pointing at the project.
      const rows: { id: string }[] = await em.query(`SELECT id FROM events WHERE project_id = $1 FOR UPDATE`, [id])
      if (rows.length) await em.query(`UPDATE events SET project_id = NULL WHERE project_id = $1`, [id])
      return rows.map(r => r.id)
    })
    await this.calendar.publishUpdated(wsId, unlinked, actor)
    this.events.publish('project.deleted', wsId, actor, { id })
  }

  /** Replaces the member list; the lead is always kept, people who stay keep their role, newcomers get the default. */
  async setMembers(wsId: string, id: string, userIds: string[], by: Membership, actor: Actor): Promise<ProjectView> {
    const p = await this.find(wsId, id)
    const have = await this.access.assert(wsId, id, by, 'project.admin')
    await this.refs.assertMembers(wsId, userIds, 'members')
    const ids = [...new Set([...(p.leadId ? [p.leadId] : []), ...userIds])]
    const leaving = (await this.members.findBy({ projectId: id })).filter(m => !ids.includes(m.userId))
    this.assertCanGrant(have, ...(await this.rolesOf(leaving.map(m => m.roleId))), await this.role(p.defaultRoleId))
    await this.ds.transaction(async em => {
      await em.delete(ProjectMember, ids.length ? { projectId: id, userId: Not(In(ids)) } : { projectId: id })
      if (ids.length) {
        await em.createQueryBuilder().insert().into(ProjectMember)
          .values(ids.map(userId => ({ projectId: id, userId, roleId: p.defaultRoleId }))).orIgnore().execute()
      }
    })
    const view = await this.publishUpdated(wsId, id, actor)
    this.accessChanged(wsId, id, actor)
    return view
  }

  /** Adds someone to the project with a role, or changes their role. */
  async setMember(wsId: string, id: string, userId: string, roleId: string, by: Membership, actor: Actor): Promise<ProjectView> {
    await this.find(wsId, id)
    const have = await this.access.assert(wsId, id, by, 'project.admin')
    await this.refs.assertMembers(wsId, [userId], 'members')
    const next = await this.roles.find(wsId, roleId)
    const current = await this.members.findOneBy({ projectId: id, userId })
    this.assertCanGrant(have, next, ...(current ? [await this.role(current.roleId)] : []))
    await this.members.upsert({ projectId: id, userId, roleId: next.id }, ['projectId', 'userId'])
    const view = await this.publishUpdated(wsId, id, actor)
    this.accessChanged(wsId, id, actor)
    return view
  }

  /** Takes someone off the list; they fall back to the project's default role. The lead stays. */
  async removeMember(wsId: string, id: string, userId: string, by: Membership, actor: Actor): Promise<ProjectView> {
    const p = await this.find(wsId, id)
    const have = await this.access.assert(wsId, id, by, 'project.admin')
    if (p.leadId === userId) throw new AppError(409, 'lead_is_member', 'The lead stays on the project. Pick another lead first.')
    const current = UUID.test(userId) ? await this.members.findOneBy({ projectId: id, userId }) : null
    if (current) {
      this.assertCanGrant(have, await this.role(current.roleId), await this.role(p.defaultRoleId))
      await this.members.delete({ projectId: id, userId })
    }
    const view = await this.publishUpdated(wsId, id, actor)
    this.accessChanged(wsId, id, actor)
    return view
  }

  /** The caller's own pinned/starred; nobody else sees it, so nothing is published. */
  async setPrefs(wsId: string, id: string, userId: string, input: { pinned?: boolean; starred?: boolean }): Promise<ProjectView> {
    await this.find(wsId, id)
    const current = await this.prefs.findOneBy({ projectId: id, userId })
    await this.prefs.upsert(
      { projectId: id, userId, pinned: input.pinned ?? current?.pinned ?? false, starred: input.starred ?? current?.starred ?? false },
      ['projectId', 'userId'],
    )
    return this.get(wsId, id, userId)
  }

  async addMilestone(wsId: string, id: string, input: { title: string; due: string; done?: boolean }, by: Membership, actor: Actor): Promise<MilestoneView> {
    await this.find(wsId, id)
    await this.access.assert(wsId, id, by, 'project.admin')
    const [{ next }] = await this.ds.query(`SELECT coalesce(max(position) + 1, 0)::int AS next FROM milestones WHERE project_id = $1`, [id])
    const { identifiers } = await this.milestones.insert({ projectId: id, title: input.title, dueDate: input.due, done: input.done ?? false, position: next })
    await this.publishMilestones(wsId, id, actor)
    return toMilestoneView(await this.milestones.findOneByOrFail({ id: identifiers[0].id as string }))
  }

  async updateMilestone(wsId: string, id: string, mid: string, patch: { title?: string; due?: string; done?: boolean }, by: Membership, actor: Actor): Promise<MilestoneView> {
    await this.find(wsId, id)
    await this.access.assert(wsId, id, by, 'project.admin')
    const m = await this.findMilestone(id, mid)
    const set = { title: patch.title, dueDate: patch.due, done: patch.done }
    if (Object.values(set).some(v => v !== undefined)) {
      await this.milestones.update({ id: m.id }, set)
      await this.publishMilestones(wsId, id, actor)
    }
    return toMilestoneView(await this.milestones.findOneByOrFail({ id: m.id }))
  }

  async removeMilestone(wsId: string, id: string, mid: string, by: Membership, actor: Actor): Promise<void> {
    await this.find(wsId, id)
    await this.access.assert(wsId, id, by, 'project.admin')
    const m = await this.findMilestone(id, mid)
    await this.milestones.delete({ id: m.id })
    await this.publishMilestones(wsId, id, actor)
  }

  private async find(wsId: string, id: string): Promise<Project> {
    const p = UUID.test(id) ? await this.projects.findOneBy({ id, workspaceId: wsId, deletedAt: IsNull() }) : null
    if (!p) throw projectNotFound()
    return p
  }

  private async findMilestone(projectId: string, mid: string): Promise<Milestone> {
    const m = UUID.test(mid) ? await this.milestones.findOneBy({ id: mid, projectId }) : null
    if (!m) throw milestoneNotFound()
    return m
  }

  /**
   * No escalation: whoever gives, changes or takes away a role must already hold everything in it
   * (and in the role it replaces), so a lead can't hand out or strip more than they have.
   */
  private assertCanGrant(have: Set<Permission>, ...roles: ProjectRole[]) {
    if (!roles.every(r => covers(have, parsePermissions(r.permissions)))) throw forbidden()
  }

  private role(id: string): Promise<ProjectRole> {
    return this.ds.getRepository(ProjectRole).findOneByOrFail({ id })
  }

  private rolesOf(ids: string[]): Promise<ProjectRole[]> {
    return ids.length ? this.ds.getRepository(ProjectRole).findBy({ id: In([...new Set(ids)]) }) : Promise.resolve([])
  }

  /** Clients refetch their own permissions; the event says nothing about who can do what. */
  private accessChanged(wsId: string, projectId: string, actor: Actor) {
    this.events.publish('project.access_changed', wsId, actor, { projectId })
  }

  private async views(rows: Project[], userId: string): Promise<ProjectView[]> {
    if (!rows.length) return []
    const ids = rows.map(p => p.id)
    const [members, milestones, prefs] = await Promise.all([
      this.members.findBy({ projectId: In(ids) }),
      this.milestones.findBy({ projectId: In(ids) }),
      this.prefs.findBy({ projectId: In(ids), userId }),
    ])
    return rows.map(p => toProjectView(
      p,
      members.filter(m => m.projectId === p.id),
      milestones.filter(m => m.projectId === p.id),
      prefs.find(x => x.projectId === p.id),
    ))
  }

  private async publishUpdated(wsId: string, id: string, actor: Actor): Promise<ProjectView> {
    const view = await this.get(wsId, id, actor.userId)
    this.events.publish('project.updated', wsId, actor, { project: sharedProject(view) })
    return view
  }

  private async publishMilestones(wsId: string, projectId: string, actor: Actor) {
    const list = await this.milestones.find({ where: { projectId }, order: { position: 'ASC' } })
    this.events.publish('milestone.updated', wsId, actor, { projectId, milestones: list.map(toMilestoneView) })
  }
}
