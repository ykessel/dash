import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Between, DataSource, In, IsNull, type Repository } from 'typeorm'
import type { Actor } from '../common/actor.decorator'
import { CLOCK, type Clock } from '../common/clock'
import { assertRange } from '../common/dates'
import { DomainEvents } from '../common/domain-events'
import type { EventKind, Hue } from '../common/enums'
import { AppError } from '../common/http-exception.filter'
import { WorkspaceRefs } from '../workspaces/refs.service'
import { UUID } from '../workspaces/workspace-member.guard'
import { CalEvent, EventAttendee } from './cal-event.entity'
import { type CalEventView, toEventView } from './event-view'

export interface EventInput {
  title: string
  date: string
  start: number
  dur: number
  where: string
  kind: EventKind
  hue: Hue
  project?: string | null
  people: string[]
}

export type EventPatch = Partial<EventInput>

const eventNotFound = () => new AppError(404, 'event_not_found', 'That event doesn’t exist.')

@Injectable()
export class CalendarService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(CalEvent) private readonly events: Repository<CalEvent>,
    @InjectRepository(EventAttendee) private readonly attendees: Repository<EventAttendee>,
    private readonly refs: WorkspaceRefs,
    private readonly bus: DomainEvents,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Live events between two dates, both inclusive, at most a year apart. */
  async list(wsId: string, from: string, to: string): Promise<CalEventView[]> {
    assertRange(from, to)
    const rows = await this.events.find({
      where: { workspaceId: wsId, date: Between(from, to), deletedAt: IsNull() },
      order: { date: 'ASC', startMin: 'ASC', id: 'ASC' },
    })
    return this.views(rows)
  }

  /** Every live event of the workspace (for the snapshot). */
  async all(wsId: string): Promise<CalEventView[]> {
    const rows = await this.events.find({ where: { workspaceId: wsId, deletedAt: IsNull() }, order: { date: 'ASC', startMin: 'ASC', id: 'ASC' } })
    return this.views(rows)
  }

  async create(wsId: string, input: EventInput, actor: Actor): Promise<CalEventView> {
    await this.assertRefs(wsId, input)
    const id = await this.ds.transaction(async em => {
      const { identifiers } = await em.insert(CalEvent, {
        workspaceId: wsId,
        title: input.title,
        date: input.date,
        startMin: input.start,
        durMin: input.dur,
        location: input.where,
        kind: input.kind,
        hue: input.hue,
        projectId: input.project || null,
        createdBy: actor.userId,
      })
      const eventId = identifiers[0].id as string
      await this.setPeople(em.getRepository(EventAttendee), eventId, input.people)
      return eventId
    })
    return this.publish('event.created', wsId, id, actor)
  }

  async update(wsId: string, id: string, patch: EventPatch, actor: Actor): Promise<CalEventView> {
    await this.find(wsId, id)
    await this.assertRefs(wsId, patch)
    const set: Partial<CalEvent> = {
      title: patch.title,
      date: patch.date,
      startMin: patch.start,
      durMin: patch.dur,
      location: patch.where,
      kind: patch.kind,
      hue: patch.hue,
      ...(patch.project !== undefined ? { projectId: patch.project || null } : {}),
    }
    const changes = Object.values(set).some(v => v !== undefined)
    if (!changes && !patch.people) return this.view(wsId, id)
    await this.ds.transaction(async em => {
      if (changes) await em.update(CalEvent, { id }, set)
      if (patch.people) await this.setPeople(em.getRepository(EventAttendee), id, patch.people)
    })
    return this.publish('event.updated', wsId, id, actor)
  }

  async remove(wsId: string, id: string, actor: Actor): Promise<void> {
    await this.find(wsId, id)
    await this.events.update({ id }, { deletedAt: this.clock.now() })
    this.bus.publish('event.deleted', wsId, actor, { id })
  }

  /** Undo of a delete; others see the event come back as `event.created`. */
  async restore(wsId: string, id: string, actor: Actor): Promise<CalEventView> {
    const e = UUID.test(id) ? await this.events.findOneBy({ id, workspaceId: wsId }) : null
    if (!e) throw eventNotFound()
    if (!e.deletedAt) return this.view(wsId, id)
    await this.events.update({ id }, { deletedAt: null })
    return this.publish('event.created', wsId, id, actor)
  }

  /** Tells the team about events changed outside this service (a project delete unlinks them). */
  async publishUpdated(wsId: string, ids: string[], actor: Actor): Promise<void> {
    for (const id of ids) await this.publish('event.updated', wsId, id, actor)
  }

  private async assertRefs(wsId: string, input: EventPatch) {
    if (input.people) await this.refs.assertMembers(wsId, input.people, 'people')
    if (input.project) await this.refs.assertProject(wsId, input.project, 'project')
  }

  private async setPeople(repo: Repository<EventAttendee>, eventId: string, people: string[]) {
    await repo.delete({ eventId })
    const ids = [...new Set(people)]
    if (ids.length) await repo.insert(ids.map(userId => ({ eventId, userId })))
  }

  private async find(wsId: string, id: string): Promise<CalEvent> {
    const e = UUID.test(id) ? await this.events.findOneBy({ id, workspaceId: wsId, deletedAt: IsNull() }) : null
    if (!e) throw eventNotFound()
    return e
  }

  private async view(wsId: string, id: string): Promise<CalEventView> {
    return (await this.views([await this.find(wsId, id)]))[0]
  }

  private async publish(type: 'event.created' | 'event.updated', wsId: string, id: string, actor: Actor): Promise<CalEventView> {
    const event = await this.view(wsId, id)
    this.bus.publish(type, wsId, actor, { event })
    return event
  }

  private async views(rows: CalEvent[]): Promise<CalEventView[]> {
    if (!rows.length) return []
    const people = await this.attendees.findBy({ eventId: In(rows.map(e => e.id)) })
    return rows.map(e => toEventView(e, people.filter(p => p.eventId === e.id).map(p => p.userId)))
  }
}
