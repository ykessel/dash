import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, MoreThan, type Repository } from 'typeorm'
import { randomToken, sha256, tokenError } from '../auth/auth-tokens.service'
import type { Actor } from '../common/actor.decorator'
import { CLOCK, type Clock } from '../common/clock'
import { AppError } from '../common/http-exception.filter'
import type { Env } from '../config/env'
import { MailService } from '../mail/mail.service'
import { normalizeEmail } from '../users/email'
import { UsersService } from '../users/users.service'
import type { Team } from './enums'
import { Invitation } from './invitation.entity'
import { MembersService } from './members.service'
import { Membership } from './membership.entity'
import type { Person } from './person'
import { UUID } from './workspace-member.guard'
import { Workspace } from './workspace.entity'
import type { WorkspaceSummary } from './workspaces.service'

const INVITE_TTL = 7 * 24 * 3600_000

export interface InvitationView {
  id: string
  email: string
  role: 'admin' | 'member'
  team: Team
  title: string
  expiresAt: Date
}

const view = (i: Invitation): InvitationView => ({ id: i.id, email: i.email, role: i.role, team: i.team, title: i.title, expiresAt: i.expiresAt })
const inviteNotFound = () => new AppError(404, 'invite_not_found', 'That invite doesn’t exist.')

/** Email invites. Only the token's hash is stored; receiving the email proves the address. */
@Injectable()
export class InvitationsService {
  constructor(
    @InjectRepository(Invitation) private readonly repo: Repository<Invitation>,
    @InjectRepository(Workspace) private readonly workspaces: Repository<Workspace>,
    @InjectRepository(Membership) private readonly memberships: Repository<Membership>,
    private readonly users: UsersService,
    private readonly members: MembersService,
    private readonly mail: MailService,
    private readonly config: ConfigService<Env, true>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Mails an invite. Inviting the same address again replaces the pending one. */
  async create(wsId: string, input: { email: string; role: 'admin' | 'member'; team: Team; title: string }, by: Membership): Promise<InvitationView> {
    const email = normalizeEmail(input.email)
    const existing = await this.users.findByEmail(email)
    if (existing && (await this.memberships.existsBy({ workspaceId: wsId, userId: existing.id }))) {
      throw new AppError(409, 'already_member', 'That person is already in this workspace.', 'email')
    }
    await this.repo.delete({ workspaceId: wsId, email, acceptedAt: IsNull() })
    const raw = randomToken()
    const { identifiers } = await this.repo.insert({
      workspaceId: wsId,
      email,
      role: input.role,
      team: input.team,
      title: input.title,
      tokenHash: sha256(raw),
      invitedBy: by.userId,
      expiresAt: new Date(this.clock.now().getTime() + INVITE_TTL),
    })
    const workspace = await this.workspaces.findOneByOrFail({ id: wsId })
    const inviter = await this.users.findById(by.userId)
    const link = `${this.config.get('APP_URL', { infer: true })}/#/invite?token=${raw}`
    await this.mail.sendInvite(email, workspace.name, inviter?.name ?? 'Someone', link)
    return view(await this.repo.findOneByOrFail({ id: identifiers[0].id as string }))
  }

  /** Invites not yet accepted and not expired, oldest first. */
  async list(wsId: string): Promise<InvitationView[]> {
    const rows = await this.repo.find({
      where: { workspaceId: wsId, acceptedAt: IsNull(), expiresAt: MoreThan(this.clock.now()) },
      order: { createdAt: 'ASC' },
    })
    return rows.map(view)
  }

  async revoke(wsId: string, id: string): Promise<void> {
    if (!UUID.test(id)) throw inviteNotFound()
    const res = await this.repo.delete({ id, workspaceId: wsId, acceptedAt: IsNull() })
    if (!res.affected) throw inviteNotFound()
  }

  /** Joins the signed-in user to the workspace if the invite was sent to their address. */
  async accept(raw: string, actor: Actor): Promise<{ workspace: WorkspaceSummary; member: Person }> {
    const row = await this.repo.findOneBy({ tokenHash: sha256(raw) })
    if (!row) throw tokenError('token_invalid')
    if (row.acceptedAt) throw tokenError('token_used')
    const now = this.clock.now()
    if (row.expiresAt.getTime() <= now.getTime()) throw tokenError('token_expired')
    const user = await this.users.findById(actor.userId)
    if (!user || normalizeEmail(user.email) !== normalizeEmail(row.email)) {
      throw new AppError(403, 'invite_email_mismatch', 'This invite was sent to a different email. Sign in with that address to accept it.')
    }
    if (await this.memberships.existsBy({ workspaceId: row.workspaceId, userId: user.id })) {
      throw new AppError(409, 'already_member', 'You’re already in this workspace.')
    }
    // Conditional update: of two accepts racing for one invite, only one wins.
    const res = await this.repo.update({ id: row.id, acceptedAt: IsNull() }, { acceptedAt: now })
    if (!res.affected) throw tokenError('token_used')
    await this.users.markVerified(user.id)
    const member = await this.members.addMember(row.workspaceId, user.id, { role: row.role, team: row.team, title: row.title }, actor)
    const w = await this.workspaces.findOneByOrFail({ id: row.workspaceId })
    return { workspace: { id: w.id, name: w.name, slug: w.slug }, member }
  }
}
