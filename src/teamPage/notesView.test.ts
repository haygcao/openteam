// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { createDefaultStore } from '../group/store'
import type { GroupChat, OpenTeamStore, RichNoteDocument } from '../group/types'
import { createTeamPageState } from './appState'
import { createNotesView, type NoteEditorAdapter, type NoteEditorFactory } from './notesView'

describe('team page notes view', () => {
  it('loads global and chat notes into one rich text editor when the scope changes', () => {
    const chat = makeChat('chat-1')
    const store: OpenTeamStore = {
      ...createDefaultStore(),
      currentChatId: chat.id,
      chatOrder: [chat.id],
      chatsById: { [chat.id]: chat },
      globalNote: note('全局笔记'),
      chatNotesById: { [chat.id]: note('群聊笔记') },
    }
    const { view, editor } = setupNotesView(store, chat)

    view.registerNotesEvents()
    view.renderNotes()
    expect(editor.setContent).toHaveBeenLastCalledWith(note('群聊笔记'))

    document.querySelector<HTMLButtonElement>('[data-note-scope="global"]')?.click()

    expect(editor.setContent).toHaveBeenLastCalledWith(note('全局笔记'))
  })

  it('inserts selected message text into the active chat note without source metadata', () => {
    const chat = makeChat('chat-1')
    const store: OpenTeamStore = {
      ...createDefaultStore(),
      currentChatId: chat.id,
      chatOrder: [chat.id],
      chatsById: { [chat.id]: chat },
    }
    const runCommand = vi.fn(async () => undefined)
    const { view, editor } = setupNotesView(store, chat, runCommand)

    view.renderNotes()
    view.insertTextIntoActiveNote('重点内容')

    expect(editor.insertText).toHaveBeenCalledWith('重点内容')
    expect(editor.insertText).not.toHaveBeenCalledWith(expect.stringContaining('来源'))
    expect(runCommand).toHaveBeenCalledWith('GROUP_NOTE_SAVE', {
      scope: 'chat',
      chatId: chat.id,
      content: editor.getJSON(),
    })
  })
})

function setupNotesView(store: OpenTeamStore, chat: GroupChat | undefined, runCommand = vi.fn(async () => undefined)): { view: ReturnType<typeof createNotesView>; editor: NoteEditorAdapter } {
  document.body.innerHTML = `
    <button id="toggle-notes-panel"></button>
    <aside id="notes-panel">
      <button id="close-notes-panel"></button>
      <button id="global-note-tab" data-note-scope="global"></button>
      <button id="chat-note-tab" data-note-scope="chat"></button>
      <div id="notes-editor"></div>
      <button id="note-bold"></button>
      <button id="note-italic"></button>
      <button id="note-strike"></button>
      <button id="note-bullet-list"></button>
      <button id="note-ordered-list"></button>
      <button id="note-undo"></button>
      <button id="note-redo"></button>
    </aside>
  `
  const editor: NoteEditorAdapter = {
    setContent: vi.fn(),
    getJSON: vi.fn(() => note('已更新')),
    insertText: vi.fn(),
    focus: vi.fn(),
    destroy: vi.fn(),
    runCommand: vi.fn(),
  }
  const createEditor: NoteEditorFactory = vi.fn(() => editor)
  const view = createNotesView({
    state: createTeamPageState(),
    notesPanelEl: document.querySelector<HTMLElement>('#notes-panel')!,
    toggleNotesPanelEl: document.querySelector<HTMLButtonElement>('#toggle-notes-panel')!,
    closeNotesPanelEl: document.querySelector<HTMLButtonElement>('#close-notes-panel')!,
    globalNoteTabEl: document.querySelector<HTMLButtonElement>('#global-note-tab')!,
    chatNoteTabEl: document.querySelector<HTMLButtonElement>('#chat-note-tab')!,
    notesEditorEl: document.querySelector<HTMLElement>('#notes-editor')!,
    noteToolbarButtons: {
      bold: document.querySelector<HTMLButtonElement>('#note-bold')!,
      italic: document.querySelector<HTMLButtonElement>('#note-italic')!,
      strike: document.querySelector<HTMLButtonElement>('#note-strike')!,
      bulletList: document.querySelector<HTMLButtonElement>('#note-bullet-list')!,
      orderedList: document.querySelector<HTMLButtonElement>('#note-ordered-list')!,
      undo: document.querySelector<HTMLButtonElement>('#note-undo')!,
      redo: document.querySelector<HTMLButtonElement>('#note-redo')!,
    },
    createEditor,
    getStore: () => store,
    getCurrentChat: () => chat,
    runCommand,
    showError: vi.fn(),
  })
  return { view, editor }
}

function note(text: string): RichNoteDocument {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }
}

function makeChat(id: string): GroupChat {
  return {
    id,
    name: id,
    mode: 'independent',
    roleIds: [],
    messageIds: [],
    nextMessageSeq: 1,
    status: 'ready',
    createdAt: 1,
    updatedAt: 1,
  }
}
