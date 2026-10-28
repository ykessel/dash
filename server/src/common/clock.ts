import { Global, Module } from '@nestjs/common'

/** Injected wherever "now" decides an outcome (expiries, rotation grace), so tests can move time. */
export const CLOCK = Symbol('CLOCK')

export interface Clock {
  now(): Date
}

export const systemClock: Clock = { now: () => new Date() }

@Global()
@Module({ providers: [{ provide: CLOCK, useValue: systemClock }], exports: [CLOCK] })
export class ClockModule {}
