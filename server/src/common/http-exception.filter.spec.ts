import type { ArgumentsHost } from '@nestjs/common'
import { NotFoundException } from '@nestjs/common'
import { AppError, AppExceptionFilter } from './http-exception.filter'

function host() {
  const sent: { status?: number; body?: unknown } = {}
  const res = { status: (s: number) => { sent.status = s; return res }, json: (b: unknown) => { sent.body = b; return res } }
  const req = {
    method: 'POST',
    originalUrl: '/api/v1/auth/magic-link/verify?token=secret',
    id: 'req-1',
    headers: { cookie: 'rt=secret', authorization: 'Bearer secret' },
    body: { password: 'secret' },
  }
  const h = { switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }) } as unknown as ArgumentsHost
  return { h, sent }
}

describe('AppExceptionFilter reporting', () => {
  it('reports an unknown error once, with method, path and request id only', () => {
    const report = jest.fn()
    const { h, sent } = host()
    const boom = new Error('boom')
    new AppExceptionFilter(report).catch(boom, h)
    expect(sent.status).toBe(500)
    expect(report).toHaveBeenCalledTimes(1)
    expect(report).toHaveBeenCalledWith(boom, { method: 'POST', path: '/api/v1/auth/magic-link/verify', requestId: 'req-1' })
    expect(Object.keys(report.mock.calls[0][1])).toEqual(['method', 'path', 'requestId'])
  })

  it('never reports a 4xx', () => {
    const report = jest.fn()
    new AppExceptionFilter(report).catch(new AppError(409, 'conflict', 'x'), host().h)
    new AppExceptionFilter(report).catch(new NotFoundException(), host().h)
    expect(report).not.toHaveBeenCalled()
  })

  it('works without a reporter', () => {
    const { h, sent } = host()
    new AppExceptionFilter().catch(new Error('boom'), h)
    expect(sent.status).toBe(500)
  })
})
