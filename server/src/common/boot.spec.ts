import { bootOrExit } from './boot'

describe('bootOrExit', () => {
  it('exits 1 when boot fails, even if something swallows unhandled rejections (Sentry does)', async () => {
    const exit = jest.fn()
    const log = jest.fn()
    await bootOrExit(() => Promise.reject(new Error('redis down')), exit, log)
    expect(exit).toHaveBeenCalledWith(1)
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ message: 'redis down' }))
  })

  it('does not exit when boot succeeds', async () => {
    const exit = jest.fn()
    await bootOrExit(() => Promise.resolve(), exit, jest.fn())
    expect(exit).not.toHaveBeenCalled()
  })
})
