import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'

const rootDir = resolve(new URL('..', import.meta.url).pathname)
const extensionDir = resolve(rootDir, 'dist')
const debuggingPort = Number(process.env.OPENTEAM_E2E_PORT || 9333 + Math.floor(Math.random() * 200))
const installedExtensionId = process.env.OPENTEAM_EXTENSION_ID
const shouldLoadUnpacked = process.env.OPENTEAM_LOAD_UNPACKED === '1'
const cdpBaseUrl = process.env.OPENTEAM_CDP_URL ? normalizeBaseUrl(process.env.OPENTEAM_CDP_URL) : undefined
const chromePath = cdpBaseUrl ? undefined : findChromePath()
const userDataDir = cdpBaseUrl
  ? undefined
  : process.env.CHROME_USER_DATA_DIR
    ? resolvePath(process.env.CHROME_USER_DATA_DIR)
    : shouldLoadUnpacked
      ? await mkdtemp(join(tmpdir(), 'openteam-e2e-'))
      : undefined
const ownsUserDataDir = Boolean(userDataDir) && shouldLoadUnpacked && !process.env.CHROME_USER_DATA_DIR
let chromeProcess
let chromeStderr = ''

try {
  if (!installedExtensionId && !shouldLoadUnpacked) {
    throw new Error('Set OPENTEAM_EXTENSION_ID for an installed extension smoke test, or set OPENTEAM_LOAD_UNPACKED=1 for temporary unpacked loading.')
  }

  const baseUrl = cdpBaseUrl ?? `http://127.0.0.1:${debuggingPort}`
  if (!cdpBaseUrl) {
    if (!userDataDir) throw new Error('Set CHROME_USER_DATA_DIR when using OPENTEAM_EXTENSION_ID with a launched Chrome profile.')
    chromeProcess = launchChrome(userDataDir)
  }

  const version = await waitForJson(`${baseUrl}/json/version`, 15_000)
  const browser = await connectCdp(version.webSocketDebuggerUrl)
  const extensionId = installedExtensionId ?? await waitForExtensionId(baseUrl, browser, userDataDir)
  const extensionPageUrl = `chrome-extension://${extensionId}/team.html`
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' })
  browser.close()

  const pageTarget = await waitForTarget(baseUrl, target => target.id === targetId)
  const page = await connectCdp(pageTarget.webSocketDebuggerUrl)
  await page.send('Page.enable')
  await page.send('Page.navigate', { url: extensionPageUrl })
  await waitForPageReady(page, extensionId, userDataDir)
  const title = await page.send('Runtime.evaluate', { expression: 'document.title', returnByValue: true })
  const appExists = await page.send('Runtime.evaluate', { expression: 'Boolean(document.querySelector("#app"))', returnByValue: true })
  page.close()

  if (title.result.value !== 'OpenTeam') throw new Error(`Unexpected team page title: ${title.result.value}`)
  if (appExists.result.value !== true) throw new Error('OpenTeam app shell was not rendered')

  console.log(`[OpenTeam][e2e] Opened OpenTeam extension ${extensionId} team.html`)
} finally {
  if (chromeProcess) await stopChrome(chromeProcess)
  if (ownsUserDataDir) await rm(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

function launchChrome(profileDir) {
  const chromeArgs = [
    `--remote-debugging-port=${debuggingPort}`,
    `--user-data-dir=${profileDir}`,
    `--profile-directory=${process.env.CHROME_PROFILE_DIRECTORY || 'Default'}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,900',
    'about:blank',
  ]

  if (shouldLoadUnpacked) {
    chromeArgs.splice(3, 0, `--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`)
  }
  if (process.env.OPENTEAM_E2E_HEADLESS === '1') chromeArgs.splice(3, 0, '--headless=new')

  const processHandle = spawn(chromePath, chromeArgs, { stdio: ['ignore', 'pipe', 'pipe'] })
  processHandle.stderr.on('data', data => {
    chromeStderr += data.toString()
  })
  return processHandle
}

function findChromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean)

  const found = candidates.find(candidate => existsSync(candidate))
  if (!found) throw new Error('Chrome executable not found. Set CHROME_PATH to run extension smoke E2E.')
  return found
}

async function waitForExtensionId(baseUrl, browser, profileDir) {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const fromTargets = await findExtensionIdFromTargets(baseUrl, browser)
    if (fromTargets) return fromTargets

    const fromPreferences = await findExtensionIdFromPreferences(profileDir)
    if (fromPreferences) return fromPreferences

    await delay(100)
  }
  throw new Error('Timed out waiting for unpacked extension id')
}

async function findExtensionIdFromTargets(baseUrl, browser) {
  const targetInfos = []
  try {
    const targets = await browser.send('Target.getTargets')
    if (Array.isArray(targets.targetInfos)) targetInfos.push(...targets.targetInfos)
  } catch {
    // Chrome may briefly reject Target.getTargets during startup; fall back to /json/list.
  }

  try {
    const targets = await waitForJson(`${baseUrl}/json/list`, 1000)
    if (Array.isArray(targets)) targetInfos.push(...targets)
  } catch {
    // The next poll can still succeed once the debugger endpoint is ready.
  }

  for (const target of targetInfos) {
    if (typeof target.url !== 'string') continue
    const match = /^chrome-extension:\/\/([^/]+)\//.exec(target.url)
    if (match) return match[1]
  }

  return undefined
}

async function findExtensionIdFromPreferences(profileDir) {
  if (!profileDir) return undefined
  try {
    const content = await readFile(join(profileDir, process.env.CHROME_PROFILE_DIRECTORY || 'Default', 'Preferences'), 'utf8')
    const preferences = JSON.parse(content)
    const settings = preferences?.extensions?.settings
    if (!settings || typeof settings !== 'object') return undefined

    for (const [extensionId, setting] of Object.entries(settings)) {
      if (!setting || typeof setting !== 'object') continue
      const normalizedPath = resolve(String(setting.path ?? ''))
      if (normalizedPath === extensionDir) return extensionId
    }
  } catch {
    // Preferences are written asynchronously while Chrome starts; polling handles this.
  }

  return undefined
}

async function waitForPageReady(page, extensionId, profileDir) {
  const deadline = Date.now() + 10_000
  let diagnostics = 'unavailable'
  while (Date.now() < deadline) {
    const ready = await page.send('Runtime.evaluate', {
      expression: 'document.readyState === "complete" && Boolean(document.querySelector("#app"))',
      returnByValue: true,
    })
    if (ready.result.value === true) return
    const pageState = await page.send('Runtime.evaluate', {
      expression: 'JSON.stringify({ readyState: document.readyState, href: location.href, title: document.title, hasApp: Boolean(document.querySelector("#app")) })',
      returnByValue: true,
    })
    diagnostics = pageState.result.value
    await delay(100)
  }
  const extensionSetting = await getExtensionSetting(profileDir, extensionId)
  const chromeErrors = chromeStderr.trim().split('\n').slice(-8).join('\n')
  throw new Error(`Timed out waiting for team.html to render: ${diagnostics}; extensionSetting=${JSON.stringify(extensionSetting)}; chromeStderr=${chromeErrors}`)
}

async function getExtensionSetting(profileDir, extensionId) {
  if (!profileDir) return undefined
  try {
    const content = await readFile(join(profileDir, process.env.CHROME_PROFILE_DIRECTORY || 'Default', 'Preferences'), 'utf8')
    const preferences = JSON.parse(content)
    return preferences?.extensions?.settings?.[extensionId]
  } catch {
    return undefined
  }
}

async function waitForTarget(baseUrl, predicate) {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const targets = await waitForJson(`${baseUrl}/json/list`, 1000)
    const target = targets.find(predicate)
    if (target?.webSocketDebuggerUrl || target?.id) return target
    await delay(100)
  }
  throw new Error('Timed out waiting for Chrome target')
}

async function waitForJson(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return await response.json()
      lastError = new Error(`${response.status} ${response.statusText}`)
    } catch (error) {
      lastError = error
    }
    await delay(100)
  }
  throw lastError ?? new Error(`Timed out fetching ${url}`)
}

function connectCdp(wsUrl) {
  const socket = new WebSocket(wsUrl)
  let nextId = 1
  const pending = new Map()
  const opened = new Promise((resolveSocket, rejectSocket) => {
    socket.addEventListener('open', resolveSocket, { once: true })
    socket.addEventListener('error', () => rejectSocket(new Error(`Failed to connect CDP socket: ${wsUrl}`)), { once: true })
  })

  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (!message.id) return
    const callbacks = pending.get(message.id)
    if (!callbacks) return
    pending.delete(message.id)
    if (message.error) {
      callbacks.reject(new Error(message.error.message || JSON.stringify(message.error)))
      return
    }
    callbacks.resolve(message.result)
  })

  return {
    async send(method, params = {}) {
      await opened
      const id = nextId++
      socket.send(JSON.stringify({ id, method, params }))
      return new Promise((resolvePromise, reject) => {
        pending.set(id, { resolve: resolvePromise, reject })
      })
    },
    close() {
      socket.close()
    },
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function normalizeBaseUrl(url) {
  return url.replace(/\/+$/, '')
}

function resolvePath(path) {
  if (!process.env.HOME && (path === '~' || path.startsWith('~/'))) throw new Error('HOME is required to resolve ~/ paths.')
  if (path === '~') return process.env.HOME
  if (path.startsWith('~/')) return join(process.env.HOME, path.slice(2))
  return resolve(path)
}

async function stopChrome(processHandle) {
  if (!processHandle.killed) processHandle.kill('SIGTERM')
  await Promise.race([
    new Promise(resolve => processHandle.once('exit', resolve)),
    delay(2_000),
  ])
  if (!processHandle.killed) processHandle.kill('SIGKILL')
}
