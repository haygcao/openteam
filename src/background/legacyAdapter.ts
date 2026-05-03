import { loadStore } from '../group/store'
import type { GroupChat, GroupRole, OpenTeamStore } from '../group/types'
import type { BackgroundMessageRoute } from './messageRouter'
import { listHostTabIds, rememberHost, type RuntimeMessage } from './runtimeClient'
import type { RuntimeFrameRegistry } from './runtimeFrames'
import { getChatMessages, getChatRoles } from './storeAccess'

export const LEGACY_ROUTE_TYPES = [
  'TEAM_HOST_READY',
  'TEAM_GET_STATE',
  'TEAM_CREATE_ROLE',
  'TEAM_SEND_MESSAGE',
] as const

export interface LegacyAdapterDependencies {
  log: {
    debug(event: string, details?: Record<string, unknown>): void
  }
  routeMessage(message: RuntimeMessage, sender: chrome.runtime.MessageSender): Promise<unknown> | unknown
  runtimeFrames?: Pick<RuntimeFrameRegistry, 'getByRole'>
}

export function createLegacyHandlers(deps: LegacyAdapterDependencies): BackgroundMessageRoute[] {
  const handleLegacyHostReady = async (message: RuntimeMessage, sender: chrome.runtime.MessageSender) => {
    rememberHost(sender, message.hostTabId)
    const store = await loadStore()
    deps.log.debug('legacy:host-ready', { hostTabId: message.hostTabId, currentChatId: store.currentChatId })
    return { ok: true, store, state: toLegacyState(store, deps.runtimeFrames) }
  }

  const handleLegacyCreateRole = async (message: RuntimeMessage) => {
    const store = await loadStore()
    let chatId = store.currentChatId
    deps.log.debug('legacy:create-role', { hasCurrentChat: Boolean(chatId), name: message.name })
    if (!chatId) {
      const created = await deps.routeMessage({ type: 'GROUP_CHAT_CREATE', name: 'OpenTeam', mode: 'independent' }, {}) as { chat: GroupChat }
      chatId = created.chat.id
    }

    return deps.routeMessage({ type: 'GROUP_ROLE_CREATE', chatId, name: message.name }, {})
  }

  const handleLegacySendMessage = async (message: RuntimeMessage) => {
    const store = await loadStore()
    deps.log.debug('legacy:send-message', { currentChatId: store.currentChatId, rawLength: typeof message.raw === 'string' ? message.raw.length : undefined })
    if (!store.currentChatId) return { ok: false, error: '请先创建群聊' }
    return deps.routeMessage({ type: 'GROUP_MESSAGE_SEND', chatId: store.currentChatId, raw: message.raw }, {})
  }

  return [
    { type: 'TEAM_HOST_READY', handler: handleLegacyHostReady },
    { type: 'TEAM_GET_STATE', handler: handleLegacyHostReady },
    { type: 'TEAM_CREATE_ROLE', handler: handleLegacyCreateRole },
    { type: 'TEAM_SEND_MESSAGE', handler: handleLegacySendMessage },
  ]
}

export function toLegacyState(store: OpenTeamStore, runtimeFrames?: Pick<RuntimeFrameRegistry, 'getByRole'>) {
  const chat = store.currentChatId ? store.chatsById[store.currentChatId] : undefined
  const roles = chat ? getChatRoles(store, chat).map(role => {
    const binding = runtimeFrames?.getByRole(chat.id, role.id)
    return {
      id: role.id,
      name: role.name,
      tabId: binding?.tabId ?? -1,
      frameId: binding?.frameId,
      conversationId: role.geminiConversationId ?? '__default__',
      status: legacyStatus(role.status),
      createdAt: role.createdAt,
      lastMessageAt: role.lastReplyAt,
    }
  }) : []
  const messages = chat ? getChatMessages(store, chat).map(message => ({
    id: message.id,
    roomId: chat.id,
    roleId: message.roleId,
    roleName: message.roleName,
    from: message.type === 'assistant' ? 'role' : message.type,
    target: message.targetRoleIds && message.targetRoleIds.length > 0 ? message.targetRoleIds.length === roles.length ? 'all' : 'role' : 'none',
    targetRoleName: message.targetRoleIds?.length === 1 ? store.rolesById[message.targetRoleIds[0]]?.name : undefined,
    content: message.content,
    createdAt: message.createdAt,
    status: message.status,
  })) : []

  return { roomId: chat?.id ?? 'group-empty', hostTabId: listHostTabIds()[0] ?? -1, roles, messages }
}

function legacyStatus(status: GroupRole['status']): string {
  if (status === 'pending' || status === 'loading') return 'opening'
  if (status === 'ready') return 'idle'
  if (status === 'thinking') return 'generating'
  return 'error'
}
