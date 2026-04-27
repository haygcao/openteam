import { describe, expect, it } from 'vitest'
import { parseTeamMention } from './messageParser'
import type { TeamRole } from './types'

const roles: TeamRole[] = [
  {
    id: 'role-a',
    name: 'A',
    tabId: 101,
    conversationId: 'conv-a',
    status: 'online',
    createdAt: 1000,
  },
  {
    id: 'role-pm',
    name: '产品经理',
    tabId: 102,
    conversationId: 'conv-pm',
    status: 'idle',
    createdAt: 1001,
  },
]

describe('parseTeamMention', () => {
  it('routes a leading role mention to the matching role', () => {
    expect(parseTeamMention('@产品经理 看看风险', roles)).toEqual({
      ok: true,
      target: 'role',
      content: '看看风险',
      roleId: 'role-pm',
      targetRoleName: '产品经理',
    })
  })

  it('routes @all to every online-capable role', () => {
    expect(parseTeamMention('@all hello team', roles)).toEqual({
      ok: true,
      target: 'all',
      content: 'hello team',
    })
  })

  it('keeps normal messages in the panel without routing', () => {
    expect(parseTeamMention('just a note', roles)).toEqual({
      ok: true,
      target: 'none',
      content: 'just a note',
    })
  })

  it('rejects an unknown role without falling back to another target', () => {
    expect(parseTeamMention('@Unknown hello', roles)).toEqual({
      ok: false,
      error: '找不到角色：Unknown',
    })
  })

  it('rejects an empty mentioned message', () => {
    expect(parseTeamMention('@A   ', roles)).toEqual({
      ok: false,
      error: '消息内容不能为空',
    })
  })
})
