import { describe, expect, it, vi } from 'vitest'
import { RENDER_WAKE_DELAYS_MS, RENDER_WAKE_VISIBLE_MS, createRenderWakeScheduler } from './renderWake'

describe('createRenderWakeScheduler', () => {
  it('does not activate the role tab immediately after scheduling', async () => {
    vi.useFakeTimers()
    const update = vi.fn<[number, { active: boolean }], Promise<unknown>>().mockResolvedValue({})
    const scheduler = createRenderWakeScheduler({ update })

    scheduler.schedule(101, 10)
    await vi.advanceTimersByTimeAsync(RENDER_WAKE_DELAYS_MS[0] - 1)

    expect(update).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('briefly activates the role tab after the first render delay and restores the host tab', async () => {
    vi.useFakeTimers()
    const update = vi.fn<[number, { active: boolean }], Promise<unknown>>().mockResolvedValue({})
    const scheduler = createRenderWakeScheduler({ update })

    scheduler.schedule(101, 10)
    await vi.advanceTimersByTimeAsync(RENDER_WAKE_DELAYS_MS[0])
    expect(update).toHaveBeenCalledWith(101, { active: true })

    await vi.advanceTimersByTimeAsync(RENDER_WAKE_VISIBLE_MS)
    expect(update).toHaveBeenLastCalledWith(10, { active: true })
    vi.useRealTimers()
  })

  it('cancels scheduled render wakes after a reply arrives', async () => {
    vi.useFakeTimers()
    const update = vi.fn<[number, { active: boolean }], Promise<unknown>>().mockResolvedValue({})
    const scheduler = createRenderWakeScheduler({ update })

    scheduler.schedule(101, 10)
    scheduler.cancel(101)
    await vi.advanceTimersByTimeAsync(RENDER_WAKE_DELAYS_MS[0] + RENDER_WAKE_VISIBLE_MS)

    expect(update).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
