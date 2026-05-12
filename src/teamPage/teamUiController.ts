import { getDefaultChatSiteUrl } from '../group/conversationUrl'
import { BUILTIN_GROUP_TEMPLATES, getBuiltinGroupTemplate, type BuiltinGroupTemplate } from '../group/builtinGroupTemplates'
import type { ChatSite, GroupChat, GroupRole, RoomMode } from '../group/types'
import type { TeamPageState } from './appState'
import { requireElement } from './domRefs'
import type { RoleFrameState } from './iframeHost'

interface TeamUiIframeHost {
  restoreChat(chat: GroupChat, roles: GroupRole[]): RoleFrameState[]
}

export interface TeamUiControllerDependencies {
  state: TeamPageState
  settingsButtonEl: HTMLButtonElement
  settingsMenuEl: HTMLElement
  quickCreateChatEl: HTMLButtonElement
  createChatFormEl: HTMLFormElement
  newChatNameEl: HTMLInputElement
  togglePeopleDrawerEl: HTMLButtonElement
  rolePanelEl: HTMLElement
  iframeHost: TeamUiIframeHost
  getCurrentChat(): GroupChat | undefined
  getCurrentRoles(): GroupRole[]
  getSelectedLoginSite(): ChatSite
  render(): void
  renderChatList(): void
  renderRolePanel(): void
  renderAddPersonDialog(): void
  closePeopleModals(): void
  closeExternalModels(): void
  registerComposerEvents(): void
  registerPeopleLibraryEvents(): void
  registerExternalModelsEvents(): void
  runCommand(type: string, payload?: Record<string, unknown>): Promise<void>
  showError(message: string): void
  log: {
    debug(event: string, details?: Record<string, unknown>): void
    info(event: string, details?: Record<string, unknown>): void
  }
}

export interface TeamUiController {
  registerUi(): void
}

export function createTeamUiController(deps: TeamUiControllerDependencies): TeamUiController {
  let selectedGroupTemplateId: string | undefined

  function registerUi(): void {
    const openGroupTemplateCreateEl = requireElement<HTMLButtonElement>('#open-group-template-create')
    const groupTemplateModalEl = requireElement<HTMLElement>('#group-template-modal')
    const groupTemplateListEl = requireElement<HTMLElement>('#group-template-list')
    const confirmGroupTemplateCreateEl = requireElement<HTMLButtonElement>('#confirm-group-template-create')
    const closeGroupTemplateModalEl = requireElement<HTMLButtonElement>('#close-group-template-modal')

    deps.quickCreateChatEl.addEventListener('click', () => {
      setChatCreatePopoverVisible(deps.createChatFormEl.hidden)
    })

    deps.settingsButtonEl.addEventListener('click', event => {
      event.stopPropagation()
      const visible = deps.settingsMenuEl.hidden
      deps.settingsMenuEl.hidden = !visible
      deps.settingsButtonEl.setAttribute('aria-expanded', String(visible))
      deps.log.debug('ui:settings-menu:open')
    })

    deps.registerPeopleLibraryEvents()
    deps.registerExternalModelsEvents()

    deps.togglePeopleDrawerEl.addEventListener('click', () => {
      deps.state.peopleDrawerOpen = !deps.state.peopleDrawerOpen
      deps.render()
    })

    requireElement<HTMLButtonElement>('#close-people-drawer').addEventListener('click', () => {
      deps.state.peopleDrawerOpen = false
      deps.render()
    })

    document.addEventListener('click', event => {
      const target = event.target as Element | null
      if (!deps.settingsMenuEl.hidden && !deps.settingsMenuEl.contains(event.target as Node) && event.target !== deps.settingsButtonEl) {
        deps.settingsMenuEl.hidden = true
        deps.settingsButtonEl.setAttribute('aria-expanded', 'false')
      }
      if (deps.state.peopleDrawerOpen && target && !deps.rolePanelEl.contains(target) && !deps.togglePeopleDrawerEl.contains(target)) {
        deps.state.peopleDrawerOpen = false
        deps.render()
      }
      if (deps.state.chatMenuChatId && !target?.closest('.chat-action-menu, .chat-menu-btn')) {
        deps.state.chatMenuChatId = undefined
        deps.renderChatList()
      }
      if (deps.state.roleSiteMenuRoleId && !target?.closest('.role-site-menu, .site-pill')) {
        deps.state.roleSiteMenuRoleId = undefined
        deps.renderRolePanel()
      }
      if (deps.state.addPersonSiteMenuId && !target?.closest('.role-site-menu, .site-pill')) {
        deps.state.addPersonSiteMenuId = undefined
        deps.renderAddPersonDialog()
      }
    })

    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return
      deps.settingsMenuEl.hidden = true
      deps.settingsButtonEl.setAttribute('aria-expanded', 'false')
      deps.closePeopleModals()
      deps.closeExternalModels()
      deps.state.chatMenuChatId = undefined
      deps.state.roleSiteMenuRoleId = undefined
      deps.state.roleActionMenuRoleId = undefined
      closeGroupTemplateModal(groupTemplateModalEl, groupTemplateListEl, confirmGroupTemplateCreateEl)
      deps.renderChatList()
      deps.renderRolePanel()
    })

    requireElement<HTMLButtonElement>('#cancel-create-chat').addEventListener('click', () => {
      setChatCreatePopoverVisible(false)
    })

    openGroupTemplateCreateEl.addEventListener('click', () => {
      openGroupTemplateModal(groupTemplateModalEl, groupTemplateListEl, confirmGroupTemplateCreateEl)
    })

    closeGroupTemplateModalEl.addEventListener('click', () => {
      closeGroupTemplateModal(groupTemplateModalEl, groupTemplateListEl, confirmGroupTemplateCreateEl)
    })

    confirmGroupTemplateCreateEl.addEventListener('click', () => {
      const template = selectedGroupTemplateId ? getBuiltinGroupTemplate(selectedGroupTemplateId) : undefined
      if (!template) return
      deps.newChatNameEl.value = ''
      closeGroupTemplateModal(groupTemplateModalEl, groupTemplateListEl, confirmGroupTemplateCreateEl)
      setChatCreatePopoverVisible(false)
      deps.runCommand('GROUP_CHAT_CREATE', {
        name: template.defaultChatName,
        mode: template.defaultMode,
        roles: template.roles,
      }).catch(error => deps.showError(error instanceof Error ? error.message : String(error)))
    })

    deps.createChatFormEl.addEventListener('submit', event => {
      event.preventDefault()
      const name = deps.newChatNameEl.value.trim() || '新群聊'
      const mode = readNewChatMode()
      deps.newChatNameEl.value = ''
      setChatCreatePopoverVisible(false)
      deps.runCommand('GROUP_CHAT_CREATE', { name, mode, roles: [] }).catch(error => deps.showError(error instanceof Error ? error.message : String(error)))
    })

    requireElement<HTMLButtonElement>('#restore-chat').addEventListener('click', () => {
      const chat = deps.getCurrentChat()
      if (!chat) return
      const roles = deps.getCurrentRoles().filter(role => role.modelSource !== 'external')
      deps.log.info('ui:restore-chat', { chatId: chat.id, roleIds: roles.map(role => role.id) })
      const restoredFrames = deps.iframeHost.restoreChat({ ...chat, roleIds: roles.map(role => role.id) }, roles)
      const assignedRoleIds = new Set(restoredFrames.filter(frame => frame.status === 'assigned').map(frame => frame.roleId))
      const rolesToRecover = roles.filter(role => !assignedRoleIds.has(role.id))
      Promise.all(rolesToRecover.map(role => deps.runCommand('GROUP_ROLE_RECOVER', { chatId: chat.id, roleId: role.id }))).catch(error => deps.showError(error instanceof Error ? error.message : String(error)))
    })

    deps.registerComposerEvents()

    requireElement<HTMLButtonElement>('#open-gemini-login').addEventListener('click', () => {
      chrome.tabs.create({ url: getDefaultChatSiteUrl(deps.getSelectedLoginSite()) }).catch(error => deps.showError(error instanceof Error ? error.message : String(error)))
    })
  }

  function openGroupTemplateModal(
    modalEl: HTMLElement,
    listEl: HTMLElement,
    confirmButton: HTMLButtonElement,
  ): void {
    selectedGroupTemplateId = undefined
    confirmButton.disabled = true
    renderGroupTemplateList(listEl, confirmButton)
    modalEl.hidden = false
    listEl.querySelector<HTMLButtonElement>('.group-template-option')?.focus()
  }

  function closeGroupTemplateModal(
    modalEl: HTMLElement,
    listEl: HTMLElement,
    confirmButton: HTMLButtonElement,
  ): void {
    modalEl.hidden = true
    selectedGroupTemplateId = undefined
    confirmButton.disabled = true
    listEl.replaceChildren()
  }

  function renderGroupTemplateList(listEl: HTMLElement, confirmButton: HTMLButtonElement): void {
    listEl.replaceChildren()
    for (const template of BUILTIN_GROUP_TEMPLATES) {
      listEl.append(groupTemplateOption(template, listEl, confirmButton))
    }
  }

  function groupTemplateOption(
    template: BuiltinGroupTemplate,
    listEl: HTMLElement,
    confirmButton: HTMLButtonElement,
  ): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `group-template-option${selectedGroupTemplateId === template.id ? ' active' : ''}`
    button.dataset.templateId = template.id
    button.setAttribute('aria-pressed', String(selectedGroupTemplateId === template.id))
    button.addEventListener('click', () => {
      selectedGroupTemplateId = template.id
      confirmButton.disabled = false
      renderGroupTemplateList(listEl, confirmButton)
      listEl.querySelector<HTMLButtonElement>(`[data-template-id="${template.id}"]`)?.focus()
    })

    const top = document.createElement('span')
    top.className = 'group-template-option-top'
    const name = document.createElement('strong')
    name.textContent = template.name
    const category = document.createElement('span')
    category.className = 'group-template-category'
    category.textContent = template.category
    top.append(name, category)

    const summary = document.createElement('span')
    summary.className = 'group-template-summary'
    summary.textContent = template.summary

    const roles = document.createElement('span')
    roles.className = 'group-template-roles'
    for (const role of template.roles) {
      const chip = document.createElement('span')
      chip.textContent = role.name
      roles.append(chip)
    }

    button.append(top, summary, roles)
    return button
  }

  function readNewChatMode(): RoomMode {
    const selected = document.querySelector<HTMLInputElement>('input[name="new-chat-mode"]:checked')
    return selected?.value === 'collaborative' ? 'collaborative' : 'independent'
  }

  function setChatCreatePopoverVisible(visible: boolean): void {
    deps.createChatFormEl.hidden = !visible
    deps.quickCreateChatEl.setAttribute('aria-expanded', String(visible))
    if (visible) deps.newChatNameEl.focus()
  }

  return { registerUi }
}
