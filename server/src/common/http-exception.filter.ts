import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common'
import type { Request, Response } from 'express'
import type { ErrorReporter } from '../observability/reporter'

/** Form fields an error can point at; anything else is reported without a field. */
export const ERROR_FIELDS = [
  'email', 'password', 'name', 'team', 'title', 'city', 'tz', 'capacity', 'role', 'presence', 'note',
  'desc', 'hue', 'icon', 'status', 'start', 'due', 'lead', 'members', 'userIds', 'version', 'done',
  'project', 'assignee', 'priority', 'estimate', 'beforeId', 'text',
  'date', 'dur', 'where', 'kind', 'people', 'from', 'to',
  'plannedSec', 'actualSec', 'label', 'taskId', 'notify', 'look', 'range', 'session', 'pause', 'avatarSkin', 'mentions',
] as const
export type ErrorField = (typeof ERROR_FIELDS)[number]

/** Error with a stable `code` the client can switch on, and an optional form field to highlight. */
export class AppError extends HttpException {
  constructor(status: number, readonly code: string, message: string, readonly field?: ErrorField) {
    super({ code, message, field }, status)
  }
}

/** Ends a browser navigation (not an XHR) by sending it somewhere else instead of a JSON error. */
export class RedirectError extends HttpException {
  constructor(readonly url: string) {
    super('Redirect', HttpStatus.FOUND)
  }
}

const CODES: Record<number, string> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  429: 'rate_limited',
}

/** Every error leaves the API as `{ code, message, field? }`. */
@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly log = new Logger('Error')

  constructor(private readonly report?: ErrorReporter) {}

  catch(err: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>()
    if (err instanceof RedirectError) {
      res.redirect(302, err.url)
      return
    }
    if (err instanceof AppError) {
      res.status(err.getStatus()).json({ code: err.code, message: err.message, ...(err.field ? { field: err.field } : {}) })
      return
    }
    if (err instanceof HttpException) {
      const status = err.getStatus()
      const body = err.getResponse()
      const message = typeof body === 'string' ? body : Array.isArray((body as { message?: unknown }).message)
        ? ((body as { message: string[] }).message).join(', ')
        : String((body as { message?: unknown }).message ?? err.message)
      res.status(status).json({ code: CODES[status] ?? 'error', message })
      return
    }
    this.log.error(err)
    const req = host.switchToHttp().getRequest<Request & { id?: string }>()
    // Only where and which request: the query string, body and cookies may hold secrets.
    this.report?.(err, { method: req.method, path: req.originalUrl.split('?')[0], requestId: req.id })
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ code: 'internal', message: 'Something went wrong.' })
  }
}
