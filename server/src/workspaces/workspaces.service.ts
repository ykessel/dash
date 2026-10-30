import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, type Repository } from 'typeorm'
import { seedDefaultRoles } from '../access/roles.seed'
import type { Actor } from '../common/actor.decorator'
import { isUniqueViolation } from '../common/db-errors'
import { DomainEvents } from '../common/domain-events'
import { AppError } from '../common/http-exception.filter'
import { UsersService } from '../users/users.service'
import type { Access, Team } from './enums'
import { Membership } from './membership.entity'
import { type Person, toPerson } from './person'
import { slugify, slugSuffix } from './slug'
import { Workspace } from './workspace.entity'

export interface WorkspaceSummary {
  id: string
  name: string
  slug: string
}

export interface WorkspaceView extends WorkspaceSummary {
  createdAt: Date
  access: Access
}

const summary = (w: Workspace): WorkspaceSummary => ({ id: w.id, name: w.name, slug: w.slug })

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(Workspace) private readonly workspaces: Repository<Workspace>,
    @InjectRepository(Membership) private readonly memberships: Repository<Membership>,
    private readonly users: UsersService,
    private readonly events: DomainEvents,
  ) {}

  /** Creates the workspace with the caller as owner. A taken slug gets a short random suffix. */
  async create(userId: string, input: { name: string; team?: Team; title?: string }): Promise<{ workspace: WorkspaceSummary; member: Person }> {
    const user = await this.users.findById(userId)
    if (!user) throw new AppError(401, 'unauthorized', 'Sign in to continue.')
    const base = slugify(input.name)
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = attempt === 0 ? base : `${base.slice(0, 35).replace(/-+$/, '')}-${slugSuffix()}`
      try {
        const created = await this.ds.transaction(async em => {
          const { identifiers } = await em.insert(Workspace, { name: input.name, slug, createdBy: userId })
          const id = identifiers[0].id as string
          await em.insert(Membership, { workspaceId: id, userId, role: 'owner', team: input.team ?? 'Product', title: input.title ?? '' })
          await seedDefaultRoles(em, id)
          const workspace = await em.findOneByOrFail(Workspace, { id })
          const member = await em.findOneByOrFail(Membership, { workspaceId: id, userId })
          return { workspace: summary(workspace), member: toPerson(member, user) }
        })
        // Lets the creator's open tabs join the new workspace's room, like any new member.
        this.events.publish('member.joined', created.workspace.id, { userId }, { member: created.member })
        return created
      } catch (e) {
        if (!isUniqueViolation(e)) throw e
      }
    }
    throw new AppError(409, 'slug_taken', 'Couldn’t find a free address for that name. Try another.', 'name')
  }

  async get(wsId: string, access: Access): Promise<WorkspaceView> {
    const w = await this.workspaces.findOneByOrFail({ id: wsId })
    return { ...summary(w), createdAt: w.createdAt, access }
  }

  async rename(wsId: string, name: string, by: Membership, actor: Actor): Promise<WorkspaceView> {
    await this.workspaces.update({ id: wsId }, { name })
    const view = await this.get(wsId, by.role)
    this.events.publish('workspace.updated', wsId, actor, { workspace: { id: view.id, name: view.name, slug: view.slug } })
    return view
  }

  /** The caller's workspaces, oldest membership first. */
  async listForUser(userId: string): Promise<(WorkspaceSummary & { access: Access })[]> {
    const rows = await this.memberships.createQueryBuilder('m')
      .innerJoin(Workspace, 'w', 'w.id = m.workspace_id')
      .select(['w.id AS id', 'w.name AS name', 'w.slug AS slug', 'm.role AS access'])
      .where('m.user_id = :userId', { userId })
      .orderBy('m.joined_at', 'ASC')
      .getRawMany<WorkspaceSummary & { access: Access }>()
    return rows.map(r => ({ id: r.id, name: r.name, slug: r.slug, access: r.access }))
  }
}
