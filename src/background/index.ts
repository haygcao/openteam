import { createTeamRoom } from '../team/teamRoom'
import { assertRoleDeliveryResponse } from '../team/deliveryResponse'
import { createRenderWakeScheduler } from './renderWake'
import type {
  BackgroundToHostMessage,
  BackgroundToRoleMessage,
  HostToBackgroundMessage,
  RoleToBackgroundMessage,
  TeamRoomState,
} from '../team/types'

type RuntimeMessage = HostToBackgroundMessage | RoleToBackgroundMessage | { type: 'OPENTEAM_PING' }

const STORAGE_KEY = 'openteam.teamState'
const DEFAULT_GEMINI_URL = 'https://gemini.google.com/app'
const log = {
  debug(event: string, details?: Record<string, unknown>): void {
    console.debug('[OpenTeam][background]', event, details || {})
  },
  info(event: string, details?: Record<string, unknown>): void {
    console.info('[OpenTeam][background]', event, details || {})
  },
  warn(event: string, details?: Record<string, unknown>): void {
    console.warn('[OpenTeam][background]', event, details || {})
  },
  error(event: string, details?: Record<string, unknown>): void {
    console.error('[OpenTeam][background]', event, details || {})
  },
}

let room = createTeamRoom(`room-${Date.now()}`, -1, Date.now())
const renderWakeScheduler = createRenderWakeScheduler(chrome.tabs)

function now(): number {
  return Date.now()
}

function senderTabId(sender: chrome.runtime.MessageSender): number | undefined {
  return sender.tab?.id
}

function senderGeminiUrl(sender: chrome.runtime.MessageSender): string {
  const url = sender.tab?.url
  if (!url) return DEFAULT_GEMINI_URL

  try {
    const parsed = new URL(url)
    return `${parsed.origin}/app`
  } catch {
    return DEFAULT_GEMINI_URL
  }
}

async function persistState(): Promise<void> {
  const state = room.getState()
  await chrome.storage.session?.set?.({ [STORAGE_KEY]: state })
}

function getState(): TeamRoomState {
  return room.getState()
}

async function pushHost(message: BackgroundToHostMessage): Promise<void> {
  const hostTabId = getState().hostTabId
  if (hostTabId < 0) return

  try {
    log.debug('push-host:start', { hostTabId, type: message.type })
    await chrome.tabs.sendMessage(hostTabId, message)
    log.debug('push-host:ok', { hostTabId, type: message.type })
  } catch (error) {
    log.warn('push-host:failed', {
      hostTabId,
      type: message.type,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function pushState(): Promise<void> {
  await persistState()
  await pushHost({ type: 'TEAM_STATE_UPDATED', state: getState() })
}

async function sendRoleMessage(tabId: number, message: BackgroundToRoleMessage): Promise<unknown> {
  log.debug('send-role-message:start', {
    tabId,
    type: message.type,
    messageId: 'messageId' in message ? message.messageId : undefined,
    contentLength: 'content' in message ? message.content.length : undefined,
  })
  const response = await chrome.tabs.sendMessage(tabId, message)
  log.debug('send-role-message:response', {
    tabId,
    type: message.type,
    messageId: 'messageId' in message ? message.messageId : undefined,
    response,
  })
  return response
}

async function handleContentReady(message: Extract<HostToBackgroundMessage, { type: 'TEAM_CONTENT_READY' }>, sender: chrome.runtime.MessageSender) {
  const tabId = senderTabId(sender)
  if (tabId === undefined) return { ok: false, error: 'Missing sender tab' }

  log.info('content-ready', { tabId, conversationId: message.conversationId, url: sender.tab?.url })
  const role = room.findRoleByTab(tabId)
  if (role) {
    const readyRole = room.markRoleReady(tabId, message.conversationId, now())
    if (readyRole) {
      await sendRoleMessage(tabId, {
        type: 'TEAM_ASSIGN_ROLE',
        roleId: readyRole.id,
        roleName: readyRole.name,
        roomId: getState().roomId,
      })
    }
    await pushState()
    return { ok: true, mode: 'role', role: readyRole }
  }

  room.setHostTab(tabId)
  log.info('host-detected', { tabId })
  await pushState()
  return { ok: true, mode: 'host', state: getState() }
}

async function handleHostReady(sender: chrome.runtime.MessageSender) {
  const tabId = senderTabId(sender)
  if (tabId === undefined) return { ok: false, error: 'Missing sender tab' }

  room.setHostTab(tabId)
  log.info('host-ready', { tabId })
  await pushState()
  return { ok: true, state: getState() }
}

async function handleCreateRole(message: Extract<HostToBackgroundMessage, { type: 'TEAM_CREATE_ROLE' }>, sender: chrome.runtime.MessageSender) {
  const name = message.name.trim()
  if (!name) {
    await pushHost({ type: 'TEAM_ERROR', message: '角色名不能为空' })
    return { ok: false, error: '角色名不能为空' }
  }

  const tab = await chrome.tabs.create({ url: senderGeminiUrl(sender), active: false })
  if (tab.id === undefined) throw new Error('Chrome did not return a tab id')

  const role = room.addOpeningRole(name, tab.id, '__pending__', now())
  log.info('role-created', { roleId: role.id, roleName: role.name, tabId: tab.id })
  await pushState()
  return { ok: true, role }
}

async function handleRemoveRole(message: Extract<HostToBackgroundMessage, { type: 'TEAM_REMOVE_ROLE' }>) {
  const role = room.findRoleById(message.roleId)
  room.removeRole(message.roleId, now())
  log.info('role-remove-requested', { roleId: message.roleId, tabId: role?.tabId })

  if (role) {
    try {
      await chrome.tabs.remove(role.tabId)
    } catch (error) {
      log.warn('role-tab-remove:failed', {
        roleId: message.roleId,
        tabId: role.tabId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  await pushState()
  return { ok: true }
}

async function handleSendMessage(message: Extract<HostToBackgroundMessage, { type: 'TEAM_SEND_MESSAGE' }>) {
  const result = room.sendUserMessage(message.raw, now())
  log.info('host-message', {
    rawLength: message.raw.length,
    ok: result.ok,
    deliveryCount: result.ok ? result.deliveries.length : 0,
    messageId: result.ok ? result.messageId : undefined,
  })
  if (!result.ok) {
    await pushHost({ type: 'TEAM_ERROR', message: result.error })
    await pushState()
    return result
  }

  await pushState()

  for (const delivery of result.deliveries) {
    try {
      const response = await sendRoleMessage(delivery.tabId, {
        type: 'TEAM_SEND_PROMPT',
        messageId: result.messageId,
        content: delivery.content,
      })
      assertRoleDeliveryResponse(response)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      log.warn('delivery:failed', {
        roleId: delivery.roleId,
        tabId: delivery.tabId,
        messageId: result.messageId,
        error: reason,
      })
      room.markRoleStatus(delivery.tabId, 'error', now(), reason)
    }
  }

  await pushState()
  return result
}

async function handleRoleStatus(message: Extract<RoleToBackgroundMessage, { type: 'TEAM_ROLE_STATUS' }>, sender: chrome.runtime.MessageSender) {
  const tabId = senderTabId(sender)
  if (tabId === undefined) return { ok: false, error: 'Missing sender tab' }

  room.markRoleStatus(tabId, message.status, now(), message.error)
  log.info('role-status', { tabId, status: message.status, error: message.error })
  if (message.status === 'generating') {
    renderWakeScheduler.schedule(tabId, getState().hostTabId)
    log.info('render-wake:scheduled', { tabId, hostTabId: getState().hostTabId })
  }
  if (message.status === 'idle' || message.status === 'error' || message.status === 'offline') {
    renderWakeScheduler.cancel(tabId)
    log.info('render-wake:cancelled', { tabId, status: message.status })
  }
  await pushState()
  return { ok: true }
}

async function handleRoleReply(message: Extract<RoleToBackgroundMessage, { type: 'TEAM_ROLE_REPLY' }>, sender: chrome.runtime.MessageSender) {
  const tabId = senderTabId(sender)
  if (tabId === undefined) return { ok: false, error: 'Missing sender tab' }

  const reply = room.recordRoleReply(tabId, message.content, now(), message.messageId)
  renderWakeScheduler.cancel(tabId)
  log.info('role-reply', {
    tabId,
    messageId: message.messageId,
    contentLength: message.content.length,
    accepted: Boolean(reply),
  })
  if (reply) await pushHost({ type: 'TEAM_ROLE_REPLY', message: reply })
  await pushState()
  return { ok: true, message: reply }
}

chrome.runtime.onInstalled.addListener(() => {
  log.info('extension-installed')
})

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  if (message?.type === 'OPENTEAM_PING') {
    sendResponse({ ok: true, tabId: sender.tab?.id ?? null })
    return true
  }

  const run = async () => {
    switch (message?.type) {
      case 'TEAM_CONTENT_READY':
        return handleContentReady(message, sender)
      case 'TEAM_HOST_READY':
        return handleHostReady(sender)
      case 'TEAM_CREATE_ROLE':
        return handleCreateRole(message, sender)
      case 'TEAM_REMOVE_ROLE':
        return handleRemoveRole(message)
      case 'TEAM_SEND_MESSAGE':
        return handleSendMessage(message)
      case 'TEAM_ROLE_STATUS':
        return handleRoleStatus(message, sender)
      case 'TEAM_ROLE_REPLY':
        return handleRoleReply(message, sender)
      case 'TEAM_ROLE_READY':
        return handleContentReady({ type: 'TEAM_CONTENT_READY', conversationId: message.conversationId }, sender)
      default:
        return { ok: false, error: 'Unknown OpenTeam message' }
    }
  }

  run()
    .then(sendResponse)
    .catch(error => {
      const reason = error instanceof Error ? error.message : String(error)
      log.error('message-handler:failed', { type: message?.type, error: reason })
      pushHost({ type: 'TEAM_ERROR', message: reason }).catch(() => undefined)
      sendResponse({ ok: false, error: reason })
    })

  return true
})

chrome.tabs.onRemoved.addListener(tabId => {
  const changedRole = room.markTabClosed(tabId, now())
  if (!changedRole) return

  renderWakeScheduler.cancel(tabId)
  log.warn('role-tab-closed', { tabId, roleId: changedRole.id, roleName: changedRole.name })
  pushState().catch(error => {
    log.warn('role-tab-closed:push-state-failed', {
      tabId,
      error: error instanceof Error ? error.message : String(error),
    })
  })
})
