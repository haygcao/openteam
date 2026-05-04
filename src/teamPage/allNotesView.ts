import type { OpenTeamStore, RichNoteDocument } from '../group/types'

export interface AllNotesViewDependencies {
  openAllNotesEl: HTMLButtonElement
  closeAllNotesEl: HTMLButtonElement
  allNotesModalEl: HTMLElement
  allNotesListEl: HTMLElement
  getStore(): OpenTeamStore
}

export interface AllNotesView {
  renderAllNotes(): void
  registerAllNotesEvents(): void
}

interface NoteListItem {
  id: string
  title: string
  meta: string
  content: RichNoteDocument
  deletedChat: boolean
}

export function createAllNotesView(deps: AllNotesViewDependencies): AllNotesView {
  function renderAllNotes(): void {
    const items = collectNoteItems(deps.getStore())
    deps.allNotesListEl.replaceChildren()

    if (items.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'all-notes-empty'
      empty.textContent = '还没有笔记'
      deps.allNotesListEl.append(empty)
      return
    }

    for (const item of items) deps.allNotesListEl.append(renderNoteItem(item))
  }

  function registerAllNotesEvents(): void {
    deps.openAllNotesEl.addEventListener('click', () => {
      deps.allNotesModalEl.hidden = false
      renderAllNotes()
    })
    deps.closeAllNotesEl.addEventListener('click', closeAllNotes)
    deps.allNotesModalEl.addEventListener('click', event => {
      if (event.target === deps.allNotesModalEl) closeAllNotes()
    })
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !deps.allNotesModalEl.hidden) closeAllNotes()
    })
  }

  function closeAllNotes(): void {
    deps.allNotesModalEl.hidden = true
  }

  return { renderAllNotes, registerAllNotesEvents }
}

export function collectNoteItems(store: OpenTeamStore): NoteListItem[] {
  const items: NoteListItem[] = []
  if (store.globalNote && !isEmptyNote(store.globalNote)) {
    items.push({
      id: 'global',
      title: '全局笔记',
      meta: '手动记录',
      content: store.globalNote,
      deletedChat: false,
    })
  }

  const chatNotes = store.chatNotesById ?? {}
  const orderedChatIds = [
    ...store.chatOrder,
    ...Object.keys(chatNotes).filter(chatId => !store.chatOrder.includes(chatId)).sort(),
  ]
  for (const chatId of orderedChatIds) {
    const content = chatNotes[chatId]
    if (!content || isEmptyNote(content)) continue
    const chat = store.chatsById[chatId]
    items.push({
      id: chatId,
      title: chat?.name ?? `已删除群聊 ${shortId(chatId)}`,
      meta: chat ? '群聊笔记' : '已删除群聊的笔记',
      content,
      deletedChat: !chat,
    })
  }

  return items
}

function renderNoteItem(item: NoteListItem): HTMLElement {
  const article = document.createElement('article')
  article.className = `all-note-item${item.deletedChat ? ' deleted-chat' : ''}`
  article.dataset.noteId = item.id

  const header = document.createElement('div')
  header.className = 'all-note-item-header'
  const title = document.createElement('h3')
  title.textContent = item.title
  const meta = document.createElement('span')
  meta.className = 'all-note-meta'
  meta.textContent = item.meta
  header.append(title, meta)

  const body = document.createElement('div')
  body.className = 'all-note-body'
  renderRichNoteDocument(item.content, body)

  article.append(header, body)
  return article
}

function renderRichNoteDocument(noteDocument: RichNoteDocument, parent: HTMLElement): void {
  const children = Array.isArray(noteDocument.content) ? noteDocument.content : []
  for (const child of children) parent.append(renderRichNoteNode(child))
  if (parent.childNodes.length === 0) {
    const paragraph = document.createElement('p')
    paragraph.textContent = notePlainText(noteDocument)
    parent.append(paragraph)
  }
}

function renderRichNoteNode(node: RichNoteDocument): HTMLElement {
  const tagName = node.type === 'bulletList'
    ? 'ul'
    : node.type === 'orderedList'
      ? 'ol'
      : node.type === 'listItem'
        ? 'li'
        : 'p'
  const element = document.createElement(tagName)
  appendInlineContent(node, element)
  return element
}

function appendInlineContent(node: RichNoteDocument, parent: HTMLElement): void {
  if (typeof node.text === 'string') {
    parent.append(document.createTextNode(node.text))
    return
  }
  const children = Array.isArray(node.content) ? node.content : []
  for (const child of children) {
    if (child.type === 'text') {
      parent.append(document.createTextNode(typeof child.text === 'string' ? child.text : ''))
    } else if (child.type === 'hardBreak') {
      parent.append(document.createElement('br'))
    } else {
      parent.append(renderRichNoteNode(child))
    }
  }
}

function isEmptyNote(document: RichNoteDocument): boolean {
  return notePlainText(document).trim().length === 0
}

function notePlainText(node: RichNoteDocument): string {
  const ownText = typeof node.text === 'string' ? node.text : ''
  const childText = Array.isArray(node.content) ? node.content.map(notePlainText).join(' ') : ''
  return `${ownText} ${childText}`.trim()
}

function shortId(chatId: string): string {
  return chatId.length > 8 ? `${chatId.slice(0, 8)}…` : chatId
}
