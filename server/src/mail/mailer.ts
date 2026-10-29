export const MAILER = Symbol('MAILER')

export interface Mail {
  to: string
  subject: string
  text: string
  html: string
}

export interface Mailer {
  send(m: Mail): Promise<void>
}
