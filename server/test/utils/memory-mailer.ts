import type { Mail, Mailer } from '../../src/mail/mailer'

/** Keeps sent mail in memory so tests can read the links inside. */
export class MemoryMailer implements Mailer {
  sent: Mail[] = []

  async send(m: Mail): Promise<void> {
    this.sent.push(m)
  }

  lastTo(email: string): Mail | undefined {
    return [...this.sent].reverse().find(m => m.to === email)
  }

  /** The `token` query param of the last link mailed to `email`. */
  tokenFor(email: string): string {
    const m = this.lastTo(email)
    const token = m?.text.match(/token=([A-Za-z0-9_-]+)/)?.[1]
    if (!token) throw new Error(`no token mailed to ${email}`)
    return token
  }

  clear() {
    this.sent = []
  }
}
