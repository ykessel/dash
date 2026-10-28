import 'reflect-metadata'
import type { INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import cookieParser from 'cookie-parser'
import { AppModule } from './app.module'
import { AppExceptionFilter } from './common/http-exception.filter'

/** Shared by main() and the e2e harness so tests run the same pipeline as production. */
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api/v1')
  app.use(cookieParser())
  app.useGlobalFilters(new AppExceptionFilter())
}

async function main() {
  const app = await NestFactory.create(AppModule)
  configureApp(app)
  await app.listen(Number(process.env.PORT ?? 3000))
}

if (require.main === module) void main()
