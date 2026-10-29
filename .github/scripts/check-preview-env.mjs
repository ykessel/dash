// Fails the preview with a message naming each bad secret. Never prints any part of a value:
// only what shape it has.
const bad = []
const url = process.env.SMTP_URL_IN ?? ''
let parsed = null
try {
  parsed = new URL(url)
} catch {
  /* reported below */
}
if (!parsed) {
  const shape = !url ? 'it is empty'
    : /^\s|\s$/.test(url) ? 'it has spaces or a newline around it'
    : /^["']/.test(url) ? 'it is wrapped in quotes'
    : !url.includes('://') ? 'it has no scheme; expected smtps://resend:<API_KEY>@smtp.resend.com:465'
    : 'it does not parse as a URL'
  bad.push(`PREVIEW_SMTP_URL is not a URL: ${shape}`)
} else if (!/^smtps?:$/.test(parsed.protocol)) {
  bad.push('PREVIEW_SMTP_URL must start with smtp:// or smtps://')
}
if ((process.env.JWT_SECRET_IN ?? '').length < 32) bad.push('PREVIEW_JWT_SECRET is shorter than 32 characters')
for (const b of bad) console.log(`::error::${b}`)
process.exit(bad.length ? 1 : 0)
