import { createClaudeAdapter } from './claude'
import { createChatGptAdapter } from './chatgpt'
import { createDeepSeekAdapter } from './deepseek'
import { createGeminiAdapter } from './gemini'
import { createKimiAdapter } from './kimi'
import type { ChatSiteAdapter } from './types'

export function getActiveChatSiteAdapter(): ChatSiteAdapter {
  if (location.hostname === 'claude.ai') return createClaudeAdapter()
  if (location.hostname === 'chat.deepseek.com') return createDeepSeekAdapter()
  if (location.hostname === 'www.kimi.com') return createKimiAdapter()
  if (location.hostname === 'chatgpt.com' || location.hostname === 'chat.openai.com') return createChatGptAdapter()
  return createGeminiAdapter()
}
