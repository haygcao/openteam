export function createReplyTimeout(timeoutMs: number, onTimeout: (messageId: string) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let activeMessageId: string | undefined

  return {
    arm(messageId: string): void {
      this.clear()
      activeMessageId = messageId
      timer = setTimeout(() => {
        const timedOutMessageId = activeMessageId
        activeMessageId = undefined
        timer = undefined
        if (timedOutMessageId) onTimeout(timedOutMessageId)
      }, timeoutMs)
    },

    clear(): void {
      if (timer) clearTimeout(timer)
      timer = undefined
      activeMessageId = undefined
    },
  }
}
