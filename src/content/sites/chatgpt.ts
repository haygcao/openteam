import type { ChatSiteAdapter, ConversationSnapshot } from './types'
import { keepDeepestResponseContainers } from '../responseContainers'

const CHATGPT_HOSTS = new Set(['chatgpt.com', 'chat.openai.com'])
const DEFAULT_INPUT_TIMEOUT_MS = 9000

const CHATGPT_SELECTORS = {
  editor: 'form[data-type="unified-composer"] #prompt-textarea[contenteditable="true"], #prompt-textarea.ProseMirror[contenteditable="true"]',
  sendButton:
    'button[data-testid="send-button"], button[aria-label*="发送"], button[aria-label*="Send"], button[aria-label*="提交"], button[aria-label*="Submit"]',
  response: '[data-message-author-role="assistant"]',
}

const BLOCK_TAGS = new Set([
  'P',
  'DIV',
  'BR',
  'LI',
  'TR',
  'PRE',
  'BLOCKQUOTE',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
])

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'BUTTON', 'TEXTAREA', 'SVG'])

interface ChatGptAdapterOptions {
  href?: string
  inputTimeoutMs?: number
}

export function createChatGptAdapter(options: ChatGptAdapterOptions = {}): ChatSiteAdapter {
  const inputTimeoutMs = options.inputTimeoutMs ?? DEFAULT_INPUT_TIMEOUT_MS

  function currentHref(): string {
    return options.href ?? location.href
  }

  function getConversationSnapshot(): ConversationSnapshot {
    return getChatGptConversationLocation(currentHref())
  }

  function getConversationId(): string {
    return getConversationSnapshot().conversationId || '__default__'
  }

  function getResponseContainers(): Element[] {
    return [...document.querySelectorAll(CHATGPT_SELECTORS.response)]
  }

  function getAllAssistantReplies(): string[] {
    return keepDeepestResponseContainers(getResponseContainers()).map(container => extractCleanText(container)).filter(Boolean)
  }

  async function fillAndSend(content: string, autoSend = true): Promise<void> {
    const editor = await waitForElement(CHATGPT_SELECTORS.editor, inputTimeoutMs)

    setContentEditableText(editor, content)
    if (readEditorText(editor) !== content.trim()) {
      throw new Error('ChatGPT editor did not accept the prompt text')
    }

    if (!autoSend) return

    const sendButton = await waitForClickableButton(CHATGPT_SELECTORS.sendButton, inputTimeoutMs)
    sendButton.click()
  }

  return {
    id: 'chatgpt',
    getConversationSnapshot,
    getConversationId,
    getResponseContainers,
    getAllAssistantReplies,
    readResponseText: extractCleanText,
    findResponseContainer,
    isGenerating: isChatGptGenerating,
    fillAndSend,
    collectPromptDiagnostics,
  }
}

export function getChatGptConversationLocation(href: string): ConversationSnapshot {
  const url = parseSafeChatGptUrl(href)
  if (!url) return {}

  return {
    conversationId: extractConversationId(url),
    conversationUrl: url.href,
  }
}

function parseSafeChatGptUrl(value: string | undefined): URL | undefined {
  if (!value) return undefined

  try {
    const url = new URL(value)
    return url.protocol === 'https:' && CHATGPT_HOSTS.has(url.hostname) ? url : undefined
  } catch {
    return undefined
  }
}

function extractConversationId(url: URL): string | undefined {
  if (!url.pathname.startsWith('/c/')) return undefined

  const conversationId = url.pathname.slice('/c/'.length).split('/')[0]
  return conversationId ? decodeURIComponent(conversationId) : undefined
}

function querySelectorFirst(selectors: string): HTMLElement | null {
  for (const selector of selectors.split(',').map(item => item.trim())) {
    const element = document.querySelector(selector) as HTMLElement | null
    if (element) return element
  }

  return null
}

function describeElement(element: Element): Record<string, unknown> {
  const htmlElement = element as HTMLElement
  return {
    tagName: element.tagName,
    id: htmlElement.id || undefined,
    className: typeof htmlElement.className === 'string' ? htmlElement.className.slice(0, 120) : undefined,
    role: element.getAttribute('role') || undefined,
    ariaLabel: element.getAttribute('aria-label') || undefined,
    ariaDisabled: element.getAttribute('aria-disabled') || undefined,
    disabled: element instanceof HTMLButtonElement ? element.disabled : undefined,
    contentEditable: htmlElement.contentEditable || undefined,
  }
}

function collectPromptDiagnostics(): Record<string, unknown> {
  return {
    href: location.href,
    readyState: document.readyState,
    visibilityState: document.visibilityState,
    title: document.title,
    editorMatches: [...document.querySelectorAll(CHATGPT_SELECTORS.editor)].slice(0, 5).map(describeElement),
    sendButtonMatches: [...document.querySelectorAll(CHATGPT_SELECTORS.sendButton)].slice(0, 5).map(describeElement),
    visibleButtonSamples: [...document.querySelectorAll('button')].slice(0, 12).map(describeElement),
  }
}

function waitForElement(selectors: string, timeoutMs: number): Promise<HTMLElement> {
  const immediate = querySelectorFirst(selectors)
  if (immediate) return Promise.resolve(immediate)

  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      const element = querySelectorFirst(selectors)
      if (element) {
        window.clearInterval(timer)
        resolve(element)
        return
      }

      if (Date.now() - startedAt >= timeoutMs) {
        window.clearInterval(timer)
        reject(new Error(`Element not found: ${selectors}`))
      }
    }, 250)
  })
}

function waitForClickableButton(selectors: string, timeoutMs: number): Promise<HTMLElement> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      const button = querySelectorFirst(selectors)
      if (button && isClickableButton(button)) {
        window.clearInterval(timer)
        resolve(button)
        return
      }

      if (Date.now() - startedAt >= timeoutMs) {
        window.clearInterval(timer)
        reject(new Error('ChatGPT 发送按钮暂不可用，请稍后重试'))
      }
    }, 250)
  })
}

function setContentEditableText(editor: HTMLElement, content: string): void {
  editor.focus()
  editor.replaceChildren()

  const block = document.createElement('p')
  block.textContent = content
  editor.append(block)

  editor.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertText', data: content }))
  editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: content }))
  editor.dispatchEvent(new Event('change', { bubbles: true }))
}

function isClickableButton(element: HTMLElement): boolean {
  if (!(element instanceof HTMLButtonElement)) return true
  return !element.disabled && element.getAttribute('aria-disabled') !== 'true'
}

function extractCleanText(node: Node): string {
  const buffer: string[] = []

  function visit(current: Node): void {
    if (current.nodeType === Node.TEXT_NODE) {
      buffer.push(current.textContent || '')
      return
    }

    if (current.nodeType !== Node.ELEMENT_NODE) return

    const element = current as Element
    if (element.getAttribute('aria-hidden') === 'true') return
    if (SKIP_TAGS.has(element.tagName)) return
    if (BLOCK_TAGS.has(element.tagName)) buffer.push('\n')

    for (const child of element.childNodes) {
      visit(child)
    }
  }

  visit(node)

  return buffer
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function findResponseContainer(element: Element | null): Element | null {
  while (element) {
    if (element.matches(CHATGPT_SELECTORS.response)) return element

    element = element.parentElement
  }

  return null
}

function isChatGptGenerating(): boolean {
  return [...document.querySelectorAll('button')].some(button => {
    const label = [button.getAttribute('aria-label'), button.getAttribute('title'), button.textContent]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return /stop|stopping|停止|中止/.test(label) && isClickableButton(button as HTMLElement)
  })
}

function readEditorText(editor: HTMLElement): string {
  return (editor.innerText || editor.textContent || '').trim()
}
