import 'reflect-metadata'
import type { INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import cookieParser from 'cookie-parser'
import type { Express } from 'express'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { AppExceptionFilter } from './common/http-exception.filter'
import type { Env } from './config/env'

/** Shared by main() and the e2e harness so tests run the same pipeline as production. */
export function configureApp(app: INestApplication) {
  const config = app.get<ConfigService<Env, true>>(ConfigService)
  const express = app.getHttpAdapter().getInstance() as Express
  // Behind Fly/Railway's proxy: req.ip is the client, so per-IP limits work.
  express.set('trust proxy', 1)
  express.disable('x-powered-by')
  app.setGlobalPrefix('api/v1')
  app.use(helmet())
  app.enableCors({ origin: config.get('APP_URL', { infer: true }), credentials: true })
  app.use(cookieParser())
  app.useGlobalFilters(new AppExceptionFilter())
}

async function main() {
  const app = await NestFactory.create(AppModule)
  configureApp(app)
  await app.listen(app.get<ConfigService<Env, true>>(ConfigService).get('PORT', { infer: true }))
}

if (require.main === module) void main()
