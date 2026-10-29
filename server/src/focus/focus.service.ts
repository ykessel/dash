import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, type Repository } from 'typeorm'
import type { Actor } from '../common/actor.decorator'
import { CLOCK, type Clock } from '../common/clock'
import { assertRange } from '../common/dates'
import { AppError } from '../common/http-exception.filter'
import { MembersService } from '../workspaces/members.service'
import { WorkspaceRefs } from '../workspaces/refs.service'
import { UUID } from '../workspaces/workspace-member.guard'
import { type FocusLog, FocusSession, type FocusSessionView, toFocusView } from './focus-session.entity'

const focusNotFound = () => new AppError(404, 'focus_not_found', 'That focus session doesn’t exist.')

@Injectable()
export class FocusService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(FocusSession) private readonly repo: Repository<FocusSession>,
    private readonly members: MembersService,
    private readonly refs: WorkspaceRefs,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Starts a block and shows me as focusing, with the label (or the length) as my note. */
  async start(wsId: string, input: { plannedSec: number; label: string; taskId?: string | null }, actor: Actor): Promise<FocusSessionView> {
    if (input.taskId) await this.refs.assertTask(wsId, input.taskId, 'taskId')
    const { identifiers } = await this.repo.insert({
      workspaceId: wsId,
      userId: actor.userId,
      taskId: input.taskId || null,
      label: input.label,
      plannedSec: input.plannedSec,
      startedAt: this.clock.now(),
    })
    const note = input.label || `${Math.round(input.plannedSec / 60)}-minute block`
    await this.members.setPresence(wsId, actor.userId, 'focus', note, actor)
    return toFocusView(await this.repo.findOneByOrFail({ id: identifiers[0].id as string }))
  }

  /** Ends my block; if I'm still shown as focusing, I'm back online. */
  async end(wsId: string, id: string, actualSec: number, actor: Actor): Promise<FocusSessionView> {
    const s = UUID.test(id) ? await this.repo.findOneBy({ id, workspaceId: wsId, userId: actor.userId }) : null
    if (!s) throw focusNotFound()
    // Conditional on still being open: of two "end" calls, the second gets 409.
    const { affected } = await this.repo.createQueryBuilder()
      .update()
      .set({ actualSec, endedAt: this.clock.now() })
      .where('id = :id AND ended_at IS NULL', { id })
      .execute()
    if (!affected) throw new AppError(409, 'focus_ended', 'That focus session already ended.')
    const [me] = await this.ds.query(`SELECT presence FROM memberships WHERE workspace_id = $1 AND user_id = $2`, [wsId, actor.userId])
    if (me?.presence === 'focus') await this.members.setPresence(wsId, actor.userId, 'online', null, actor)
    return toFocusView(await this.repo.findOneByOrFail({ id }))
  }

  /** My finished focus, in minutes per day of my own time zone; without a range, every day (for the snapshot). */
  async log(wsId: string, userId: string, range?: { from: string; to: string }): Promise<FocusLog[]> {
    if (range) assertRange(range.from, range.to)
    return this.ds.query(
      `WITH me AS (SELECT tz FROM memberships WHERE workspace_id = $1 AND user_id = $2)
       SELECT to_char((f.started_at AT TIME ZONE me.tz)::date, 'YYYY-MM-DD') AS date,
              round(sum(f.actual_sec) / 60.0)::int AS minutes
       FROM focus_sessions f, me
       WHERE f.workspace_id = $1 AND f.user_id = $2 AND f.ended_at IS NOT NULL
         AND ($3::date IS NULL OR (f.started_at AT TIME ZONE me.tz)::date BETWEEN $3::date AND $4::date)
       GROUP BY 1 ORDER BY 1`,
      [wsId, userId, range?.from ?? null, range?.to ?? null],
    )
  }
}
