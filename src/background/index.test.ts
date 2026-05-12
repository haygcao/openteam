import { afterEach, describe, expect, it, vi } from 'vitest'

type RuntimeMessage = { type?: string; [key: string]: unknown }
type RuntimeListener = (
  message: RuntimeMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
) => boolean

async function setupBackgroundWithRouteHandler(handler: (message: RuntimeMessage) => unknown | Promise<unknown>) {
  vi.resetModules()
  vi.doMock('./messageRouter', () => ({
    createMessageRouter: () => handler,
  }))

  const runtimeListeners: RuntimeListener[] = []

  vi.stubGlobal('chrome', {
    runtime: {
      onInstalled: { addListener: vi.fn() },
      onMessage: { addListener: vi.fn(listener => runtimeListeners.push(listener)) },
      sendMessage: vi.fn().mockResolvedValue({ ok: true }),
      getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
    },
    storage: {
      local: {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined),
      },
    },
    tabs: {
      sendMessage: vi.fn().mockResolvedValue({ ok: true }),
      create: vi.fn().mockResolvedValue({}),
      onRemoved: { addListener: vi.fn() },
    },
    action: {
      onClicked: { addListener: vi.fn() },
    },
  })

  await import('./index')

  return { runtimeListeners }
}

function invokeRuntimeListener(listener: RuntimeListener, message: RuntimeMessage): Promise<unknown> {
  return new Promise(resolve => {
    const keepAlive = listener(message, { tab: { id: 900 } as chrome.tabs.Tab, frameId: 0 }, resolve)
    expect(keepAlive).toBe(true)
  })
}

describe('background entrypoint', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.doUnmock('./messageRouter')
  })

  it('converts synchronous message handler failures into safe responses without console output', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const harness = await setupBackgroundWithRouteHandler(() => {
      throw new Error('sync route failure')
    })
    expect(harness.runtimeListeners).toHaveLength(1)

    await expect(invokeRuntimeListener(harness.runtimeListeners[0], { type: 'BROKEN_MESSAGE' })).resolves.toEqual({
      ok: false,
      error: 'sync route failure',
    })
    expect(consoleError).not.toHaveBeenCalled()
    expect(consoleWarn).not.toHaveBeenCalled()
  })
})
