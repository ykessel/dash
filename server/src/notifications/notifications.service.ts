import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, type Repository } from 'typeorm'
import type { Actor } from '../common/actor.decorator'
import { CLOCK, type Clock } from '../common/clock'
import { DomainEvents } from '../common/domain-events'
import { type Notice, Notification, toNotice } from './notification.entity'

export const INBOX_SIZE = 50

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification) private readonly repo: Repository<Notification>,
    private readonly events: DomainEvents,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Stores a notice for one person and tells only their tabs. `actor` null = a system reminder. Rules live in NoticeGate. */
  async create(wsId: string, recipientId: string, actor: Actor | null, kind: string, text: string): Promise<Notice> {
    const { identifiers } = await this.repo.insert({
      workspaceId: wsId,
      recipientId,
      actorId: actor?.userId ?? null,
      kind,
      payload: { text },
      createdAt: this.clock.now(),
    })
    const notice = toNotice(await this.repo.findOneByOrFail({ id: identifiers[0].id as string }))
    this.events.publish('notification.created', wsId, actor ?? { userId: '' }, { notice }, recipientId)
    return notice
  }

  /** My newest notices in this workspace. */
  async list(wsId: string, userId: string): Promise<Notice[]> {
    const rows = await this.repo.find({
      where: { workspaceId: wsId, recipientId: userId },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: INBOX_SIZE,
    })
    return rows.map(toNotice)
  }

  async readAll(wsId: string, userId: string): Promise<void> {
    await this.repo.update({ workspaceId: wsId, recipientId: userId, readAt: IsNull() }, { readAt: this.clock.now() })
  }
}
