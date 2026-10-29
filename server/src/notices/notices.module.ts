import { Module } from '@nestjs/common'
import { NotificationsModule } from '../notifications/notifications.module'
import { PrefsModule } from '../prefs/prefs.module'
import { NoticeGate } from './notice-gate'
import { ReminderScheduler } from './reminder.scheduler'
import { RemindersService } from './reminders.service'

@Module({
  imports: [NotificationsModule, PrefsModule],
  providers: [NoticeGate, RemindersService, ReminderScheduler],
  exports: [NoticeGate, RemindersService],
})
export class NoticesModule {}
