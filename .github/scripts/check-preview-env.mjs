// Fails the preview with a message naming each bad secret, without printing any value.
const bad = []
const url = process.env.SMTP_URL_IN ?? ''
try {
  new URL(url)
} catch {
  // Only the part before the first ":" (e.g. "smtps"), so a stray quote or space shows.
  bad.push(`PREVIEW_SMTP_URL is not a URL; it starts with ${JSON.stringify(url.split(':')[0].slice(0, 8))}`)
}
if ((process.env.JWT_SECRET_IN ?? '').length < 32) bad.push('PREVIEW_JWT_SECRET is shorter than 32 characters')
for (const b of bad) console.log(`::error::${b}`)
process.exit(bad.length ? 1 : 0)
