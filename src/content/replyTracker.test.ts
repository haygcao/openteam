import { describe, expect, it } from 'vitest'
import { createReplyTracker } from './replyTracker'

describe('createReplyTracker', () => {
  it('does not report replies that were seeded from existing page history', () => {
    const tracker = createReplyTracker()
    tracker.seed('conv-a', ['old answer 1', 'old answer 2'])

    expect(tracker.consumeIfNew('conv-a', 'old answer 1')).toBe(false)
    expect(tracker.consumeIfNew('conv-a', 'old answer 2')).toBe(false)
  })

  it('reports a new reply once when Gemini rerenders history before the latest answer', () => {
    const tracker = createReplyTracker()
    tracker.seed('conv-a', ['old answer 1', 'old answer 2'])

    const reported = ['old answer 1', 'old answer 2', 'new answer'].filter(text => tracker.consumeIfNew('conv-a', text))

    expect(reported).toEqual(['new answer'])
    expect(tracker.consumeIfNew('conv-a', 'new answer')).toBe(false)
  })

  it('consumes only one reply for a single sent message id', () => {
    const tracker = createReplyTracker()

    expect(tracker.consumeIfNewForMessage('conv-a', 'outer extracted answer', 'msg-1')).toBe(true)
    expect(tracker.consumeIfNewForMessage('conv-a', 'inner extracted answer', 'msg-1')).toBe(false)
    expect(tracker.consumeIfNewForMessage('conv-a', 'late answer without message id', undefined)).toBe(false)
  })
})
