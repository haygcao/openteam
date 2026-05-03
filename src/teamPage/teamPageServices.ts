import { createLogger } from '../shared/logger'

export const teamPageLog = createLogger('team-page')

export function createErrorPresenter(errorEl: HTMLElement): (message: string) => void {
  return message => {
    errorEl.textContent = message
    errorEl.hidden = false
    window.setTimeout(() => {
      errorEl.hidden = true
    }, 5200)
  }
}
