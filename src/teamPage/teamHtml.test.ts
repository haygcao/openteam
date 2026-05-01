import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('team.html chat creation UI', () => {
  it('offers an explicit chat mode choice before creating a chat from the plus button', () => {
    const html = readFileSync(resolve(process.cwd(), 'public/team.html'), 'utf8')

    expect(html).toContain('id="chat-create-popover"')
    expect(html).toContain('id="new-chat-mode-independent"')
    expect(html).toContain('id="new-chat-mode-collaborative"')
    expect(html).toContain('协作群聊')
  })
})
