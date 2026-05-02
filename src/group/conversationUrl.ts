const GEMINI_ORIGIN = 'https://gemini.google.com'
const GEMINI_HOME_URL = `${GEMINI_ORIGIN}/`
const GEMINI_APP_PREFIX = '/app/'
const CHATGPT_ORIGIN = 'https://chatgpt.com'
const CHATGPT_HOME_URL = 'https://chatgpt.com/'
const CHATGPT_HOSTS = new Set(['chatgpt.com', 'chat.openai.com'])
type ChatSite = 'gemini' | 'chatgpt'

export function isSafeGeminiUrl(value: string | undefined): value is string {
  if (!value || !value.startsWith(GEMINI_HOME_URL)) return false

  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'gemini.google.com'
  } catch {
    return false
  }
}

export function getSafeGeminiUrl(value: string | undefined): string {
  return isSafeGeminiUrl(value) ? value : GEMINI_HOME_URL
}

export function getSafeGeminiIframeSrc(value: string | undefined): string {
  return getSafeGeminiUrl(value)
}

export function isSafeSupportedChatUrl(value: string | undefined): value is string {
  return isSafeGeminiUrl(value) || isSafeChatGptUrl(value)
}

export function getSafeSupportedChatUrl(value: string | undefined): string {
  return isSafeSupportedChatUrl(value) ? value : GEMINI_HOME_URL
}

export function getSafeSupportedChatIframeSrc(value: string | undefined): string {
  return getSafeSupportedChatUrl(value)
}

export function getDefaultChatSiteUrl(site: ChatSite | undefined): string {
  return site === 'chatgpt' ? CHATGPT_HOME_URL : GEMINI_HOME_URL
}

export function getSafeSupportedChatIframeSrcForSite(value: string | undefined, site: ChatSite | undefined): string {
  return isSafeSupportedChatUrl(value) ? value : getDefaultChatSiteUrl(site)
}

export function normalizeSupportedChatConversationUrl(value: string | undefined): string | undefined {
  return isSafeSupportedChatUrl(value) ? new URL(value).href : undefined
}

export function extractSupportedConversationId(value: string | undefined): string | undefined {
  return extractGeminiConversationId(value) ?? extractChatGptConversationId(value)
}

export function getSupportedChatOrigin(value: string | undefined): string {
  if (!isSafeSupportedChatUrl(value)) return GEMINI_ORIGIN
  return new URL(value).origin
}

export function getSupportedChatOriginForSite(value: string | undefined, site: ChatSite | undefined): string {
  if (isSafeSupportedChatUrl(value)) return new URL(value).origin
  return site === 'chatgpt' ? CHATGPT_ORIGIN : GEMINI_ORIGIN
}

export function extractGeminiConversationId(value: string | undefined): string | undefined {
  if (!isSafeGeminiUrl(value)) return undefined

  const url = new URL(value)
  if (!url.pathname.startsWith(GEMINI_APP_PREFIX)) return undefined

  const conversationId = url.pathname.slice(GEMINI_APP_PREFIX.length).split('/')[0]
  return conversationId ? decodeURIComponent(conversationId) : undefined
}

export function normalizeGeminiConversationUrl(value: string | undefined): string | undefined {
  return isSafeGeminiUrl(value) ? new URL(value).href : undefined
}

function isSafeChatGptUrl(value: string | undefined): value is string {
  if (!value || (!value.startsWith(CHATGPT_HOME_URL) && !value.startsWith('https://chat.openai.com/'))) return false

  try {
    const url = new URL(value)
    return url.protocol === 'https:' && CHATGPT_HOSTS.has(url.hostname)
  } catch {
    return false
  }
}

function extractChatGptConversationId(value: string | undefined): string | undefined {
  if (!isSafeChatGptUrl(value)) return undefined

  const url = new URL(value)
  if (!url.pathname.startsWith('/c/')) return undefined

  const conversationId = url.pathname.slice('/c/'.length).split('/')[0]
  return conversationId ? decodeURIComponent(conversationId) : undefined
}
