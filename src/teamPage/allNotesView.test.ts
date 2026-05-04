// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { createDefaultStore } from '../group/store'
import type { GroupChat, OpenTeamStore, RichNoteDocument } from '../group/types'
import { collectNoteItems, createAllNotesView } from './allNotesView'

describe('all notes view', () => {
  it('collects global, live chat, and deleted chat notes', () => {
    const liveChat = makeChat('chat-live', '产品群')
    const store: OpenTeamStore = {
      ...createDefaultStore(),
      chatOrder: [liveChat.id],
      chatsById: { [liveChat.id]: liveChat },
      globalNote: note('全局记录'),
      chatNotesById: {
        [liveChat.id]: note('群聊记录'),
        'chat-deleted-123456': note('删除后还在的记录'),
      },
    }

    const items = collectNoteItems(store)

    expect(items.map(item => item.title)).toEqual(['全局笔记', '产品群', '已删除群聊 chat-del…'])
    expect(items.map(item => item.meta)).toEqual(['手动记录', '群聊笔记', '已删除群聊的笔记'])
  })

  it('opens from the rail note button and renders deleted chat notes', () => {
    const store: OpenTeamStore = {
      ...createDefaultStore(),
      chatNotesById: {
        'deleted-chat': note('这条笔记不能随着群聊消失'),
      },
    }
    document.body.innerHTML = `
      <button id="open-all-notes"></button>
      <div id="all-notes-modal" hidden>
        <button id="close-all-notes"></button>
        <div id="all-notes-list"></div>
      </div>
    `
    const view = createAllNotesView({
      openAllNotesEl: document.querySelector<HTMLButtonElement>('#open-all-notes')!,
      closeAllNotesEl: document.querySelector<HTMLButtonElement>('#close-all-notes')!,
      allNotesModalEl: document.querySelector<HTMLElement>('#all-notes-modal')!,
      allNotesListEl: document.querySelector<HTMLElement>('#all-notes-list')!,
      getStore: () => store,
    })

    view.registerAllNotesEvents()
    document.querySelector<HTMLButtonElement>('#open-all-notes')?.click()

    expect(document.querySelector<HTMLElement>('#all-notes-modal')?.hidden).toBe(false)
    expect(document.querySelector('.all-note-item.deleted-chat')).not.toBeNull()
    expect(document.querySelector('.all-note-body')?.textContent).toContain('这条笔记不能随着群聊消失')
  })
})

function note(text: string): RichNoteDocument {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }
}

function makeChat(id: string, name: string): GroupChat {
  return {
    id,
    name,
    mode: 'independent',
    roleIds: [],
    messageIds: [],
    nextMessageSeq: 1,
    status: 'ready',
    createdAt: 1,
    updatedAt: 1,
  }
}
