import { Module } from '@nestjs/common'
import { NotificationsModule } from '../notifications/notifications.module'
import { PrefsModule } from '../prefs/prefs.module'
import { NoticeGate } from './notice-gate'

@Module({
  imports: [NotificationsModule, PrefsModule],
  providers: [NoticeGate],
  exports: [NoticeGate],
})
export class NoticesModule {}
