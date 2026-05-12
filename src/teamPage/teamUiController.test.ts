// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BUILTIN_GROUP_TEMPLATES } from '../group/builtinGroupTemplates'
import type { GroupChat, GroupRole } from '../group/types'
import { createTeamPageState } from './appState'
import { createTeamUiController } from './teamUiController'

describe('createTeamUiController', () => {
  beforeEach(() => {
    document.body.innerHTML = teamUiBody()
  })

  it('does not recover roles whose existing iframe is already assigned', () => {
    const chat = makeChat('chat-1', ['role-1', 'role-2'])
    const roles = [
      makeRole(chat.id, 'role-1'),
      makeRole(chat.id, 'role-2'),
    ]
    const runCommand = vi.fn(async () => undefined)
    const restoreChat = vi.fn(() => roles.map(role => ({
      chatId: chat.id,
      roleId: role.id,
      src: 'https://gemini.google.com/',
      active: true,
      status: 'assigned' as const,
      assignmentAttempts: 1,
    })))

    createTeamUiController({
      state: createTeamPageState(),
      settingsButtonEl: document.querySelector<HTMLButtonElement>('#settings-button')!,
      settingsMenuEl: document.querySelector<HTMLElement>('#settings-menu')!,
      quickCreateChatEl: document.querySelector<HTMLButtonElement>('#quick-create-chat')!,
      createChatFormEl: document.querySelector<HTMLFormElement>('#create-chat-form')!,
      newChatNameEl: document.querySelector<HTMLInputElement>('#new-chat-name')!,
      togglePeopleDrawerEl: document.querySelector<HTMLButtonElement>('#toggle-people-drawer')!,
      rolePanelEl: document.querySelector<HTMLElement>('#role-panel')!,
      iframeHost: { restoreChat },
      getCurrentChat: () => chat,
      getCurrentRoles: () => roles,
      getSelectedLoginSite: () => 'gemini',
      render: vi.fn(),
      renderChatList: vi.fn(),
      renderRolePanel: vi.fn(),
      renderAddPersonDialog: vi.fn(),
      closePeopleModals: vi.fn(),
      closeExternalModels: vi.fn(),
      registerComposerEvents: vi.fn(),
      registerPeopleLibraryEvents: vi.fn(),
      registerExternalModelsEvents: vi.fn(),
      runCommand,
      showError: vi.fn(),
      log: { debug: vi.fn(), info: vi.fn() },
    }).registerUi()

    document.querySelector<HTMLButtonElement>('#restore-chat')!.click()

    expect(restoreChat).toHaveBeenCalledWith({ ...chat, roleIds: roles.map(role => role.id) }, roles)
    expect(runCommand).not.toHaveBeenCalledWith('GROUP_ROLE_RECOVER', expect.anything())
  })

  it('creates a new chat from a selected group template', () => {
    const runCommand = vi.fn(async () => undefined)

    createTeamUiController({
      state: createTeamPageState(),
      settingsButtonEl: document.querySelector<HTMLButtonElement>('#settings-button')!,
      settingsMenuEl: document.querySelector<HTMLElement>('#settings-menu')!,
      quickCreateChatEl: document.querySelector<HTMLButtonElement>('#quick-create-chat')!,
      createChatFormEl: document.querySelector<HTMLFormElement>('#create-chat-form')!,
      newChatNameEl: document.querySelector<HTMLInputElement>('#new-chat-name')!,
      togglePeopleDrawerEl: document.querySelector<HTMLButtonElement>('#toggle-people-drawer')!,
      rolePanelEl: document.querySelector<HTMLElement>('#role-panel')!,
      iframeHost: { restoreChat: vi.fn(() => []) },
      getCurrentChat: () => undefined,
      getCurrentRoles: () => [],
      getSelectedLoginSite: () => 'gemini',
      render: vi.fn(),
      renderChatList: vi.fn(),
      renderRolePanel: vi.fn(),
      renderAddPersonDialog: vi.fn(),
      closePeopleModals: vi.fn(),
      closeExternalModels: vi.fn(),
      registerComposerEvents: vi.fn(),
      registerPeopleLibraryEvents: vi.fn(),
      registerExternalModelsEvents: vi.fn(),
      runCommand,
      showError: vi.fn(),
      log: { debug: vi.fn(), info: vi.fn() },
    }).registerUi()

    document.querySelector<HTMLButtonElement>('#quick-create-chat')!.click()
    document.querySelector<HTMLButtonElement>('#open-group-template-create')!.click()
    const firstTemplateButton = document.querySelector<HTMLButtonElement>('.group-template-option')!
    firstTemplateButton.click()
    document.querySelector<HTMLButtonElement>('#confirm-group-template-create')!.click()

    const template = BUILTIN_GROUP_TEMPLATES[0]
    expect(runCommand).toHaveBeenCalledWith('GROUP_CHAT_CREATE', {
      name: template.defaultChatName,
      mode: template.defaultMode,
      roles: template.roles,
    })
    expect(document.querySelector<HTMLElement>('#group-template-modal')!.hidden).toBe(true)
    expect(document.querySelector<HTMLFormElement>('#create-chat-form')!.hidden).toBe(true)
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
    status: 'ready',
    createdAt: 1,
    updatedAt: 1,
  }
}

function makeRole(chatId: string, id: string): GroupRole {
  return {
    id,
    chatId,
    name: id,
    status: 'ready',
    contextCursor: 0,
    createdAt: 1,
    updatedAt: 1,
  }
}

function teamUiBody(): string {
  return `
  <button id="settings-button"></button>
  <div id="settings-menu" hidden></div>
  <button id="quick-create-chat"></button>
  <form id="create-chat-form" hidden>
    <input id="new-chat-name" />
    <input name="new-chat-mode" value="independent" checked />
    <button id="open-group-template-create" type="button"></button>
  </form>
  <div id="group-template-modal" hidden>
    <button id="close-group-template-modal"></button>
    <div id="group-template-list"></div>
    <button id="confirm-group-template-create"></button>
  </div>
  <button id="toggle-people-drawer"></button>
  <aside id="role-panel"></aside>
  <button id="close-people-drawer"></button>
  <button id="close-window"></button>
  <button id="cancel-create-chat"></button>
  <button id="restore-chat"></button>
  <button id="open-gemini-login"></button>
`
}
