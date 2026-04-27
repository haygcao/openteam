function hashStr(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (Math.imul(31, hash) + value.charCodeAt(index)) | 0
  }
  return hash >>> 0
}

function replyKey(conversationId: string, text: string): string {
  return String(hashStr(`${conversationId}:${text.trim()}`))
}

export function createReplyTracker() {
  const seenReplyHashes = new Set<string>()
  const consumedMessageIds = new Set<string>()

  return {
    seed(conversationId: string, replies: string[]): void {
      for (const reply of replies) {
        const trimmed = reply.trim()
        if (trimmed) seenReplyHashes.add(replyKey(conversationId, trimmed))
      }
    },

    consumeIfNew(conversationId: string, reply: string): boolean {
      const trimmed = reply.trim()
      if (!trimmed) return false

      const key = replyKey(conversationId, trimmed)
      if (seenReplyHashes.has(key)) return false

      seenReplyHashes.add(key)
      return true
    },

    consumeIfNewForMessage(conversationId: string, reply: string, messageId: string | undefined): boolean {
      if (!messageId) return false
      if (consumedMessageIds.has(messageId)) return false
      if (!this.consumeIfNew(conversationId, reply)) return false

      consumedMessageIds.add(messageId)
      return true
    },
  }
}
