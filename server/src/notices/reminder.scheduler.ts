import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Env } from '../config/env'
import { RemindersService } from './reminders.service'

/**
 * Calls RemindersService.tick on a timer (REMINDER_TICK_MS, 0 = off). A tick never overlaps the
 * previous one, and a failing tick is logged and retried next time. Several instances are safe:
 * reminders_sent hands each reminder to exactly one of them.
 */
@Injectable()
export class ReminderScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger(ReminderScheduler.name)
  private timer?: ReturnType<typeof setInterval>
  private running = false

  constructor(
    private readonly reminders: RemindersService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onApplicationBootstrap(): void {
    const ms = this.config.get('REMINDER_TICK_MS', { infer: true })
    if (ms > 0) this.timer = setInterval(() => void this.run(), ms)
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }

  private async run(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      await this.reminders.tick()
    } catch (err) {
      this.log.error(`Reminder tick failed: ${(err as Error).message}`)
    } finally {
      this.running = false
    }
  }
}
