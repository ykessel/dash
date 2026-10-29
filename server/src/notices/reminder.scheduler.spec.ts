import { ReminderScheduler } from './reminder.scheduler'

describe('ReminderScheduler', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  const make = (ms: number, tick: () => Promise<unknown>) =>
    new ReminderScheduler({ tick } as never, { get: () => ms } as never)

  it('ticks every interval until shutdown', async () => {
    const tick = jest.fn().mockResolvedValue({})
    const s = make(1000, tick)
    s.onApplicationBootstrap()
    await jest.advanceTimersByTimeAsync(3000)
    expect(tick).toHaveBeenCalledTimes(3)
    s.onApplicationShutdown()
    await jest.advanceTimersByTimeAsync(3000)
    expect(tick).toHaveBeenCalledTimes(3)
  })

  it('does nothing when the interval is 0', async () => {
    const tick = jest.fn().mockResolvedValue({})
    make(0, tick).onApplicationBootstrap()
    await jest.advanceTimersByTimeAsync(10_000)
    expect(tick).not.toHaveBeenCalled()
  })

  it('skips a tick while the previous one still runs, and survives errors', async () => {
    let release!: () => void
    const tick = jest.fn()
      .mockImplementationOnce(() => new Promise(r => { release = () => r({}) }))
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValue({})
    const s = make(1000, tick)
    s.onApplicationBootstrap()
    await jest.advanceTimersByTimeAsync(3000)
    expect(tick).toHaveBeenCalledTimes(1)
    release()
    await jest.advanceTimersByTimeAsync(2000)
    expect(tick).toHaveBeenCalledTimes(3)
    s.onApplicationShutdown()
  })
})
