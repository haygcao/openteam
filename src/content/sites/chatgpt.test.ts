// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { createChatGptAdapter } from './chatgpt'

describe('ChatGPT site adapter', () => {
  it('extracts ChatGPT conversation ids and normalized safe urls', () => {
    const adapter = createChatGptAdapter({ href: 'https://chatgpt.com/c/abc-123?model=gpt-5' })

    expect(adapter.getConversationSnapshot()).toEqual({
      conversationId: 'abc-123',
      conversationUrl: 'https://chatgpt.com/c/abc-123?model=gpt-5',
    })
  })

  it('does not report non-ChatGPT urls', () => {
    const adapter = createChatGptAdapter({ href: 'https://chatgpt.com.evil.example/c/abc-123' })

    expect(adapter.getConversationSnapshot()).toEqual({
      conversationId: undefined,
      conversationUrl: undefined,
    })
  })

  it('writes prompt text into the ProseMirror composer', async () => {
    document.body.innerHTML = `
      <form data-type="unified-composer">
        <div contenteditable="true" class="ProseMirror" id="prompt-textarea" role="textbox" aria-label="与 ChatGPT 聊天">
          <p data-placeholder="有问题，尽管问" class="placeholder"><br></p>
        </div>
      </form>
    `
    const editor = document.querySelector<HTMLElement>('#prompt-textarea')!
    const inputListener = vi.fn()
    editor.addEventListener('input', inputListener)

    await createChatGptAdapter().fillAndSend('你好 <test>', false)

    expect(editor.textContent).toBe('你好 <test>')
    expect(editor.querySelector('test')).toBeNull()
    expect(inputListener).toHaveBeenCalledTimes(1)
  })

  it('waits for the ChatGPT send button before clicking', async () => {
    document.body.innerHTML = `
      <form data-type="unified-composer">
        <div contenteditable="true" class="ProseMirror" id="prompt-textarea" role="textbox"></div>
        <button type="button" aria-label="启动语音功能" disabled>Voice</button>
      </form>
    `
    const voiceButton = document.querySelector<HTMLButtonElement>('button')!
    const clickListener = vi.fn()
    voiceButton.addEventListener('click', clickListener)
    window.setTimeout(() => {
      voiceButton.disabled = false
      voiceButton.setAttribute('aria-label', '发送提示')
    }, 20)

    await createChatGptAdapter({ inputTimeoutMs: 250 }).fillAndSend('hello', true)

    expect(clickListener).toHaveBeenCalledTimes(1)
  })

  it('reads assistant markdown replies without action button text', () => {
    document.body.innerHTML = `
      <section data-turn="assistant" data-testid="conversation-turn-2">
        <div data-message-author-role="assistant" data-message-id="reply-1">
          <div class="markdown">
            <p>你好！今天想聊点什么？</p>
            <ul><li><p>调研</p></li><li><p>写代码</p></li></ul>
          </div>
        </div>
        <div aria-label="回复操作"><button aria-label="复制回复">复制回复</button></div>
      </section>
    `

    expect(createChatGptAdapter().getAllAssistantReplies()).toEqual(['你好！今天想聊点什么？\n\n调研\n\n写代码'])
  })
})
