import type { ChatSiteAdapter, ConversationSnapshot } from './types'
import { keepDeepestResponseContainers } from '../responseContainers'
import { extractMarkdownFromDom } from './domMarkdown'

const CLAUDE_HOSTS = new Set(['claude.ai'])
const DEFAULT_INPUT_TIMEOUT_MS = 9000
const DEFAULT_CLIPBOARD_TIMEOUT_MS = 900
const DEFAULT_CLIPBOARD_POLL_MS = 40

const CLAUDE_SELECTORS = {
  editor: '[data-testid="chat-input"][contenteditable="true"], div[contenteditable="true"][aria-label*="Claude"]',
  sendButton:
    'button[aria-label*="Send"], button[aria-label*="发送"], button[aria-label*="Submit"], button[aria-label*="发送消息"]',
  response: '.font-claude-response',
  copyButton:
    'button[data-testid="action-bar-copy"], [role="group"][aria-label="Message actions"] button[aria-label="Copy"], button[aria-label="Copy"], button[aria-label="复制"]',
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

interface ClaudeAdapterOptions {
  href?: string
  inputTimeoutMs?: number
  clipboardTimeoutMs?: number
  clipboardPollMs?: number
}

export function createClaudeAdapter(options: ClaudeAdapterOptions = {}): ChatSiteAdapter {
  const inputTimeoutMs = options.inputTimeoutMs ?? DEFAULT_INPUT_TIMEOUT_MS
  const clipboardTimeoutMs = options.clipboardTimeoutMs ?? DEFAULT_CLIPBOARD_TIMEOUT_MS
  const clipboardPollMs = options.clipboardPollMs ?? DEFAULT_CLIPBOARD_POLL_MS

  function currentHref(): string {
    return options.href ?? location.href
  }

  function getConversationSnapshot(): ConversationSnapshot {
    return getClaudeConversationLocation(currentHref())
  }

  function getConversationId(): string {
    return getConversationSnapshot().conversationId || '__default__'
  }

  function getResponseContainers(): Element[] {
    return [...document.querySelectorAll(CLAUDE_SELECTORS.response)]
  }

  function getAllAssistantReplies(): string[] {
    return keepDeepestResponseContainers(getResponseContainers()).map(container => extractCleanText(container)).filter(Boolean)
  }

  async function fillAndSend(content: string, autoSend = true): Promise<void> {
    const editor = await waitForElement(CLAUDE_SELECTORS.editor, inputTimeoutMs)

    setContentEditableText(editor, content)
    if (readEditorText(editor) !== content.trim()) {
      throw new Error('Claude editor did not accept the prompt text')
    }

    if (!autoSend) return

    const sendButton = await waitForClickableButton(CLAUDE_SELECTORS.sendButton, inputTimeoutMs)
    sendButton.click()
  }

  return {
    id: 'claude',
    getConversationSnapshot,
    getConversationId,
    getResponseContainers,
    getAllAssistantReplies,
    readResponseText: extractCleanText,
    readResponseTextFromCopy: node => readResponseTextFromCopy(node, clipboardTimeoutMs, clipboardPollMs),
    readResponseMarkdown: extractMarkdownFromDom,
    findResponseContainer,
    isGenerating: isClaudeGenerating,
    fillAndSend,
    collectPromptDiagnostics,
  }
}

export function getClaudeConversationLocation(href: string): ConversationSnapshot {
  const url = parseSafeClaudeUrl(href)
  if (!url) return {}

  return {
    conversationId: extractConversationId(url),
    conversationUrl: url.href,
  }
}

function parseSafeClaudeUrl(value: string | undefined): URL | undefined {
  if (!value) return undefined

  try {
    const url = new URL(value)
    return url.protocol === 'https:' && CLAUDE_HOSTS.has(url.hostname) ? url : undefined
  } catch {
    return undefined
  }
}

function extractConversationId(url: URL): string | undefined {
  if (!url.pathname.startsWith('/chat/')) return undefined

  const conversationId = url.pathname.slice('/chat/'.length).split('/')[0]
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
    editorMatches: [...document.querySelectorAll(CLAUDE_SELECTORS.editor)].slice(0, 5).map(describeElement),
    sendButtonMatches: [...document.querySelectorAll(CLAUDE_SELECTORS.sendButton)].slice(0, 5).map(describeElement),
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
        reject(new Error('Claude 发送按钮暂不可用，请稍后重试'))
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
    if (element.matches(CLAUDE_SELECTORS.response)) return element

    element = element.parentElement
  }

  return null
}

async function readResponseTextFromCopy(node: Node, timeoutMs: number, pollMs: number): Promise<string | undefined> {
  if (node.nodeType !== Node.ELEMENT_NODE) return undefined

  const copyButton = findCopyButton(node as Element)
  const clipboard = navigator.clipboard
  if (!copyButton || !clipboard?.readText) return undefined

  let previousText: string | undefined
  try {
    previousText = await clipboard.readText()
  } catch {
    previousText = undefined
  }

  try {
    copyButton.click()
    const copiedText = await waitForClipboardText(previousText, timeoutMs, pollMs)
    return copiedText?.trim() || undefined
  } catch {
    return undefined
  } finally {
    if (previousText !== undefined && clipboard.writeText) {
      clipboard.writeText(previousText).catch(() => undefined)
    }
  }
}

function findCopyButton(response: Element): HTMLButtonElement | undefined {
  let scope: Element | null = response
  while (scope && scope !== document.body) {
    const copyButton = scope.querySelector<HTMLButtonElement>(CLAUDE_SELECTORS.copyButton)
    if (copyButton && isClickableButton(copyButton)) return copyButton
    scope = scope.parentElement
  }

  const copyButton = document.querySelector<HTMLButtonElement>(CLAUDE_SELECTORS.copyButton)
  return copyButton && isClickableButton(copyButton) ? copyButton : undefined
}

function waitForClipboardText(previousText: string | undefined, timeoutMs: number, pollMs: number): Promise<string | undefined> {
  const clipboard = navigator.clipboard
  if (!clipboard?.readText) return Promise.resolve(undefined)

  return new Promise(resolve => {
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      clipboard.readText()
        .then(text => {
          const trimmed = text.trim()
          if (trimmed && (previousText === undefined || text !== previousText)) {
            window.clearInterval(timer)
            resolve(text)
            return
          }
          if (Date.now() - startedAt >= timeoutMs) {
            window.clearInterval(timer)
            resolve(undefined)
          }
        })
        .catch(() => {
          window.clearInterval(timer)
          resolve(undefined)
        })
    }, pollMs)
  })
}

function isClaudeGenerating(): boolean {
  return [...document.querySelectorAll('button')].some(button => {
    const label = [button.getAttribute('aria-label'), button.getAttribute('title'), button.textContent]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return /stop|stopping|停止|中止/.test(label) && isClickableButton(button as HTMLElement)
  })
}

function readEditorText(editor: HTMLElement): string {
  return (editor.textContent || '').replace(/\u00a0/g, ' ').trim()
}
