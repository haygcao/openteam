export function setContentEditableText(editor: HTMLElement, content: string): void {
  editor.focus()
  editor.replaceChildren()

  const block = document.createElement('p')
  block.textContent = content
  editor.append(block)

  editor.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertText', data: content }))
  editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: content }))
  editor.dispatchEvent(new Event('change', { bubbles: true }))
}

export function readEditorText(editor: HTMLElement): string {
  return (editor.innerText || editor.textContent || '').trim()
}

export function isClickableButton(element: HTMLElement): boolean {
  if (!(element instanceof HTMLButtonElement)) return true
  return !element.disabled && element.getAttribute('aria-disabled') !== 'true'
}
