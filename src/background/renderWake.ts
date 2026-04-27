export const RENDER_WAKE_DELAYS_MS = [5000, 15000, 30000]
export const RENDER_WAKE_VISIBLE_MS = 1800

interface RenderWakeTabsApi {
  update(tabId: number, updateProperties: { active: boolean }): Promise<unknown>
}

interface ScheduledWake {
  cancelled: boolean
  timers: ReturnType<typeof setTimeout>[]
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

export function createRenderWakeScheduler(tabs: RenderWakeTabsApi) {
  const scheduledByTab = new Map<number, ScheduledWake>()

  async function wakeOnce(tabId: number, hostTabId: number, scheduled: ScheduledWake): Promise<void> {
    if (scheduled.cancelled) return
    await tabs.update(tabId, { active: true })
    await wait(RENDER_WAKE_VISIBLE_MS)
    if (!scheduled.cancelled && hostTabId >= 0 && hostTabId !== tabId) {
      await tabs.update(hostTabId, { active: true })
    }
  }

  return {
    schedule(tabId: number, hostTabId: number): void {
      this.cancel(tabId)

      const scheduled: ScheduledWake = { cancelled: false, timers: [] }
      scheduledByTab.set(tabId, scheduled)

      for (const delay of RENDER_WAKE_DELAYS_MS) {
        const timer = setTimeout(() => {
          wakeOnce(tabId, hostTabId, scheduled).catch(() => undefined)
        }, delay)
        scheduled.timers.push(timer)
      }
    },

    cancel(tabId: number): void {
      const scheduled = scheduledByTab.get(tabId)
      if (!scheduled) return

      scheduled.cancelled = true
      for (const timer of scheduled.timers) clearTimeout(timer)
      scheduledByTab.delete(tabId)
    },
  }
}
