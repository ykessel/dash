import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { ThrottlerModule } from '@nestjs/throttler'
import { LoggerModule } from 'nestjs-pino'
import { AuthModule } from './auth/auth.module'
import { ClockModule } from './common/clock'
import { DomainEventsModule } from './common/domain-events'
import { AppThrottlerGuard, throttlers } from './common/throttle-key'
import { loadEnv, type Env } from './config/env'
import { DbModule } from './db/db.module'
import { HealthModule } from './health/health.module'
import { MailModule } from './mail/mail.module'
import { CalendarModule } from './calendar/calendar.module'
import { FocusModule } from './focus/focus.module'
import { InsightsModule } from './insights/insights.module'
import { NoticesModule } from './notices/notices.module'
import { NotificationsModule } from './notifications/notifications.module'
import { pinoOptions } from './observability/logger'
import { ERROR_REPORTER, sentryReporter } from './observability/reporter'
import { PrefsModule } from './prefs/prefs.module'
import { ProjectsModule } from './projects/projects.module'
import { RealtimeModule } from './realtime/realtime.module'
import { SnapshotModule } from './snapshot/snapshot.module'
import { TasksModule } from './tasks/tasks.module'
import { UsersModule } from './users/users.module'
import { WorkspacesModule } from './workspaces/workspaces.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: loadEnv }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        pinoOptions({ LOG_LEVEL: config.get('LOG_LEVEL', { infer: true }), NODE_ENV: config.get('NODE_ENV', { infer: true }) }),
    }),
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
    NoticesModule,
    FocusModule,
    PrefsModule,
    SnapshotModule,
    InsightsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: ERROR_REPORTER, useValue: sentryReporter },
  ],
})
export class AppModule {}
