import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, type Repository } from 'typeorm'
import type { Actor } from '../common/actor.decorator'
import { DomainEvents } from '../common/domain-events'
import { AppError } from '../common/http-exception.filter'
import { User } from '../users/user.entity'
import type { Presence, Team } from './enums'
import { forbidden } from './errors'
import { Membership } from './membership.entity'
import { type Person, toPerson } from './person'
import { UUID } from './workspace-member.guard'

export interface MemberPatch {
  team?: Team
  title?: string
  city?: string
  tz?: string
  capacity?: number
  role?: 'admin' | 'member'
}

const memberNotFound = () => new AppError(404, 'member_not_found', 'That person isn’t in this workspace.')
const cannotChangeOwner = () => new AppError(403, 'cannot_change_owner', 'The workspace owner’s role can’t be changed or removed.')

@Injectable()
export class MembersService {
  constructor(
    @InjectRepository(Membership) private readonly repo: Repository<Membership>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly events: DomainEvents,
  ) {}

  /** Everyone in the workspace, by name. */
  async list(wsId: string): Promise<Person[]> {
    const rows = await this.repo.findBy({ workspaceId: wsId })
    const users = new Map((await this.users.findBy({ id: In(rows.map(r => r.userId)) })).map(u => [u.id, u]))
    return rows
      .filter(r => users.has(r.userId))
      .map(r => toPerson(r, users.get(r.userId)!))
      .sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email))
  }

  /** You edit your own profile; owner/admin edit anyone's and set roles, except the owner's role. */
  async update(wsId: string, userId: string, patch: MemberPatch, by: Membership, actor: Actor): Promise<Person> {
    const target = await this.find(wsId, userId)
    const self = by.userId === userId
    if (by.role === 'member' && (!self || patch.role !== undefined)) throw forbidden()
    if (target.role === 'owner' && patch.role !== undefined) throw cannotChangeOwner()
    const { role, ...profile } = patch
    // zod drops unknown keys, so `{}` and `{ nickname }` both arrive empty: nothing to save or announce.
    if (!Object.values(patch).some(v => v !== undefined)) return this.person(wsId, userId)
    await this.repo.update({ workspaceId: wsId, userId }, { ...profile, ...(role ? { role } : {}) })
    const member = await this.person(wsId, userId)
    this.events.publish('member.updated', wsId, actor, { member })
    return member
  }

  /** Leave (yourself) or remove someone (owner/admin). The owner stays. */
  async remove(wsId: string, userId: string, by: Membership, actor: Actor): Promise<void> {
    const target = await this.find(wsId, userId)
    if (by.userId === userId) {
      if (target.role === 'owner') throw new AppError(409, 'owner_cannot_leave', 'The owner can’t leave the workspace.')
    } else {
      if (by.role === 'member') throw forbidden()
      if (target.role === 'owner') throw cannotChangeOwner()
    }
    await this.repo.manager.transaction(async em => {
      await em.delete(Membership, { workspaceId: wsId, userId })
      // Their worklogs stay for history and reports; hours waiting for approval are withdrawn.
      await em.query(`DELETE FROM timesheet_periods WHERE workspace_id = $1 AND user_id = $2 AND status = 'submitted'`, [wsId, userId])
    })
    this.events.publish('member.left', wsId, actor, { userId })
  }

  async setPresence(wsId: string, userId: string, presence: Presence, note: string | null, actor: Actor): Promise<Person> {
    await this.repo.update({ workspaceId: wsId, userId }, { presence, presenceNote: note })
    this.events.publish('presence.changed', wsId, actor, { userId, presence, note })
    return this.person(wsId, userId)
  }

  async addMember(wsId: string, userId: string, fields: { role: 'admin' | 'member'; team: Team; title: string }, actor: Actor): Promise<Person> {
    await this.repo.insert({ workspaceId: wsId, userId, ...fields })
    const member = await this.person(wsId, userId)
    this.events.publish('member.joined', wsId, actor, { member })
    return member
  }

  presenceFor(userId: string): Promise<Membership[]> {
    return this.repo.findBy({ userId })
  }

  /** Moves the user's memberships whose presence is in `from` to `to`; returns the rows it changed. */
  async setPresenceWhere(userId: string, from: Presence[] | 'any', to: Presence): Promise<Membership[]> {
    const rows = await this.repo.findBy(from === 'any' ? { userId } : { userId, presence: In(from) })
    const changed = rows.filter(r => r.presence !== to || r.presenceNote !== null)
    if (!changed.length) return []
    // Re-check `from` in the UPDATE so a presence set via REST in between isn't overwritten.
    await this.repo.update(
      { userId, workspaceId: In(changed.map(r => r.workspaceId)), ...(from === 'any' ? {} : { presence: In(from) }) },
      { presence: to, presenceNote: null },
    )
    return changed.map(r => ({ ...r, presence: to, presenceNote: null }))
  }

  /** Everyone back to away: nobody is connected to a process that just started. */
  /** Sets everyone except `keep` (people connected right now) back to away with no note. */
  async resetPresenceExcept(keep: string[]): Promise<void> {
    const q = this.repo.createQueryBuilder().update().set({ presence: 'away', presenceNote: null })
      .where(`(presence <> 'away' OR presence_note IS NOT NULL)`)
    if (keep.length) q.andWhere('user_id NOT IN (:...keep)', { keep })
    await q.execute()
  }

  private async find(wsId: string, userId: string): Promise<Membership> {
    const m = UUID.test(userId) ? await this.repo.findOneBy({ workspaceId: wsId, userId }) : null
    if (!m) throw memberNotFound()
    return m
  }

  private async person(wsId: string, userId: string): Promise<Person> {
    const m = await this.find(wsId, userId)
    return toPerson(m, await this.users.findOneByOrFail({ id: userId }))
  }
}
