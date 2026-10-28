import type { Clock } from '../../src/common/clock'

/** Real time plus a manual offset, so tests can jump past expiries. */
export class FakeClock implements Clock {
  private offset = 0

  now(): Date {
    return new Date(Date.now() + this.offset)
  }

  advance(ms: number) {
    this.offset += ms
  }

  reset() {
    this.offset = 0
  }
}
