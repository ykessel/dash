import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Env } from '../config/env'
import { MailService } from './mail.service'
import { MAILER } from './mailer'
import { SmtpMailer } from './smtp.mailer'

@Global()
@Module({
  providers: [
    {
      provide: MAILER,
      inject: [ConfigService],
      useFactory: (c: ConfigService<Env, true>) => new SmtpMailer(c.get('SMTP_URL', { infer: true }), c.get('MAIL_FROM', { infer: true })),
    },
    MailService,
  ],
  exports: [MailService],
})
export class MailModule {}
