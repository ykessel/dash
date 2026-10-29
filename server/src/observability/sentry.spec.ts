import * as Sentry from '@sentry/nestjs'
import { scrubEvent, sentryOptions } from './sentry'

describe('sentry options', () => {
  it('collects no bodies, cookies, headers, query strings, user info or local variables', () => {
    const o = sentryOptions('https://k@o0.ingest.sentry.io/0', 'production')
    expect(o.dataCollection).toMatchObject({
      httpBodies: [],
      cookies: false,
      userInfo: false,
      urlQueryParams: false,
      httpHeaders: { request: false, response: false },
      databaseQueryData: false,
      stackFrameVariables: false,
    })
    expect(o.beforeSend).toBe(scrubEvent)
  })

  it('scrubEvent keeps only the method and the path of a request, and drops the user', () => {
    const e = scrubEvent({
      request: {
        method: 'POST',
        url: 'https://app.pane.dev/api/v1/auth/login?code=secret-code',
        data: '{"password":"secret-pw"}',
        cookies: { pane_rt: 'secret-rt' },
        query_string: 'code=secret-code',
        headers: { cookie: 'pane_rt=secret-rt' },
      },
      user: { ip_address: '1.2.3.4' },
    } as unknown as Sentry.ErrorEvent)
    expect(e).toEqual({ request: { method: 'POST', url: 'https://app.pane.dev/api/v1/auth/login' } })
  })

  it('an exception captured during a login request leaves without the password, refresh cookie, query or IP', async () => {
    const sent: unknown[] = []
    Sentry.init({
      ...sentryOptions('https://k@o0.ingest.sentry.io/0', 'test'),
      defaultIntegrations: false,
      integrations: [Sentry.requestDataIntegration()],
      transport: () => ({ send: async env => { sent.push(env); return {} }, flush: async () => true }),
    })
    try {
      await Sentry.withIsolationScope(async scope => {
        scope.setSDKProcessingMetadata({
          normalizedRequest: {
            method: 'POST',
            url: 'https://app.pane.dev/api/v1/auth/login?code=secret-code',
            query_string: 'code=secret-code',
            data: '{"email":"a@b.c","password":"secret-pw"}',
            cookies: { pane_rt: 'secret-rt' },
            headers: { cookie: 'pane_rt=secret-rt', authorization: 'Bearer secret-at' },
          },
          ipAddress: '1.2.3.4',
        })
        Sentry.captureException(new Error('db blip'))
      })
      await Sentry.flush(1000)
      const out = JSON.stringify(sent)
      expect(out).toContain('db blip')
      for (const s of ['secret-pw', 'secret-rt', 'secret-code', 'secret-at', '1.2.3.4']) expect(out).not.toContain(s)
    } finally {
      await Sentry.close()
    }
  })
})
