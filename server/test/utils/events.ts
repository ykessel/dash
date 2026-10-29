import { EventEmitter2 } from '@nestjs/event-emitter'
import type { DomainEvent } from '../../src/common/domain-events'
import type { TestApp } from './app'

/** Collects every published domain event. Empty the array in `beforeEach`. */
export function captureEvents(t: TestApp): DomainEvent[] {
  const seen: DomainEvent[] = []
  t.app.get(EventEmitter2).on('domain', (e: DomainEvent) => seen.push(e))
  return seen
}
