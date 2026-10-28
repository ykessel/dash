import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { loadEnv } from './config/env'
import { DbModule } from './db/db.module'
import { HealthModule } from './health/health.module'

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: loadEnv }), DbModule, HealthModule],
})
export class AppModule {}
