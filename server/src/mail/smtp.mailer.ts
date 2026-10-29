import { createTransport, type Transporter } from 'nodemailer'
import type { Mail, Mailer } from './mailer'

/** SMTP for every environment: Mailpit locally, Resend's SMTP relay in production. */
export class SmtpMailer implements Mailer {
  private readonly transport: Transporter

  constructor(url: string, private readonly from: string) {
    this.transport = createTransport(url)
  }

  async send(m: Mail): Promise<void> {
    await this.transport.sendMail({ from: this.from, to: m.to, subject: m.subject, text: m.text, html: m.html })
  }
}
