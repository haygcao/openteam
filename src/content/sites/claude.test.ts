// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { createClaudeAdapter } from './claude'

describe('Claude site adapter', () => {
  it('extracts Claude conversation ids and normalized safe urls', () => {
    const adapter = createClaudeAdapter({ href: 'https://claude.ai/chat/abc-123?model=sonnet' })

    expect(adapter.getConversationSnapshot()).toEqual({
      conversationId: 'abc-123',
      conversationUrl: 'https://claude.ai/chat/abc-123?model=sonnet',
    })
  })

  it('does not report non-Claude urls', () => {
    const adapter = createClaudeAdapter({ href: 'https://claude.ai.evil.example/chat/abc-123' })

    expect(adapter.getConversationSnapshot()).toEqual({
      conversationId: undefined,
      conversationUrl: undefined,
    })
  })

  it('writes prompt text into the Claude composer', async () => {
    document.body.innerHTML = `
      <div contenteditable="true" data-testid="chat-input" role="textbox" aria-label="Write your prompt to Claude">
        <p data-placeholder="Write a message…" class="is-empty is-editor-empty"><br></p>
      </div>
    `
    const editor = document.querySelector<HTMLElement>('[data-testid="chat-input"]')!
    const inputListener = vi.fn()
    editor.addEventListener('input', inputListener)

    await createClaudeAdapter().fillAndSend('你好 <claude>', false)

    expect(editor.textContent).toBe('你好 <claude>')
    expect(editor.querySelector('claude')).toBeNull()
    expect(inputListener).toHaveBeenCalledTimes(1)
  })

  it('waits for the Claude send button before clicking', async () => {
    document.body.innerHTML = `
      <div contenteditable="true" data-testid="chat-input" role="textbox"></div>
      <button type="button" aria-label="Use voice mode" disabled>Voice</button>
    `
    const sendButton = document.querySelector<HTMLButtonElement>('button')!
    const clickListener = vi.fn()
    sendButton.addEventListener('click', clickListener)
    window.setTimeout(() => {
      sendButton.disabled = false
      sendButton.setAttribute('aria-label', 'Send message')
    }, 20)

    await createClaudeAdapter({ inputTimeoutMs: 250 }).fillAndSend('hello', true)

    expect(clickListener).toHaveBeenCalledTimes(1)
  })

  it('reads Claude markdown replies without action button text', () => {
    document.body.innerHTML = `
      <div class="group">
        <div class="font-claude-response">
          <div class="standard-markdown">
            <p>我能做很多事情！</p>
            <ul><li>写作</li><li>编程</li></ul>
          </div>
        </div>
        <div role="group" aria-label="Message actions"><button aria-label="Copy">Copy</button></div>
      </div>
    `

    expect(createClaudeAdapter().getAllAssistantReplies()).toEqual(['我能做很多事情！\n\n写作\n编程'])
  })
})
