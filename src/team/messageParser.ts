import type { ParsedTeamMention, TeamRole } from './types'

const MENTION_PATTERN = /^@(\S+)(?:\s+([\s\S]*))?$/

export function parseTeamMention(raw: string, roles: TeamRole[]): ParsedTeamMention {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: false, error: '消息内容不能为空' }

  const mention = trimmed.match(MENTION_PATTERN)
  if (!mention) {
    return { ok: true, target: 'none', content: trimmed }
  }

  const targetName = mention[1]
  const content = (mention[2] || '').trim()
  if (!content) return { ok: false, error: '消息内容不能为空' }

  if (targetName.toLowerCase() === 'all') {
    return { ok: true, target: 'all', content }
  }

  const role = roles.find(item => item.name === targetName)
  if (!role) return { ok: false, error: `找不到角色：${targetName}` }

  return {
    ok: true,
    target: 'role',
    content,
    roleId: role.id,
    targetRoleName: role.name,
  }
}
