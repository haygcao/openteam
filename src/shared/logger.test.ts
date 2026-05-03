import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLogger } from './logger'

describe('createLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('suppresses debug and info logs when debug logging is disabled', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const logger = createLogger('test', {}, { debugEnabled: false })

    logger.debug('hidden-debug', { chatId: 'chat-1' })
    logger.info('hidden-info', { roleId: 'role-1' })
    logger.warn('visible-warn', { messageId: 'msg-1' })

    expect(debug).not.toHaveBeenCalled()
    expect(info).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith('[OpenTeam][test] visible-warn', { messageId: 'msg-1' })
  })

  it('merges child context into emitted details', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
    const logger = createLogger('test', { chatId: 'chat-1' }, { debugEnabled: true }).child({ roleId: 'role-1' })

    logger.debug('event', { messageId: 'msg-1' })

    expect(debug).toHaveBeenCalledWith('[OpenTeam][test] event', {
      chatId: 'chat-1',
      roleId: 'role-1',
      messageId: 'msg-1',
    })
  })
})
