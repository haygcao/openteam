export type LogDetails = Record<string, unknown>

export interface OpenTeamLogger {
  debug(event: string, details?: LogDetails): void
  info(event: string, details?: LogDetails): void
  warn(event: string, details?: LogDetails): void
  error(event: string, details?: LogDetails): void
  child(context: LogDetails): OpenTeamLogger
}

export interface LoggerOptions {
  debugEnabled?: boolean
}

type ConsoleLevel = 'debug' | 'info' | 'warn' | 'error'

declare const __OPENTEAM_DEV__: boolean | undefined

export function createLogger(scope: string, baseContext: LogDetails = {}, options: LoggerOptions = {}): OpenTeamLogger {
  const shouldEmitVerbose = () => options.debugEnabled ?? isDebugLoggingEnabled()

  const emit = (level: ConsoleLevel, event: string, details: LogDetails = {}): void => {
    if (!shouldEmitVerbose()) return

    const payload = { ...baseContext, ...details }
    console[level](`[OpenTeam][${scope}] ${event}`, payload)
  }

  return {
    debug: (event, details) => emit('debug', event, details),
    info: (event, details) => emit('info', event, details),
    warn: (event, details) => emit('warn', event, details),
    error: (event, details) => emit('error', event, details),
    child: context => createLogger(scope, { ...baseContext, ...context }, options),
  }
}

function isDebugLoggingEnabled(): boolean {
  if (typeof __OPENTEAM_DEV__ !== 'undefined' && __OPENTEAM_DEV__) return true

  try {
    const globalRecord = globalThis as unknown as { OPENTEAM_DEBUG?: boolean; localStorage?: Storage; location?: Location }
    if (globalRecord.OPENTEAM_DEBUG === true) return true
    if (globalRecord.localStorage?.getItem('openteam:debug') === 'true') return true
    if (globalRecord.location?.search.includes('openteam_debug=1')) return true
  } catch {
    // Debug logging should never affect app behavior.
  }

  return false
}
