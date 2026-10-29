import type { EventKind, Hue } from '../common/enums'
import type { CalEvent } from './cal-event.entity'

/** The frontend's `CalEvent`. */
export interface CalEventView {
  id: string
  title: string
  date: string
  start: number
  dur: number
  where: string
  kind: EventKind
  hue: Hue
  project?: string
  people: string[]
}

export function toEventView(e: CalEvent, people: string[]): CalEventView {
  return {
    id: e.id,
    title: e.title,
    date: e.date,
    start: e.startMin,
    dur: e.durMin,
    where: e.location,
    kind: e.kind,
    hue: e.hue,
    ...(e.projectId ? { project: e.projectId } : {}),
    people,
  }
}
