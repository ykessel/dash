import * as Sentry from '@sentry/nestjs'
import { sentryOptions } from './observability/sentry'

// Imported first by main.ts so Sentry can hook in before Nest loads. Off without SENTRY_DSN.
// Collects no bodies, cookies, headers, query strings or IPs: see sentryOptions.
if (process.env.SENTRY_DSN) Sentry.init(sentryOptions(process.env.SENTRY_DSN, process.env.NODE_ENV))
