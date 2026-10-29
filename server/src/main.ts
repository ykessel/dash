import './instrument'
import 'reflect-metadata'
import type { INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import cookieParser from 'cookie-parser'
import type { Express } from 'express'
import helmet from 'helmet'
import { Logger } from 'nestjs-pino'
import { AppModule } from './app.module'
import { AppIoAdapter } from './realtime/io.adapter'
import { bootOrExit } from './common/boot'
import { AppExceptionFilter } from './common/http-exception.filter'
import type { Env } from './config/env'
import { ERROR_REPORTER, type ErrorReporter } from './observability/reporter'

/** Shared by main() and the e2e harness so tests run the same pipeline as production. */
export function configureApp(app: INestApplication): AppIoAdapter {
  const config = app.get<ConfigService<Env, true>>(ConfigService)
  const express = app.getHttpAdapter().getInstance() as Express
  // Behind Fly/Railway's proxy: req.ip is the client, so per-IP limits work.
  express.set('trust proxy', 1)
  express.disable('x-powered-by')
  app.setGlobalPrefix('api/v1')
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // React sets inline style attributes; the app's font comes from Google Fonts.
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        // Same origin covers the REST API and the socket (wss: on the same host).
        connectSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
      },
    },
  }))
  app.enableCors({ origin: config.get('APP_URL', { infer: true }), credentials: true })
  // One image: the built web app at `/`, the API under /api/v1. Hash routing needs only index.html.
  const web = config.get('WEB_DIR', { infer: true })
  if (web) (app as NestExpressApplication).useStaticAssets(web)
  const io = new AppIoAdapter(app, config.get('APP_URL', { infer: true }))
  app.useWebSocketAdapter(io)
  app.use(cookieParser())
  app.useLogger(app.get(Logger))
  app.useGlobalFilters(new AppExceptionFilter(app.get<ErrorReporter>(ERROR_REPORTER)))
  return io
}

async function main() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  const io = configureApp(app)
  // More than one instance: rooms and presence go through Redis.
  const redis = app.get<ConfigService<Env, true>>(ConfigService).get('REDIS_URL', { infer: true })
  if (redis) await io.connectToRedis(redis)
  // Fly stops machines with SIGINT/SIGTERM: close sockets and the DB pool cleanly.
  app.enableShutdownHooks()
  await app.listen(app.get<ConfigService<Env, true>>(ConfigService).get('PORT', { infer: true }))
}

if (require.main === module) void bootOrExit(main)
