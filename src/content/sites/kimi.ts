import type { ChatSiteAdapter, ConversationSnapshot } from './types'
import { keepDeepestResponseContainers } from '../responseContainers'
import { readEditorText } from './contentEditable'
import { extractMarkdownFromDom } from './domMarkdown'
import { buttonLabelMatches, describeElement, extractCleanTextFromDom, findClosestMatchingAncestor } from './domText'
import { waitForElement } from './waitForElement'

const KIMI_HOST = 'www.kimi.com'
const KIMI_ORIGIN = `https://${KIMI_HOST}`
const KIMI_HOME_URL = `${KIMI_ORIGIN}/chat/`
const DEFAULT_INPUT_TIMEOUT_MS = 9000
const KIMI_DEBUG_EVENT_LIMIT = 40
const KIMI_PAGE_WORLD_WRITE_TIMEOUT_MS = 700
const KIMI_PAGE_WORLD_WRITER_ID = 'openteam-kimi-page-world-writer'
const KIMI_WRITE_REQUEST_EVENT = 'openteam:kimi-write-request'
const KIMI_WRITE_RESPONSE_EVENT = 'openteam:kimi-write-response'

const KIMI_SELECTORS = {
  editor: '.chat-input-editor[contenteditable="true"][data-lexical-editor="true"], .chat-input-editor[role="textbox"][contenteditable="true"]',
  composer: '.chat-editor',
  response: '.chat-content-item-assistant .markdown-container:not(.toolcall-content-text) > .markdown',
  responseContainer: '.chat-content-item-assistant',
  sendButton: '.send-button-container',
}

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'BUTTON', 'TEXTAREA', 'SVG', 'CANVAS'])

interface KimiDebugEvent {
  at: number
  stage: string
  details: Record<string, unknown>
}

interface KimiWriteResult {
  accepted: boolean
  strategy: string
  attempts: Array<Record<string, unknown>>
}

interface KimiAdapterOptions {
  href?: string
  inputTimeoutMs?: number
}

const kimiDebugEvents: KimiDebugEvent[] = []

export function createKimiAdapter(options: KimiAdapterOptions = {}): ChatSiteAdapter {
  const inputTimeoutMs = options.inputTimeoutMs ?? DEFAULT_INPUT_TIMEOUT_MS

  function currentHref(): string {
    return options.href ?? location.href
  }

  function getConversationSnapshot(): ConversationSnapshot {
    return getKimiConversationLocation(currentHref())
  }

  function getConversationId(): string {
    return getConversationSnapshot().conversationId || '__default__'
  }

  function getResponseContainers(): Element[] {
    return [...document.querySelectorAll(KIMI_SELECTORS.response)].filter(isFinalResponseMarkdown)
  }

  function getAllAssistantReplies(): string[] {
    return keepDeepestResponseContainers(getResponseContainers()).map(container => extractCleanText(container)).filter(Boolean)
  }

  async function fillAndSend(content: string, autoSend = true): Promise<void> {
    logKimiDebug('fill:start', {
      href: currentHref(),
      contentLength: content.length,
      trimmedContentLength: content.trim().length,
      autoSend,
    })
    const editor = await waitForElement(KIMI_SELECTORS.editor, inputTimeoutMs)
    if (!(editor instanceof HTMLElement)) {
      logKimiDebug('fill:editor-invalid', { matchedNode: describeElement(editor) })
      throw new Error('Kimi editor is not an editable element')
    }
    logKimiDebug('fill:editor-found', getEditorSnapshot(editor))

    const writeResult = await setKimiEditorText(editor, content)
    logKimiDebug('fill:write-result', {
      accepted: writeResult.accepted,
      strategy: writeResult.strategy,
      attempts: writeResult.attempts,
      ...getEditorSnapshot(editor),
      sendButtons: describeKimiSendButtons(editor),
    })
    if (!writeResult.accepted) {
      throw new Error('Kimi editor did not accept the prompt text')
    }

    if (!autoSend) return

    const sendButton = await waitForKimiSendButton(editor, inputTimeoutMs)
    const responseCountBeforeSend = document.querySelectorAll(KIMI_SELECTORS.response).length
    logKimiDebug('fill:click-send', {
      sendButton: describeElement(sendButton),
      sendButtonClass: sendButton.className,
      sendButtons: describeKimiSendButtons(editor),
      responseCountBeforeSend,
    })
    const activation = activateKimiSendButton(sendButton)
    logKimiDebug('fill:send-activation', {
      activation,
      sendButton: describeElement(sendButton),
      sendButtons: describeKimiSendButtons(editor),
    })
    await waitForKimiEditorSettle(350)

    const responseCountAfterClick = document.querySelectorAll(KIMI_SELECTORS.response).length
    const shouldTryKeyboardFallback =
      responseCountAfterClick === responseCountBeforeSend &&
      hasAcceptedKimiEditorText(editor, content) &&
      !isKimiGenerating()
    const keyboardFallback = shouldTryKeyboardFallback ? activateKimiEditorEnter(editor) : undefined
    if (keyboardFallback) await waitForKimiEditorSettle(250)

    logKimiDebug('fill:after-click', {
      keyboardFallback,
      responseCountBeforeSend,
      responseCountAfterClick,
      ...getEditorSnapshot(editor),
      sendButtons: describeKimiSendButtons(editor),
      responseCount: document.querySelectorAll(KIMI_SELECTORS.response).length,
      loginDialogSamples: collectKimiLoginDialogSamples(),
    })
  }

  return {
    id: 'kimi',
    getConversationSnapshot,
    getConversationId,
    getResponseContainers,
    getAllAssistantReplies,
    readResponseText: extractCleanText,
    readResponseMarkdown: extractMarkdownFromDom,
    findResponseContainer,
    isGenerating: isKimiGenerating,
    stopGenerating: stopKimiGenerating,
    fillAndSend,
    collectPromptDiagnostics,
  }
}

export function getKimiConversationLocation(href: string): ConversationSnapshot {
  const url = parseSafeKimiUrl(href)
  if (!url) return {}

  return {
    conversationId: extractConversationId(url),
    conversationUrl: url.href,
  }
}

function parseSafeKimiUrl(value: string | undefined): URL | undefined {
  if (!value || !value.startsWith(`${KIMI_ORIGIN}/`)) return undefined

  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === KIMI_HOST ? url : undefined
  } catch {
    return undefined
  }
}

function extractConversationId(url: URL): string | undefined {
  if (!url.href.startsWith(KIMI_HOME_URL)) return undefined

  const conversationId = url.pathname.slice('/chat/'.length).split('/')[0]
  return conversationId ? decodeURIComponent(conversationId) : undefined
}

async function setKimiEditorText(editor: HTMLElement, content: string): Promise<KimiWriteResult> {
  const attempts: Array<Record<string, unknown>> = []
  const beforeInputAccepted = insertTextWithKimiBeforeInput(editor, content)
  attempts.push({ strategy: 'beforeinput', accepted: beforeInputAccepted, ...getEditorSnapshot(editor) })
  if (beforeInputAccepted) return { accepted: true, strategy: 'beforeinput', attempts }

  const nativeAccepted = insertTextWithNativeEditing(editor, content)
  attempts.push({ strategy: 'execCommand.insertText', accepted: nativeAccepted, ...getEditorSnapshot(editor) })
  if (nativeAccepted) return { accepted: true, strategy: 'execCommand.insertText', attempts }

  const pageWorldResult = await insertTextWithPageWorldWriter(editor, content)
  attempts.push({ strategy: 'page-world-writer', accepted: pageWorldResult.accepted, response: pageWorldResult.response, ...getEditorSnapshot(editor) })
  if (pageWorldResult.accepted) return { accepted: true, strategy: 'page-world-writer', attempts }

  const clipboardPasteResult = await insertTextWithClipboardPaste(editor, content)
  attempts.push({ strategy: 'clipboard-paste', accepted: clipboardPasteResult.accepted, ...clipboardPasteResult.diagnostics, ...getEditorSnapshot(editor) })
  if (clipboardPasteResult.accepted) return { accepted: true, strategy: 'clipboard-paste', attempts }

  editor.focus()
  replaceKimiEditorDom(editor, content)
  editor.dispatchEvent(new Event('change', { bubbles: true }))
  await waitForKimiEditorSettle()
  const domAccepted = hasExactlyAcceptedKimiEditorText(editor, content)
  attempts.push({ strategy: 'dom-fallback', accepted: domAccepted, ...getEditorSnapshot(editor) })
  return { accepted: domAccepted, strategy: domAccepted ? 'dom-fallback' : 'none', attempts }
}

function insertTextWithKimiBeforeInput(editor: HTMLElement, content: string): boolean {
  if (typeof document.execCommand !== 'function') return false

  editor.focus()
  if (!selectEditorContents(editor)) return false
  document.execCommand('delete', false)
  editor.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: content }))
  return hasAcceptedKimiEditorText(editor, content)
}

function insertTextWithNativeEditing(editor: HTMLElement, content: string): boolean {
  if (typeof document.execCommand !== 'function') return false

  editor.focus()
  if (!selectEditorContents(editor)) return false
  document.execCommand('delete', false)
  const inserted = document.execCommand('insertText', false, content)
  return inserted && hasAcceptedKimiEditorText(editor, content)
}

async function insertTextWithPageWorldWriter(editor: HTMLElement, content: string): Promise<{ accepted: boolean; response?: Record<string, unknown> }> {
  ensureKimiPageWorldWriterInstalled()

  const requestId = `kimi-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const response = await waitForKimiPageWorldWriteResponse(requestId, content)
  const domAccepted = hasAcceptedKimiEditorText(editor, content)
  const responseAccepted = doesKimiWriteResponseMatchContent(response, content)

  return {
    accepted: responseAccepted || domAccepted,
    response: response ? { ...response, responseAccepted, domAccepted } : { responseAccepted, domAccepted, reason: 'response-timeout' },
  }
}

async function insertTextWithClipboardPaste(
  editor: HTMLElement,
  content: string,
): Promise<{ accepted: boolean; diagnostics: Record<string, unknown> }> {
  if (typeof document.execCommand !== 'function') {
    return { accepted: false, diagnostics: { reason: 'execCommand-unavailable' } }
  }

  const clipboard = navigator.clipboard
  if (!clipboard?.writeText) {
    return { accepted: false, diagnostics: { reason: 'clipboard-write-unavailable' } }
  }

  let previousClipboardText: string | undefined
  try {
    previousClipboardText = clipboard.readText ? await clipboard.readText() : undefined
  } catch {
    previousClipboardText = undefined
  }

  try {
    await clipboard.writeText(content)
    editor.focus()
    if (!selectEditorContents(editor)) {
      return { accepted: false, diagnostics: { reason: 'selection-unavailable', clipboardWrite: true } }
    }

    const deleteResult = document.execCommand('delete', false)
    const pasteResult = document.execCommand('paste', false)
    await waitForKimiEditorSettle()

    return {
      accepted: hasAcceptedKimiEditorText(editor, content),
      diagnostics: {
        clipboardWrite: true,
        clipboardRead: previousClipboardText !== undefined,
        deleteResult,
        pasteResult,
      },
    }
  } catch (error) {
    return {
      accepted: false,
      diagnostics: {
        reason: error instanceof Error ? error.message : String(error),
        clipboardRead: previousClipboardText !== undefined,
      },
    }
  } finally {
    if (previousClipboardText !== undefined) {
      try {
        await clipboard.writeText(previousClipboardText)
      } catch {
        // Best-effort clipboard restoration only.
      }
    }
  }
}

function waitForKimiPageWorldWriteResponse(requestId: string, content: string): Promise<Record<string, unknown> | undefined> {
  return new Promise(resolve => {
    const timeout = window.setTimeout(() => {
      document.documentElement.removeEventListener(KIMI_WRITE_RESPONSE_EVENT, onResponse)
      resolve(undefined)
    }, KIMI_PAGE_WORLD_WRITE_TIMEOUT_MS)

    function onResponse(event: Event): void {
      const detail = parseKimiEventDetail((event as CustomEvent<unknown>).detail)
      if (detail?.requestId !== requestId) return

      window.clearTimeout(timeout)
      document.documentElement.removeEventListener(KIMI_WRITE_RESPONSE_EVENT, onResponse)
      resolve(detail)
    }

    document.documentElement.addEventListener(KIMI_WRITE_RESPONSE_EVENT, onResponse)
    document.documentElement.dispatchEvent(
      new CustomEvent(KIMI_WRITE_REQUEST_EVENT, {
        detail: JSON.stringify({ requestId, content, selector: KIMI_SELECTORS.editor }),
      }),
    )
  })
}

function ensureKimiPageWorldWriterInstalled(): void {
  if (document.getElementById(KIMI_PAGE_WORLD_WRITER_ID)) return

  const script = document.createElement('script')
  script.id = KIMI_PAGE_WORLD_WRITER_ID
  script.textContent = `;(() => {
    const requestEvent = ${JSON.stringify(KIMI_WRITE_REQUEST_EVENT)};
    const responseEvent = ${JSON.stringify(KIMI_WRITE_RESPONSE_EVENT)};
    if (window.__OPENTEAM_KIMI_PAGE_WORLD_WRITER__) return;
    window.__OPENTEAM_KIMI_PAGE_WORLD_WRITER__ = true;

    function readText(editor) {
      return ((editor && (editor.innerText || editor.textContent)) || '').trim();
    }

    function respond(payload) {
      document.documentElement.dispatchEvent(new CustomEvent(responseEvent, { detail: JSON.stringify(payload) }));
    }

    function selectContents(editor) {
      const selection = window.getSelection();
      if (!selection) return false;
      const range = document.createRange();
      range.selectNodeContents(editor);
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    }

    document.documentElement.addEventListener(requestEvent, event => {
      let detail;
      try {
        detail = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail;
      } catch (error) {
        return;
      }

      const editor = document.querySelector(detail.selector);
      if (!editor) {
        respond({ requestId: detail.requestId, ok: false, reason: 'editor-not-found' });
        return;
      }

      try {
        editor.focus();
        selectContents(editor);
        document.execCommand && document.execCommand('delete', false);
        editor.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: detail.content }));
        if (readText(editor) !== String(detail.content || '').trim() && document.execCommand) {
          selectContents(editor);
          document.execCommand('delete', false);
          document.execCommand('insertText', false, detail.content);
        }
        respond({
          requestId: detail.requestId,
          ok: Boolean(readText(editor)),
          text: readText(editor).slice(0, 500),
          textLength: readText(editor).length,
          html: editor.innerHTML.slice(0, 800)
        });
      } catch (error) {
        respond({ requestId: detail.requestId, ok: false, reason: error instanceof Error ? error.message : String(error) });
      }
    });
  })();`
  document.documentElement.append(script)
  script.remove()
}

function parseKimiEventDetail(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : undefined
    } catch {
      return undefined
    }
  }
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined
}

function doesKimiWriteResponseMatchContent(response: Record<string, unknown> | undefined, content: string): boolean {
  if (!response?.ok) return false

  const responseText = typeof response.text === 'string' ? response.text.trim() : ''
  const expected = content.trim()
  if (responseText === expected) return true
  if (content.length > 500 && responseText && expected.startsWith(responseText)) return true

  return typeof response.textLength === 'number' && response.textLength === expected.length && Boolean(responseText)
}

function replaceKimiEditorDom(editor: HTMLElement, content: string): void {
  editor.replaceChildren()

  const block = document.createElement('p')
  block.dir = 'ltr'
  const text = document.createElement('span')
  text.setAttribute('data-lexical-text', 'true')
  text.textContent = content
  block.append(text)
  editor.append(block)
}

function waitForKimiEditorSettle(delayMs = 80): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, delayMs))
}

function hasExactlyAcceptedKimiEditorText(editor: HTMLElement, content: string): boolean {
  return readEditorText(editor) === content.trim()
}

function hasAcceptedKimiEditorText(editor: HTMLElement, content: string): boolean {
  const actual = readEditorText(editor)
  const expected = content.trim()
  if (actual === expected) return true
  if (!actual) return false

  return content.length > 500 && expected.includes(actual)
}

function selectEditorContents(editor: HTMLElement): boolean {
  const selection = window.getSelection()
  if (!selection) return false

  const range = document.createRange()
  range.selectNodeContents(editor)
  selection.removeAllRanges()
  selection.addRange(range)
  return true
}

async function waitForKimiSendButton(editor: HTMLElement, timeoutMs: number): Promise<HTMLElement> {
  const startedAt = Date.now()
  while (Date.now() - startedAt <= timeoutMs) {
    const button = findKimiSendButton(editor)
    if (button) {
      logKimiDebug('send-button:ready', {
        elapsedMs: Date.now() - startedAt,
        button: describeElement(button),
        sendButtons: describeKimiSendButtons(editor),
      })
      return button
    }
    await new Promise(resolve => window.setTimeout(resolve, 50))
  }

  logKimiDebug('send-button:timeout', {
    timeoutMs,
    sendButtons: describeKimiSendButtons(editor),
    ...getEditorSnapshot(editor),
  })
  throw new Error('Kimi 发送按钮暂不可用，请稍后重试')
}

function findKimiSendButton(editor: HTMLElement): HTMLElement | undefined {
  const composer = editor.closest(KIMI_SELECTORS.composer) ?? document.body
  const candidates = [...composer.querySelectorAll<HTMLElement>(KIMI_SELECTORS.sendButton)]
  return candidates.reverse().find(isClickableKimiControl)
}

function activateKimiSendButton(button: HTMLElement): Record<string, unknown> {
  button.focus()
  const clickTarget = button.querySelector('svg[name="Send"]') ?? button

  const eventResults = [
    dispatchKimiPointerEvent(clickTarget, 'pointerover'),
    dispatchKimiMouseEvent(clickTarget, 'mouseover'),
    dispatchKimiPointerEvent(clickTarget, 'pointerenter', false),
    dispatchKimiMouseEvent(clickTarget, 'mouseenter', false),
    dispatchKimiPointerEvent(clickTarget, 'pointerdown'),
    dispatchKimiMouseEvent(clickTarget, 'mousedown'),
    dispatchKimiPointerEvent(clickTarget, 'pointerup'),
    dispatchKimiMouseEvent(clickTarget, 'mouseup'),
  ]

  const clickResult = clickKimiElement(clickTarget)
  return {
    focused: document.activeElement === button,
    clickTarget: describeElement(clickTarget),
    eventResults,
    clickResult,
  }
}

function activateKimiEditorEnter(editor: HTMLElement): Record<string, unknown> {
  editor.focus()
  const eventResults = [
    dispatchKimiKeyboardEvent(editor, 'keydown'),
    dispatchKimiKeyboardEvent(editor, 'keypress'),
    dispatchKimiKeyboardEvent(editor, 'keyup'),
  ]

  return {
    activeElement: document.activeElement ? describeElement(document.activeElement) : undefined,
    eventResults,
  }
}

function clickKimiElement(element: Element): Record<string, unknown> {
  const click = (element as { click?: () => void }).click
  if (typeof click === 'function') {
    click.call(element)
    return { method: 'native-click' }
  }

  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
  return {
    method: 'dispatch-click',
    dispatched: element.dispatchEvent(event),
    defaultPrevented: event.defaultPrevented,
  }
}

function dispatchKimiPointerEvent(element: Element, type: string, bubbles = true): Record<string, unknown> {
  const PointerEventConstructor = window.PointerEvent
  const event = PointerEventConstructor
    ? new PointerEventConstructor(type, { bubbles, cancelable: true, pointerType: 'mouse', button: 0, buttons: type.endsWith('down') ? 1 : 0 })
    : new MouseEvent(type, { bubbles, cancelable: true, button: 0, buttons: type.endsWith('down') ? 1 : 0 })

  return {
    type,
    dispatched: element.dispatchEvent(event),
    defaultPrevented: event.defaultPrevented,
  }
}

function dispatchKimiMouseEvent(element: Element, type: string, bubbles = true): Record<string, unknown> {
  const event = new MouseEvent(type, { bubbles, cancelable: true, button: 0, buttons: type.endsWith('down') ? 1 : 0 })
  return {
    type,
    dispatched: element.dispatchEvent(event),
    defaultPrevented: event.defaultPrevented,
  }
}

function dispatchKimiKeyboardEvent(element: HTMLElement, type: string): Record<string, unknown> {
  const event = new KeyboardEvent(type, { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter' })
  return {
    type,
    dispatched: element.dispatchEvent(event),
    defaultPrevented: event.defaultPrevented,
  }
}

function collectPromptDiagnostics(): Record<string, unknown> {
  const editor = document.querySelector<HTMLElement>(KIMI_SELECTORS.editor)
  const sendButton = findKimiSendButton(editor ?? document.body)
  return {
    href: location.href,
    readyState: document.readyState,
    visibilityState: document.visibilityState,
    title: document.title,
    editorText: editor ? readEditorText(editor).slice(0, 500) : undefined,
    editorTextLength: editor ? readEditorText(editor).length : 0,
    editorHtml: editor?.innerHTML.slice(0, 800),
    sendButtonClass: sendButton?.className,
    sendButtons: editor ? describeKimiSendButtons(editor) : [],
    kimiDebugEvents: kimiDebugEvents.slice(-15),
    editorMatches: [...document.querySelectorAll(KIMI_SELECTORS.editor)].slice(0, 5).map(describeElement),
    sendButtonMatches: [...document.querySelectorAll(KIMI_SELECTORS.sendButton)].slice(0, 5).map(describeElement),
    visibleButtonSamples: [...document.querySelectorAll('[role="button"], button, .icon-button, .send-button-container')]
      .slice(0, 12)
      .map(describeElement),
  }
}

function getEditorSnapshot(editor: HTMLElement): Record<string, unknown> {
  const text = readEditorText(editor)
  return {
    editorTextLength: text.length,
    editorTextPreview: text.slice(0, 240),
    editorHtmlPreview: editor.innerHTML.slice(0, 500),
    activeElement: document.activeElement ? describeElement(document.activeElement) : undefined,
  }
}

function describeKimiSendButtons(editor: HTMLElement): Array<Record<string, unknown>> {
  const composer = editor.closest(KIMI_SELECTORS.composer) ?? document.body
  return [...composer.querySelectorAll<HTMLElement>(KIMI_SELECTORS.sendButton)].slice(-5).map(button => ({
    description: describeElement(button),
    className: button.className,
    ariaDisabled: button.getAttribute('aria-disabled'),
    disabled: button instanceof HTMLButtonElement ? button.disabled : undefined,
    clickable: isClickableKimiControl(button),
    text: (button.innerText || button.textContent || '').trim().slice(0, 80),
    iconNames: [...button.querySelectorAll('svg[name]')].map(icon => icon.getAttribute('name')),
  }))
}

function collectKimiLoginDialogSamples(): string[] {
  return [...document.querySelectorAll<HTMLElement>('[role="dialog"], .modal, [class*="login"], [class*="Login"]')]
    .map(element => (element.innerText || element.textContent || '').trim())
    .filter(Boolean)
    .slice(0, 5)
    .map(text => text.slice(0, 240))
}

function logKimiDebug(stage: string, details: Record<string, unknown>): void {
  const event = { at: Date.now(), stage, details }
  kimiDebugEvents.push(event)
  if (kimiDebugEvents.length > KIMI_DEBUG_EVENT_LIMIT) kimiDebugEvents.splice(0, kimiDebugEvents.length - KIMI_DEBUG_EVENT_LIMIT)

  try {
    console.info('[OpenTeam][kimi]', stage, details)
  } catch {
    // Keep diagnostics best-effort; logging must never break prompt delivery.
  }
}

function extractCleanText(node: Node): string {
  return extractCleanTextFromDom(node, { skipTags: SKIP_TAGS })
}

function findResponseContainer(element: Element | null): Element | null {
  const finalMarkdown = findClosestMatchingAncestor(element, KIMI_SELECTORS.response)
  return finalMarkdown && isFinalResponseMarkdown(finalMarkdown) ? finalMarkdown : null
}

function isFinalResponseMarkdown(element: Element): boolean {
  if (element.closest('.thinking-container, .toolcall-container')) return false
  return Boolean(element.closest(KIMI_SELECTORS.responseContainer))
}

function isKimiGenerating(): boolean {
  return Boolean(findKimiStopButton())
}

async function stopKimiGenerating(): Promise<boolean> {
  const button = findKimiStopButton()
  if (!button) return false
  button.click()
  return true
}

function findKimiStopButton(): HTMLElement | undefined {
  const explicit = [...document.querySelectorAll<SVGElement>('svg[name="Stop"], svg[name="Pause"]')]
    .map(icon => icon.closest<HTMLElement>('.send-button-container, .icon-button, button, [role="button"]'))
    .find((button): button is HTMLElement => button !== null && isClickableKimiControl(button))
  if (explicit) return explicit

  return [...document.querySelectorAll<HTMLElement>('[role="button"], button, .icon-button, .send-button-container')].find(
    button => buttonLabelMatches(button, /stop|stopping|停止|中止/) && isClickableKimiControl(button),
  )
}

function isClickableKimiControl(element: HTMLElement): boolean {
  if (element.getAttribute('aria-disabled') === 'true') return false
  if (element instanceof HTMLButtonElement && element.disabled) return false
  if (element.classList.contains('disabled')) return false

  const style = window.getComputedStyle(element)
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0' || style.pointerEvents === 'none') return false
  return true
}
