const IMAGE_ATTACHMENT_DATABASE = 'openteam.imageAttachments'
const IMAGE_ATTACHMENT_DATABASE_VERSION = 1
const IMAGE_STORE = 'images'
const CHAT_ID_INDEX = 'chatId'
const MESSAGE_ID_INDEX = 'messageId'

export interface ImageAttachmentBlobRecord {
  id: string
  chatId: string
  messageId: string
  blob: Blob
  mimeType: string
  size: number
  fileName: string
  createdAt: number
}

export interface ImageAttachmentRepository {
  put(record: ImageAttachmentBlobRecord): Promise<void>
  get(id: string): Promise<ImageAttachmentBlobRecord | undefined>
  deleteByIds(ids: string[]): Promise<void>
  deleteByMessageIds(messageIds: string[]): Promise<void>
  deleteByChatId(chatId: string): Promise<void>
  deleteOrphans(referencedIds: Set<string>): Promise<void>
}

export function createIndexedDbImageAttachmentRepository(factory?: IDBFactory): ImageAttachmentRepository {
  let databasePromise: Promise<IDBDatabase> | undefined

  function getDatabase(): Promise<IDBDatabase> {
    const selectedFactory = factory ?? globalThis.indexedDB
    if (!selectedFactory) return Promise.reject(new Error('当前环境不支持图片存储'))
    databasePromise ??= openDatabase(selectedFactory)
    return databasePromise
  }

  return {
    async put(record): Promise<void> {
      const database = await getDatabase()
      const transaction = database.transaction(IMAGE_STORE, 'readwrite')
      transaction.objectStore(IMAGE_STORE).put(record)
      await transactionDone(transaction)
    },

    async get(id): Promise<ImageAttachmentBlobRecord | undefined> {
      const database = await getDatabase()
      const transaction = database.transaction(IMAGE_STORE, 'readonly')
      const request = transaction.objectStore(IMAGE_STORE).get(id)
      const result = await requestResult<ImageAttachmentBlobRecord | undefined>(request)
      await transactionDone(transaction)
      return result
    },

    async deleteByIds(ids): Promise<void> {
      if (ids.length === 0) return
      const database = await getDatabase()
      const transaction = database.transaction(IMAGE_STORE, 'readwrite')
      const store = transaction.objectStore(IMAGE_STORE)
      for (const id of new Set(ids)) store.delete(id)
      await transactionDone(transaction)
    },

    async deleteByMessageIds(messageIds): Promise<void> {
      if (messageIds.length === 0) return
      const database = await getDatabase()
      const transaction = database.transaction(IMAGE_STORE, 'readwrite')
      const index = transaction.objectStore(IMAGE_STORE).index(MESSAGE_ID_INDEX)
      for (const messageId of new Set(messageIds)) deleteIndexMatches(index, messageId)
      await transactionDone(transaction)
    },

    async deleteByChatId(chatId): Promise<void> {
      const database = await getDatabase()
      const transaction = database.transaction(IMAGE_STORE, 'readwrite')
      deleteIndexMatches(transaction.objectStore(IMAGE_STORE).index(CHAT_ID_INDEX), chatId)
      await transactionDone(transaction)
    },

    async deleteOrphans(referencedIds): Promise<void> {
      const database = await getDatabase()
      const transaction = database.transaction(IMAGE_STORE, 'readwrite')
      const request = transaction.objectStore(IMAGE_STORE).openCursor()
      request.addEventListener('success', () => {
        const cursor = request.result
        if (!cursor) return
        const record = cursor.value as ImageAttachmentBlobRecord
        if (!referencedIds.has(record.id)) cursor.delete()
        cursor.continue()
      })
      await transactionDone(transaction)
    },
  }
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(IMAGE_ATTACHMENT_DATABASE, IMAGE_ATTACHMENT_DATABASE_VERSION)
    request.addEventListener('upgradeneeded', () => {
      const database = request.result
      const store = database.objectStoreNames.contains(IMAGE_STORE)
        ? request.transaction!.objectStore(IMAGE_STORE)
        : database.createObjectStore(IMAGE_STORE, { keyPath: 'id' })
      if (!store.indexNames.contains(CHAT_ID_INDEX)) store.createIndex(CHAT_ID_INDEX, CHAT_ID_INDEX)
      if (!store.indexNames.contains(MESSAGE_ID_INDEX)) store.createIndex(MESSAGE_ID_INDEX, MESSAGE_ID_INDEX)
    })
    request.addEventListener('success', () => resolve(request.result))
    request.addEventListener('error', () => reject(request.error ?? new Error('无法打开图片存储')))
    request.addEventListener('blocked', () => reject(new Error('图片存储升级被阻止')))
  })
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result))
    request.addEventListener('error', () => reject(request.error ?? new Error('图片存储请求失败')))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve())
    transaction.addEventListener('abort', () => reject(transaction.error ?? new Error('图片存储事务已中止')))
    transaction.addEventListener('error', () => reject(transaction.error ?? new Error('图片存储事务失败')))
  })
}

function deleteIndexMatches(index: IDBIndex, key: IDBValidKey): void {
  const request = index.openKeyCursor(IDBKeyRange.only(key))
  request.addEventListener('success', () => {
    const cursor = request.result
    if (!cursor) return
    cursor.delete()
    cursor.continue()
  })
}
