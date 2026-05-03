const KIMI_WRITE_REQUEST_EVENT = 'openteam:kimi-write-request'
const KIMI_WRITE_RESPONSE_EVENT = 'openteam:kimi-write-response'
const bridgeWindow = window as Window & { __OPENTEAM_KIMI_PAGE_WORLD_WRITER__?: boolean }

if (!bridgeWindow.__OPENTEAM_KIMI_PAGE_WORLD_WRITER__) {
  bridgeWindow.__OPENTEAM_KIMI_PAGE_WORLD_WRITER__ = true
  logKimiPageBridge('bridge:installed', {
    href: location.href,
    readyState: document.readyState,
    visibilityState: document.visibilityState,
  })

  document.documentElement.addEventListener(KIMI_WRITE_REQUEST_EVENT, handleKimiWriteRequest)
}

function handleKimiWriteRequest(event: Event): void {
  const detail = parseEventDetail((event as CustomEvent<unknown>).detail)
  if (!detail) return

  const requestId = typeof detail.requestId === 'string' ? detail.requestId : undefined
  const selector = typeof detail.selector === 'string' ? detail.selector : undefined
  const content = typeof detail.content === 'string' ? detail.content : ''

  if (!requestId || !selector) {
    logKimiPageBridge('write:invalid-request', {
      hasRequestId: Boolean(requestId),
      hasSelector: Boolean(selector),
      contentLength: content.length,
    })
    return
  }

  logKimiPageBridge('write:request', {
    requestId,
    selector,
    contentLength: content.length,
    trimmedContentLength: content.trim().length,
    activeElement: describePageElement(document.activeElement),
  })

  const editor = document.querySelector<HTMLElement>(selector)
  if (!editor) {
    respond({ requestId, ok: false, reason: 'editor-not-found', selector })
    logKimiPageBridge('write:editor-not-found', { requestId, selector })
    return
  }

  try {
    editor.focus()
    selectContents(editor)
    const beforeInputDeleteResult = typeof document.execCommand === 'function' ? document.execCommand('delete', false) : undefined

    editor.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: content }))
    const afterBeforeInput = getEditorSnapshot(editor)
    logKimiPageBridge('write:after-beforeinput', { requestId, deleteResult: beforeInputDeleteResult, ...afterBeforeInput })

    let currentSnapshot = afterBeforeInput
    if (!textMatchesContent(afterBeforeInput.text, content)) {
      const pasteResult = dispatchSyntheticPaste(editor, content)
      currentSnapshot = getEditorSnapshot(editor)
      logKimiPageBridge('write:after-synthetic-paste', { requestId, pasteResult, ...currentSnapshot })
    }

    if (!textMatchesContent(currentSnapshot.text, content) && typeof document.execCommand === 'function') {
      selectContents(editor)
      const deleteResult = document.execCommand('delete', false)
      const insertTextResult = document.execCommand('insertText', false, content)
      const afterInsertText = getEditorSnapshot(editor)
      logKimiPageBridge('write:after-execCommand-insertText', { requestId, deleteResult, insertTextResult, ...afterInsertText })

      if (!textMatchesContent(afterInsertText.text, content)) {
        selectContents(editor)
        const htmlDeleteResult = document.execCommand('delete', false)
        const insertHtmlResult = document.execCommand('insertHTML', false, toLexicalParagraphHtml(content))
        logKimiPageBridge('write:after-execCommand-insertHTML', { requestId, deleteResult: htmlDeleteResult, insertHtmlResult, ...getEditorSnapshot(editor) })
      }
    }

    const finalSnapshot = getEditorSnapshot(editor)
    const ok = textMatchesContent(finalSnapshot.text, content)
    respond({
      requestId,
      ok,
      text: finalSnapshot.text.slice(0, 500),
      textLength: finalSnapshot.text.length,
      html: finalSnapshot.html.slice(0, 800),
      activeElement: describePageElement(document.activeElement),
    })
    logKimiPageBridge('write:respond', {
      requestId,
      ok,
      textLength: finalSnapshot.text.length,
      htmlPreview: finalSnapshot.html.slice(0, 200),
      activeElement: describePageElement(document.activeElement),
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    respond({ requestId, ok: false, reason })
    logKimiPageBridge('write:error', { requestId, reason })
  }
}

function respond(payload: Record<string, unknown>): void {
  document.documentElement.dispatchEvent(new CustomEvent(KIMI_WRITE_RESPONSE_EVENT, { detail: JSON.stringify(payload) }))
}

function dispatchSyntheticPaste(editor: HTMLElement, content: string): boolean {
  try {
    const clipboardData = new DataTransfer()
    clipboardData.setData('text/plain', content)
    clipboardData.setData('text/html', toLexicalParagraphHtml(content))
    return editor.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }))
  } catch {
    return false
  }
}

function parseEventDetail(value: unknown): Record<string, unknown> | undefined {
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

function selectContents(editor: HTMLElement): boolean {
  const selection = window.getSelection()
  if (!selection) return false

  const range = document.createRange()
  range.selectNodeContents(editor)
  selection.removeAllRanges()
  selection.addRange(range)
  return true
}

function getEditorSnapshot(editor: HTMLElement): { text: string; html: string } {
  return {
    text: ((editor.innerText || editor.textContent) ?? '').trim(),
    html: editor.innerHTML,
  }
}

function textMatchesContent(text: string, content: string): boolean {
  const actual = text.trim()
  const expected = content.trim()
  if (actual === expected) return true
  return expected.length > 500 && actual.length > 0 && expected.startsWith(actual)
}

function toLexicalParagraphHtml(content: string): string {
  const escaped = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  return `<p dir="ltr"><span data-lexical-text="true">${escaped}</span></p>`
}

function describePageElement(element: Element | null): Record<string, unknown> | undefined {
  if (!element) return undefined
  return {
    tagName: element.tagName,
    id: element.id || undefined,
    className: typeof element.className === 'string' ? element.className : undefined,
    role: element.getAttribute('role') || undefined,
    ariaDisabled: element.getAttribute('aria-disabled') || undefined,
  }
}

function logKimiPageBridge(stage: string, details: Record<string, unknown>): void {
  try {
    console.info('[OpenTeam][kimi-page]', stage, details)
  } catch {
    // Logging is diagnostic only and must never affect page input.
  }
}
