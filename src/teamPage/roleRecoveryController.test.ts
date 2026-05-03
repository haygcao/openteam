// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultStore } from '../group/store'
import type { GroupChat, GroupRole, OpenTeamStore } from '../group/types'
import { createTeamPageState } from './appState'
import { createRoleRecoveryController } from './roleRecoveryController'

describe('createRoleRecoveryController', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('polls the background store while waiting for recovered roles to become ready', async () => {
    const chat = makeChat('chat-1', ['role-1'])
    const role = makeRole(chat.id, 'role-1', '工程师', 'loading')
    const store: OpenTeamStore = {
      ...createDefaultStore(),
      currentChatId: chat.id,
      chatOrder: [chat.id],
      chatsById: { [chat.id]: chat },
      rolesById: { [role.id]: role },
    }
    const refreshStore = vi.fn(async () => {
      store.rolesById[role.id] = { ...store.rolesById[role.id], status: 'ready' }
    })
    let settled = false

    createRoleRecoveryController({
      state: createTeamPageState(),
      getStore: () => store,
      getCurrentRoles: () => [store.rolesById[role.id]],
      refreshStore,
      switchChat: vi.fn(),
      renderComposerState: vi.fn(),
      setWindowMinimized: vi.fn(),
      iframeHost: {
        focusRoleFrame: vi.fn(() => false),
        recoverRole: vi.fn(),
      },
      runCommand: vi.fn(async () => undefined),
      showError: vi.fn(),
      log: { info: vi.fn() },
    })
      .reconnectRolesForSend(chat, [role])
      .then(() => {
        settled = true
      })

    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(1000)

    expect(refreshStore).toHaveBeenCalledWith(false)
    expect(settled).toBe(true)
  })
})

function makeChat(id: string, roleIds: string[]): GroupChat {
  return {
    id,
    name: '群聊',
    mode: 'independent',
    roleIds,
    messageIds: [],
    nextMessageSeq: 1,
    status: 'running',
    createdAt: 1,
    updatedAt: 1,
  }
}

function makeRole(chatId: string, id: string, name: string, status: GroupRole['status']): GroupRole {
  return {
    id,
    chatId,
    name,
    status,
    contextCursor: 0,
    createdAt: 1,
    updatedAt: 1,
  }
}
