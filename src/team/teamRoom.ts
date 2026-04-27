import { parseTeamMention } from './messageParser'
import type {
  ParsedTeamMention,
  TeamDelivery,
  TeamMessage,
  TeamRole,
  TeamRoleStatus,
  TeamRoomState,
  TeamSendMessageResult,
} from './types'

const DELIVERABLE_STATUSES = new Set<TeamRoleStatus>(['online', 'idle', 'sending', 'generating', 'error'])

function cloneState(state: TeamRoomState): TeamRoomState {
  return {
    ...state,
    roles: state.roles.map(role => ({ ...role })),
    messages: state.messages.map(message => ({ ...message })),
  }
}

function isDeliverable(role: TeamRole): boolean {
  return DELIVERABLE_STATUSES.has(role.status)
}

export function createTeamRoom(roomId: string, hostTabId: number, _createdAt: number) {
  const state: TeamRoomState = {
    roomId,
    hostTabId,
    roles: [],
    messages: [],
  }
  let roleSequence = 0
  let messageSequence = 0
  let replySequence = 0
  const seenRoleReplyKeys = new Set<string>()

  function nextMessageId(prefix: 'msg' | 'reply' | 'system', createdAt: number): string {
    if (prefix === 'reply') {
      replySequence += 1
      return `${prefix}-${createdAt}-${replySequence}`
    }

    messageSequence += 1
    return `${prefix}-${createdAt}-${messageSequence}`
  }

  function addSystemError(content: string, createdAt: number): TeamMessage {
    const message: TeamMessage = {
      id: nextMessageId('system', createdAt),
      roomId,
      from: 'system',
      target: 'none',
      content,
      createdAt,
      status: 'error',
    }
    state.messages.push(message)
    return message
  }

  function deliveriesFor(parsed: Extract<ParsedTeamMention, { ok: true }>): TeamDelivery[] {
    if (parsed.target === 'none') return []

    if (parsed.target === 'role') {
      const role = state.roles.find(item => item.id === parsed.roleId)
      return role && isDeliverable(role)
        ? [{ roleId: role.id, tabId: role.tabId, content: parsed.content }]
        : []
    }

    return state.roles
      .filter(isDeliverable)
      .map(role => ({ roleId: role.id, tabId: role.tabId, content: parsed.content }))
  }

  return {
    getState(): TeamRoomState {
      return cloneState(state)
    },

    setHostTab(hostTabId: number): void {
      state.hostTabId = hostTabId
    },

    addOpeningRole(name: string, tabId: number, conversationId: string, createdAt: number): TeamRole {
      roleSequence += 1
      const role: TeamRole = {
        id: `role-${createdAt}-${roleSequence}`,
        name,
        tabId,
        conversationId,
        status: 'opening',
        createdAt,
      }
      state.roles.push(role)
      return { ...role }
    },

    removeRole(roleId: string, createdAt: number): void {
      const role = state.roles.find(item => item.id === roleId)
      if (!role) return

      role.status = 'offline'
      role.lastMessageAt = createdAt
    },

    findRoleById(roleId: string): TeamRole | undefined {
      const role = state.roles.find(item => item.id === roleId)
      return role ? { ...role } : undefined
    },

    findRoleByTab(tabId: number): TeamRole | undefined {
      const role = state.roles.find(item => item.tabId === tabId)
      return role ? { ...role } : undefined
    },

    markRoleReady(tabId: number, conversationId: string, createdAt: number): TeamRole | undefined {
      const role = state.roles.find(item => item.tabId === tabId)
      if (!role) return undefined

      role.conversationId = conversationId
      role.status = 'online'
      role.lastMessageAt = createdAt
      delete role.lastError
      return { ...role }
    },

    markRoleStatus(tabId: number, status: TeamRoleStatus, createdAt: number, error?: string): TeamRole | undefined {
      const role = state.roles.find(item => item.tabId === tabId)
      if (!role) return undefined

      role.status = status
      role.lastMessageAt = createdAt
      if (error) role.lastError = error
      if (!error && status !== 'error') delete role.lastError
      return { ...role }
    },

    markTabClosed(tabId: number, createdAt: number): TeamRole | undefined {
      const role = state.roles.find(item => item.tabId === tabId)
      if (!role) return undefined

      role.status = 'offline'
      role.lastMessageAt = createdAt
      return { ...role }
    },

    sendUserMessage(raw: string, createdAt: number): TeamSendMessageResult {
      const parsed = parseTeamMention(raw, state.roles)
      if (!parsed.ok) {
        const message = addSystemError(parsed.error, createdAt)
        return { ok: false, message, error: parsed.error }
      }

      const deliveries = deliveriesFor(parsed)
      const message: TeamMessage = {
        id: nextMessageId('msg', createdAt),
        roomId,
        from: 'user',
        target: parsed.target,
        targetRoleName: parsed.target === 'role' ? parsed.targetRoleName : undefined,
        content: parsed.content,
        createdAt,
        status: 'sent',
      }

      state.messages.push(message)

      for (const delivery of deliveries) {
        const role = state.roles.find(item => item.id === delivery.roleId)
        if (role) {
          role.status = 'sending'
          role.lastMessageAt = createdAt
          delete role.lastError
        }
      }

      return { ok: true, messageId: message.id, deliveries }
    },

    recordRoleReply(tabId: number, content: string, createdAt: number, _messageId?: string): TeamMessage | undefined {
      const role = state.roles.find(item => item.tabId === tabId)
      if (!role) return undefined

      const trimmed = content.trim()
      if (!trimmed) return undefined

      const replyKey = `${role.id}:${trimmed}`
      if (seenRoleReplyKeys.has(replyKey)) return undefined
      seenRoleReplyKeys.add(replyKey)

      const message: TeamMessage = {
        id: nextMessageId('reply', createdAt),
        roomId,
        roleId: role.id,
        roleName: role.name,
        from: 'role',
        target: 'none',
        content: trimmed,
        createdAt,
        status: 'received',
      }
      state.messages.push(message)
      role.status = 'idle'
      role.lastMessageAt = createdAt
      delete role.lastError
      return { ...message }
    },
  }
}
