import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import type { Actor } from '../common/actor.decorator'
import { NotificationsService } from '../notifications/notifications.service'
import { PrefsService } from '../prefs/prefs.service'
import type { Notify } from '../prefs/user-prefs.entity'

export type NoticeKind = 'mention' | 'assigned' | 'due' | 'meeting' | 'timesheet'

/** The Settings toggle that controls each kind. Assignment has no toggle, so it always arrives. */
export const NOTIFY_KEY: Record<NoticeKind, keyof Notify | null> = {
  mention: 'mentions',
  assigned: null,
  due: 'due',
  meeting: 'meetings',
  timesheet: null,
}

/** The one door for automatic notices: drops self-notices, non-members and kinds the person switched off. */
@Injectable()
export class NoticeGate {
  constructor(
    private readonly ds: DataSource,
    private readonly notifications: NotificationsService,
    private readonly prefs: PrefsService,
  ) {}

  /** `actor` null = a system reminder. Resolves true when the notice was stored. */
  async send(wsId: string, recipientId: string, actor: Actor | null, kind: NoticeKind, text: string): Promise<boolean> {
    if (actor && actor.userId === recipientId) return false
    const member = await this.ds.query(`SELECT 1 FROM memberships WHERE workspace_id = $1 AND user_id = $2`, [wsId, recipientId])
    if (!member.length) return false
    const key = NOTIFY_KEY[kind]
    if (key && !(await this.prefs.get(recipientId)).notify[key]) return false
    await this.notifications.create(wsId, recipientId, actor, kind, text)
    return true
  }
}
