// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { readResyncReplyText } from './reportableReply'
import type { ChatSiteAdapter } from './sites/types'

describe('readResyncReplyText', () => {
  it('prefers a longer matching reply over the exact truncated current content', async () => {
    const short = appendReply('当前漏掉的回复')
    const full = appendReply('当前漏掉的回复，后面还有完整内容。')
    const adapter = makeAdapter([short, full])

    const result = await readResyncReplyText(adapter, '当前漏掉的回复', { debug: vi.fn(), info: vi.fn(), warn: vi.fn() })

    expect(result.text).toBe('当前漏掉的回复，后面还有完整内容。')
  })

  it('falls back to a later longer reply when no candidate contains the current truncated text', async () => {
    const short = appendReply('当前漏掉的回复')
    const full = appendReply('这是页面上最后一条完整回复。')
    const adapter = makeAdapter([short, full])

    const result = await readResyncReplyText(adapter, '当前漏掉的回复', { debug: vi.fn(), info: vi.fn(), warn: vi.fn() })

    expect(result.text).toBe('这是页面上最后一条完整回复。')
  })

  it('resyncs a pure image reply when the current message has no text', async () => {
    const imageReply = appendReply('')
    imageReply.innerHTML = '<img src="https://chatgpt.com/backend-api/estuary/content?id=image">'
    const adapter = makeAdapter([imageReply])
    adapter.readResponseImages = () => [{
      sourceUrl: 'https://chatgpt.com/backend-api/estuary/content?id=image',
      alt: '已生成图片',
    }]

    const result = await readResyncReplyText(adapter, '', { debug: vi.fn(), info: vi.fn(), warn: vi.fn() })

    expect(result).toEqual({
      text: '',
      images: [{
        sourceUrl: 'https://chatgpt.com/backend-api/estuary/content?id=image',
        alt: '已生成图片',
      }],
    })
  })
})

function appendReply(text: string): HTMLElement {
  const element = document.createElement('article')
  element.textContent = text
  document.body.append(element)
  return element
}

function makeAdapter(responses: Element[]): ChatSiteAdapter {
  return {
    id: 'chatgpt',
    getConversationSnapshot: () => ({}),
    getConversationId: () => '__default__',
    getResponseContainers: () => responses,
    getAllAssistantReplies: () => responses.map(response => response.textContent ?? ''),
    readResponseText: node => node.textContent ?? '',
    findResponseContainer: () => null,
    isGenerating: () => false,
    stopGenerating: async () => false,
    fillAndSend: async () => undefined,
    collectPromptDiagnostics: () => ({}),
  }
}
