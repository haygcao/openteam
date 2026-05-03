import { describe, expect, it, vi } from 'vitest'
import { createDefaultStore } from '../group/store'
import type { GroupChat, GroupRole, OpenTeamStore } from '../group/types'

function createLegacyStore(): OpenTeamStore {
  const store = createDefaultStore()
  const chat: GroupChat = {
    id: 'chat-1',
    name: '旧协议群聊',
    mode: 'independent',
    roleIds: ['role-1'],
    messageIds: [],
    nextMessageSeq: 1,
    status: 'ready',
    createdAt: 10,
    updatedAt: 20,
  }
  const role: GroupRole = {
    id: 'role-1',
    chatId: chat.id,
    name: '工程师',
    status: 'ready',
    contextCursor: 0,
    createdAt: 11,
    updatedAt: 21,
  }
  store.currentChatId = chat.id
  store.chatOrder = [chat.id]
  store.chatsById[chat.id] = chat
  store.rolesById[role.id] = role
  return store
}

describe('background legacy adapter', () => {
  it('exposes legacy team routes and returns legacy state from host ready', async () => {
    vi.resetModules()
    const store = createLegacyStore()
    vi.doMock('../group/store', async importOriginal => {
      const actual = await importOriginal<typeof import('../group/store')>()
      return {
        ...actual,
        loadStore: vi.fn(async () => store),
      }
    })

    const { LEGACY_ROUTE_TYPES, createLegacyHandlers } = await import('./legacyAdapter')
    const routes = createLegacyHandlers({
      log: { debug: vi.fn() },
      routeMessage: vi.fn(),
    })

    expect(LEGACY_ROUTE_TYPES).toEqual([
      'TEAM_HOST_READY',
      'TEAM_GET_STATE',
      'TEAM_CREATE_ROLE',
      'TEAM_SEND_MESSAGE',
    ])
    expect(routes.map(route => route.type)).toEqual(LEGACY_ROUTE_TYPES)

    const hostReadyRoute = routes.find(route => route.type === 'TEAM_HOST_READY')
    const response = await hostReadyRoute?.handler({ type: 'TEAM_HOST_READY', hostTabId: 900 }, {})

    expect(response).toMatchObject({
      ok: true,
      store,
      state: {
        roomId: 'chat-1',
        roles: [{ id: 'role-1', name: '工程师', status: 'idle' }],
        messages: [],
      },
    })
  })
})
