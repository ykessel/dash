import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AuthModule } from './auth/auth.module'
import { ClockModule } from './common/clock'
import { loadEnv } from './config/env'
import { DbModule } from './db/db.module'
import { HealthModule } from './health/health.module'
import { MailModule } from './mail/mail.module'
import { UsersModule } from './users/users.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: loadEnv }),
    ClockModule,
    DbModule,
    MailModule,
    HealthModule,
    UsersModule,
    AuthModule,
  ],
})
export class AppModule {}
