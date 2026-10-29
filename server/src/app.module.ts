import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { ThrottlerModule } from '@nestjs/throttler'
import { AuthModule } from './auth/auth.module'
import { ClockModule } from './common/clock'
import { DomainEventsModule } from './common/domain-events'
import { AppThrottlerGuard, throttlers } from './common/throttle-key'
import { loadEnv } from './config/env'
import { DbModule } from './db/db.module'
import { HealthModule } from './health/health.module'
import { MailModule } from './mail/mail.module'
import { CalendarModule } from './calendar/calendar.module'
import { FocusModule } from './focus/focus.module'
import { NotificationsModule } from './notifications/notifications.module'
import { PrefsModule } from './prefs/prefs.module'
import { ProjectsModule } from './projects/projects.module'
import { RealtimeModule } from './realtime/realtime.module'
import { TasksModule } from './tasks/tasks.module'
import { UsersModule } from './users/users.module'
import { WorkspacesModule } from './workspaces/workspaces.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: loadEnv }),
    ThrottlerModule.forRoot(throttlers),
    ClockModule,
    EventEmitterModule.forRoot(),
    DomainEventsModule,
    DbModule,
    MailModule,
    HealthModule,
    UsersModule,
    AuthModule,
    WorkspacesModule,
    RealtimeModule,
    ProjectsModule,
    TasksModule,
    CalendarModule,
    NotificationsModule,
    FocusModule,
    PrefsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
export class AppModule {}
