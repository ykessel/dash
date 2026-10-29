import * as Sentry from '@sentry/nestjs'

/** What an unexpected (500) error is reported with: never bodies, cookies or headers. */
export interface ErrorContext { method: string; path: string; requestId?: string }
export type ErrorReporter = (err: unknown, ctx: ErrorContext) => void

export const ERROR_REPORTER = 'ERROR_REPORTER'

/** Sends to Sentry when `instrument.ts` initialised it (SENTRY_DSN set); otherwise does nothing. */
export const sentryReporter: ErrorReporter = (err, ctx) => {
  if (!Sentry.isInitialized()) return
  Sentry.withScope(scope => {
    scope.setTags({ method: ctx.method, path: ctx.path })
    if (ctx.requestId) scope.setTag('request_id', ctx.requestId)
    Sentry.captureException(err)
  })
}
