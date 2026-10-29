import * as Sentry from '@sentry/nestjs'

// Imported first by main.ts so Sentry can hook in before Nest loads. Off without SENTRY_DSN.
// No PII by default: request bodies, cookies and IPs are not sent.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0,
  })
}
