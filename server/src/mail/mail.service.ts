import { Inject, Injectable } from '@nestjs/common'
import { MAILER, type Mailer } from './mailer'

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** The transactional emails. Plain text carries the bare link so any client can open it. */
@Injectable()
export class MailService {
  constructor(@Inject(MAILER) private readonly mailer: Mailer) {}

  sendVerifyEmail(to: string, link: string) {
    return this.send(to, 'Confirm your email for Pane', 'Confirm your email address to finish setting up Pane.', 'Confirm email', link, 'This link works for 24 hours.')
  }

  sendPasswordReset(to: string, link: string) {
    return this.send(to, 'Reset your Pane password', 'Someone asked to reset the password for this account. If it was you, choose a new one.', 'Choose a new password', link, 'This link works for 30 minutes. If you didn’t ask for it, ignore this email.')
  }

  sendMagicLink(to: string, link: string) {
    return this.send(to, 'Your Pane sign-in link', 'Use this link to sign in to Pane.', 'Sign in', link, 'This link works for 15 minutes and only once.')
  }

  sendInvite(to: string, workspaceName: string, inviterName: string, link: string) {
    return this.send(to, `${inviterName} invited you to ${workspaceName} on Pane`, `${inviterName} invited you to join ${workspaceName} on Pane.`, `Join ${workspaceName}`, link, 'This invite works for 7 days.')
  }

  private send(to: string, subject: string, lead: string, action: string, link: string, foot: string) {
    return this.mailer.send({
      to,
      subject,
      text: `${lead}\n\n${action}: ${link}\n\n${foot}`,
      html: `<p>${esc(lead)}</p><p><a href="${esc(link)}">${esc(action)}</a></p><p style="color:#666">${esc(foot)}</p>`,
    })
  }
}
