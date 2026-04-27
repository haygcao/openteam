import { describe, expect, it } from 'vitest'
import { createTeamRoom } from './teamRoom'

describe('createTeamRoom', () => {
  it('adds roles, records user message, and routes a role mention only to that role tab', () => {
    const room = createTeamRoom('room-1', 10, 1000)
    const a = room.addOpeningRole('A', 101, 'conv-a', 1001)
    const b = room.addOpeningRole('B', 102, 'conv-b', 1002)
    room.markRoleReady(101, 'conv-a', 1003)
    room.markRoleReady(102, 'conv-b', 1004)

    const result = room.sendUserMessage('@A hello', 1005)

    expect(result).toEqual({
      ok: true,
      messageId: 'msg-1005-1',
      deliveries: [{ roleId: a.id, tabId: 101, content: 'hello' }],
    })
    const messages = room.getState().messages
    expect(messages[messages.length - 1]).toMatchObject({
      from: 'user',
      target: 'role',
      targetRoleName: 'A',
      content: 'hello',
      status: 'sent',
    })
    expect(room.getState().roles.find(role => role.id === b.id)?.status).toBe('online')
  })

  it('routes @all to all online roles and skips offline roles', () => {
    const room = createTeamRoom('room-1', 10, 2000)
    room.addOpeningRole('A', 101, 'conv-a', 2001)
    room.addOpeningRole('B', 102, 'conv-b', 2002)
    room.markRoleReady(101, 'conv-a', 2003)
    room.markRoleReady(102, 'conv-b', 2004)
    room.markTabClosed(102, 2005)

    const result = room.sendUserMessage('@all hello', 2006)

    expect(result).toEqual({
      ok: true,
      messageId: 'msg-2006-1',
      deliveries: [{ roleId: 'role-2001-1', tabId: 101, content: 'hello' }],
    })
  })

  it('stores non-mentioned user messages without deliveries', () => {
    const room = createTeamRoom('room-1', 10, 3000)

    const result = room.sendUserMessage('parking lot note', 3001)

    expect(result).toEqual({
      ok: true,
      messageId: 'msg-3001-1',
      deliveries: [],
    })
    const messages = room.getState().messages
    expect(messages[messages.length - 1]).toMatchObject({
      from: 'user',
      target: 'none',
      content: 'parking lot note',
      status: 'sent',
    })
  })

  it('records role replies and returns the message for host push', () => {
    const room = createTeamRoom('room-1', 10, 4000)
    room.addOpeningRole('A', 101, 'conv-a', 4001)
    room.markRoleReady(101, 'conv-a', 4002)

    const reply = room.recordRoleReply(101, 'Looks viable', 4003, 'msg-4002-1')

    expect(reply).toMatchObject({
      id: 'reply-4003-1',
      from: 'role',
      roleName: 'A',
      target: 'none',
      content: 'Looks viable',
      status: 'received',
    })
    expect(room.getState().roles[0].status).toBe('idle')
  })

  it('ignores duplicate replies from the same role tab', () => {
    const room = createTeamRoom('room-1', 10, 5000)
    room.addOpeningRole('A', 101, 'conv-a', 5001)
    room.markRoleReady(101, 'conv-a', 5002)

    const first = room.recordRoleReply(101, 'Same answer', 5003)
    const duplicate = room.recordRoleReply(101, 'Same answer', 5004)

    expect(first).toBeDefined()
    expect(duplicate).toBeUndefined()
    expect(room.getState().messages.filter(message => message.from === 'role')).toHaveLength(1)
  })

  it('allows a role to receive a later message after a transient error', () => {
    const room = createTeamRoom('room-1', 10, 6000)
    const role = room.addOpeningRole('A', 101, 'conv-a', 6001)
    room.markRoleReady(101, 'conv-a', 6002)
    room.markRoleStatus(101, 'error', 6003, 'Gemini 发送按钮暂不可用，请稍后重试')

    const result = room.sendUserMessage('@A retry now', 6004)

    expect(result).toEqual({
      ok: true,
      messageId: 'msg-6004-1',
      deliveries: [{ roleId: role.id, tabId: 101, content: 'retry now' }],
    })
    expect(room.getState().roles[0]).toMatchObject({ status: 'sending' })
    expect(room.getState().roles[0]).not.toHaveProperty('lastError')
  })
})
