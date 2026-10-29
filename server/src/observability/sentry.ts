import type { ErrorEvent, NodeOptions } from '@sentry/nestjs'

/**
 * Sentry 11 collects request bodies, cookies, query strings and the client IP unless told not to,
 * and a 500 during /auth/login or /auth/refresh would then carry a password or a refresh token.
 * Collect none of it; `scrubEvent` is the second wall.
 */
export function sentryOptions(dsn: string, environment: string | undefined): NodeOptions {
  return {
    dsn,
    environment,
    tracesSampleRate: 0,
    dataCollection: {
      httpBodies: [],
      cookies: false,
      userInfo: false,
      urlQueryParams: false,
      httpHeaders: { request: false, response: false },
      databaseQueryData: false,
      stackFrameVariables: false,
    },
    beforeSend: scrubEvent,
  }
}

/** Keeps only the request's method and path (no query), and no user. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const { request, user: _user, ...rest } = event
  if (!request) return rest
  return { ...rest, request: { method: request.method, url: request.url?.split('?')[0] } }
}
