// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { isClickableButton, setContentEditableText } from './geminiInput'

describe('setContentEditableText', () => {
  it('writes text directly when execCommand would not change an inactive tab editor', () => {
    const editor = document.createElement('div')
    editor.contentEditable = 'true'
    editor.innerHTML = '<p><br></p>'
    const inputListener = vi.fn()
    editor.addEventListener('input', inputListener)
    document.body.append(editor)
    document.execCommand = vi.fn(() => false)

    setContentEditableText(editor, '你好')

    expect(editor.textContent).toBe('你好')
    expect(editor.innerHTML).toContain('你好')
    expect(inputListener).toHaveBeenCalledTimes(1)
  })

  it('escapes html-like text instead of injecting markup', () => {
    const editor = document.createElement('div')
    editor.contentEditable = 'true'

    setContentEditableText(editor, '<hello>')

    expect(editor.textContent).toBe('<hello>')
    expect(editor.querySelector('hello')).toBeNull()
  })
})

describe('isClickableButton', () => {
  it('rejects disabled send buttons', () => {
    const button = document.createElement('button')
    button.disabled = true

    expect(isClickableButton(button)).toBe(false)
  })
})
