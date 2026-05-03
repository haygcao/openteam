// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import type { RoleToBackgroundMessage } from '../group/runtimeProtocol'
import { createReplyObserver } from './replyObserver'
import type { RoleSession } from './roleSession'
import type { ChatSiteAdapter } from './sites/types'

describe('createReplyObserver', () => {
  it('uses timeout compensation to report a visible reply instead of marking the role as failed', async () => {
    vi.useFakeTimers()
    document.body.innerHTML = '<message-content id="old">旧回复</message-content>'

    const sentMessages: RoleToBackgroundMessage[] = []
    const roleSession = createFakeRoleSession()
    const adapter = createFakeAdapter()
    const reportRoleError = vi.fn()
    const observer = createReplyObserver({
      siteAdapter: adapter,
      roleSession,
      log: createFakeLog(),
      sendRuntimeMessage: async message => {
        sentMessages.push(message)
        return { ok: true } as never
      },
      reportRoleError,
    })

    observer.capturePromptReplyBaseline('msg-1')
    roleSession.startPrompt('msg-1', 'attempt-1')
    document.body.insertAdjacentHTML('beforeend', '<message-content id="new">新的回复</message-content>')
    observer.startReplyPolling('msg-1', 'attempt-1')

    await vi.advanceTimersByTimeAsync(120_000)

    expect(sentMessages).toContainEqual({
      type: 'TEAM_ROLE_REPLY',
      chatId: 'chat-1',
      roleId: 'role-1',
      messageId: 'msg-1',
      replyAttemptId: 'attempt-1',
      content: '新的回复',
      contentFormat: undefined,
      conversationId: 'conv-1',
      conversationUrl: 'https://gemini.google.com/app/conv-1',
    })
    expect(sentMessages).not.toContainEqual(expect.objectContaining({ type: 'TEAM_ROLE_STATUS', status: 'error' }))
    expect(reportRoleError).not.toHaveBeenCalled()

    vi.useRealTimers()
  })
})

function createFakeRoleSession(): RoleSession {
  let activeMessageId: string | undefined
  let activeReplyAttemptId: string | undefined

  return {
    getAssignedRole: () => ({ chatId: 'chat-1', roleId: 'role-1', roleName: '工程师' }),
    getActivePrompt: () => (activeMessageId ? { messageId: activeMessageId, replyAttemptId: activeReplyAttemptId } : undefined),
    getActiveMessageId: () => activeMessageId,
    getActiveReplyAttemptId: () => activeReplyAttemptId,
    getAssignedChatId: () => 'chat-1',
    assignRole: vi.fn(),
    startPrompt(messageId, replyAttemptId): void {
      activeMessageId = messageId
      activeReplyAttemptId = replyAttemptId
    },
    clearActivePrompt(messageId): string | undefined {
      if (messageId && activeMessageId !== messageId) return activeReplyAttemptId
      const replyAttemptId = activeReplyAttemptId
      activeMessageId = undefined
      activeReplyAttemptId = undefined
      return replyAttemptId
    },
  }
}

function createFakeAdapter(): ChatSiteAdapter {
  return {
    id: 'gemini',
    getConversationSnapshot: () => ({ conversationId: 'conv-1', conversationUrl: 'https://gemini.google.com/app/conv-1' }),
    getConversationId: () => 'conv-1',
    getResponseContainers: () => [...document.querySelectorAll('message-content')],
    getAllAssistantReplies: () => [...document.querySelectorAll('message-content')].map(element => element.textContent ?? '').filter(Boolean),
    readResponseText: node => node.textContent ?? '',
    findResponseContainer: element => element?.closest('message-content') ?? null,
    isGenerating: () => true,
    stopGenerating: vi.fn(async () => true),
    fillAndSend: vi.fn(),
    collectPromptDiagnostics: () => ({}),
  }
}

function createFakeLog() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}
