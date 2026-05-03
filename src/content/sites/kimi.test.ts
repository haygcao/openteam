// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { createKimiAdapter } from './kimi'

describe('Kimi site adapter', () => {
  it('extracts Kimi conversation ids and normalized safe urls', () => {
    const adapter = createKimiAdapter({ href: 'https://www.kimi.com/chat/abc-123?source=openteam' })

    expect(adapter.getConversationSnapshot()).toEqual({
      conversationId: 'abc-123',
      conversationUrl: 'https://www.kimi.com/chat/abc-123?source=openteam',
    })
  })

  it('does not report non-Kimi urls', () => {
    const adapter = createKimiAdapter({ href: 'https://www.kimi.com.evil.example/chat/abc-123' })

    expect(adapter.getConversationSnapshot()).toEqual({
      conversationId: undefined,
      conversationUrl: undefined,
    })
  })

  it('writes prompt text into the Kimi lexical composer', async () => {
    document.body.innerHTML = `
      <div class="chat-editor">
        <div class="chat-input-editor" contenteditable="true" data-lexical-editor="true" role="textbox"><p><br></p></div>
      </div>
    `
    const editor = document.querySelector<HTMLElement>('.chat-input-editor')!
    const inputListener = vi.fn()
    editor.addEventListener('input', inputListener)

    await createKimiAdapter().fillAndSend('你好 <kimi>', false)

    expect(editor.textContent).toBe('你好 <kimi>')
    expect(inputListener).not.toHaveBeenCalled()
  })

  it('does not duplicate prompt text when Lexical handles input events', async () => {
    document.body.innerHTML = `
      <div class="chat-editor">
        <div class="chat-input-editor" contenteditable="true" data-lexical-editor="true" role="textbox"><p><br></p></div>
      </div>
    `
    const editor = document.querySelector<HTMLElement>('.chat-input-editor')!
    editor.addEventListener('input', event => {
      const data = (event as InputEvent).data
      if (!data) return

      const block = document.createElement('p')
      block.textContent = data
      editor.append(block)
    })

    await createKimiAdapter().fillAndSend('只写一次', false)

    expect(editor.textContent).toBe('只写一次')
  })

  it('uses Kimi beforeinput insertion without firing a second input event', async () => {
    document.body.innerHTML = `
      <div class="chat-editor">
        <div class="chat-input-editor" contenteditable="true" data-lexical-editor="true" role="textbox"><p>旧内容</p></div>
      </div>
    `
    const editor = document.querySelector<HTMLElement>('.chat-input-editor')!
    const originalExecCommand = document.execCommand
    const inputListener = vi.fn()
    const execCommand = vi.fn((command: string) => {
      if (command === 'delete') editor.replaceChildren()
      return true
    })
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    })
    editor.addEventListener('beforeinput', event => {
      const data = (event as InputEvent).data
      if (!data) return

      const block = document.createElement('p')
      block.textContent = data
      editor.append(block)
    })
    editor.addEventListener('input', inputListener)

    try {
      await createKimiAdapter().fillAndSend('来自 beforeinput', false)
    } finally {
      Object.defineProperty(document, 'execCommand', {
        configurable: true,
        value: originalExecCommand,
      })
    }

    expect(editor.textContent).toBe('来自 beforeinput')
    expect(execCommand).toHaveBeenCalledWith('delete', false)
    expect(execCommand).not.toHaveBeenCalledWith('insertText', false, '来自 beforeinput')
    expect(inputListener).not.toHaveBeenCalled()
  })

  it('uses an injected page-world writer when isolated-world editing cannot update Kimi', async () => {
    document.body.innerHTML = `
      <div class="chat-editor">
        <div class="chat-input-editor" contenteditable="true" data-lexical-editor="true" role="textbox"><p><br></p></div>
      </div>
    `
    const editor = document.querySelector<HTMLElement>('.chat-input-editor')!
    const originalExecCommand = document.execCommand
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => true),
    })
    document.documentElement.addEventListener('openteam:kimi-write-request', event => {
      const rawDetail = (event as CustomEvent<string | { requestId: string; content: string }>).detail
      const detail = typeof rawDetail === 'string' ? JSON.parse(rawDetail) as { requestId: string; content: string } : rawDetail
      editor.replaceChildren()
      const block = document.createElement('p')
      block.textContent = detail.content
      editor.append(block)
      document.documentElement.dispatchEvent(
        new CustomEvent('openteam:kimi-write-response', {
          detail: JSON.stringify({
            requestId: detail.requestId,
            ok: true,
            text: editor.textContent,
            html: editor.innerHTML,
          }),
        }),
      )
    })

    const adapter = createKimiAdapter()
    try {
      await adapter.fillAndSend('页面主世界写入', false)
    } finally {
      Object.defineProperty(document, 'execCommand', {
        configurable: true,
        value: originalExecCommand,
      })
    }

    const diagnostics = adapter.collectPromptDiagnostics?.() ?? {}
    const events = diagnostics.kimiDebugEvents as Array<{ stage: string; details: { strategy?: string; attempts?: Array<{ strategy?: string; accepted?: boolean }> } }>
    const writeResult = [...events].reverse().find(event => event.stage === 'fill:write-result')?.details
    expect(editor.textContent).toBe('页面主世界写入')
    expect(writeResult?.strategy).toBe('page-world-writer')
    expect(writeResult?.attempts?.find(attempt => attempt.strategy === 'page-world-writer')?.accepted).toBe(true)
  })

  it('falls back to clipboard paste before touching Kimi editor DOM directly', async () => {
    document.body.innerHTML = `
      <div class="chat-editor">
        <div class="chat-input-editor" contenteditable="true" data-lexical-editor="true" role="textbox"><p><br></p></div>
      </div>
    `
    const editor = document.querySelector<HTMLElement>('.chat-input-editor')!
    const originalExecCommand = document.execCommand
    const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(Navigator.prototype, 'clipboard')
    let clipboardText = ''
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        readText: vi.fn(async () => 'previous clipboard'),
        writeText: vi.fn(async (text: string) => {
          clipboardText = text
        }),
      },
    })
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn((command: string) => {
        if (command === 'delete') {
          editor.replaceChildren()
          return true
        }
        if (command === 'paste') {
          const block = document.createElement('p')
          block.textContent = clipboardText
          editor.append(block)
          return true
        }
        return true
      }),
    })

    const adapter = createKimiAdapter()
    try {
      await adapter.fillAndSend('剪贴板写入', false)
    } finally {
      Object.defineProperty(document, 'execCommand', {
        configurable: true,
        value: originalExecCommand,
      })
      if (originalClipboardDescriptor) {
        Object.defineProperty(Navigator.prototype, 'clipboard', originalClipboardDescriptor)
      } else {
        Reflect.deleteProperty(navigator, 'clipboard')
      }
    }

    const diagnostics = adapter.collectPromptDiagnostics?.() ?? {}
    const events = diagnostics.kimiDebugEvents as Array<{ stage: string; details: { strategy?: string } }>
    const writeResult = [...events].reverse().find(event => event.stage === 'fill:write-result')?.details
    expect(editor.textContent).toBe('剪贴板写入')
    expect(writeResult?.strategy).toBe('clipboard-paste')
  })

  it('clicks the enabled Kimi send button near the composer', async () => {
    document.body.innerHTML = `
      <div class="chat-editor">
        <div class="chat-input-editor" contenteditable="true" data-lexical-editor="true" role="textbox"><p><br></p></div>
        <div class="chat-editor-action">
          <div class="right-area">
            <div class="current-model">K2.6 思考</div>
            <div class="send-button-container">
              <svg name="Send"></svg>
            </div>
          </div>
        </div>
      </div>
    `
    const sendButton = document.querySelector<HTMLElement>('.send-button-container')!
    const clickListener = vi.fn()
    sendButton.addEventListener('click', clickListener)

    await createKimiAdapter({ inputTimeoutMs: 250 }).fillAndSend('hello', true)

    expect(clickListener).toHaveBeenCalledTimes(1)
  })

  it('reads only final assistant markdown replies and skips thinking content', () => {
    document.body.innerHTML = `
      <div class="chat-content-item chat-content-item-assistant">
        <div class="segment segment-assistant">
          <div class="thinking-container">
            <div class="markdown-container toolcall-content-text">
              <div class="markdown"><div class="paragraph">内部思考</div></div>
            </div>
          </div>
          <div class="markdown-container">
            <div class="markdown">
              <div class="paragraph">你好！很高兴见到你。</div>
            </div>
          </div>
        </div>
      </div>
    `

    expect(createKimiAdapter().getAllAssistantReplies()).toEqual(['你好！很高兴见到你。'])
  })

  it('converts Kimi reply DOM to markdown', () => {
    document.body.innerHTML = `
      <div class="chat-content-item chat-content-item-assistant">
        <div class="markdown-container">
          <div class="markdown">
            <h2>方案</h2>
            <p><strong>结论</strong>：可以做</p>
            <ul><li>先接入 adapter</li><li>再验证 iframe</li></ul>
          </div>
        </div>
      </div>
    `
    const response = document.querySelector('.markdown')!

    expect(createKimiAdapter().readResponseMarkdown?.(response)).toBe('## 方案\n\n**结论**：可以做\n\n- 先接入 adapter\n- 再验证 iframe')
  })
})
