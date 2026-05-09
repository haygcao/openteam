// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDefaultStore } from '../group/store'
import type { GroupChat, GroupRole, OpenTeamStore, OrchestrationFlow, OrchestrationRun } from '../group/types'
import { createOrchestrationStatusView } from './orchestrationStatusView'

afterEach(() => {
  document.body.replaceChildren()
})

function baseFixture(status: OrchestrationRun['status'] = 'running') {
  const now = Date.now()
  const chat: GroupChat = {
    id: 'chat-1',
    name: '群聊',
    mode: 'independent',
    roleIds: ['role-1', 'role-2'],
    messageIds: [],
    nextMessageSeq: 1,
    status: status === 'error' ? 'error' : status === 'running' ? 'running' : 'ready',
    createdAt: now,
    updatedAt: now,
  }
  const roles: GroupRole[] = [
    { id: 'role-1', chatId: chat.id, name: '产品', chatSite: 'chatgpt', status: 'thinking', contextCursor: 0, createdAt: now, updatedAt: now },
    { id: 'role-2', chatId: chat.id, name: '产品', chatSite: 'deepseek', status: 'ready', contextCursor: 0, createdAt: now, updatedAt: now },
  ]
  const flow: OrchestrationFlow = {
    id: 'flow-1',
    chatId: chat.id,
    name: '默认编排',
    stages: [
      { id: 'stage-1', kind: 'roles', name: '分析', roleIds: ['role-1'] },
      { id: 'stage-2', kind: 'roles', name: '实现', roleIds: ['role-2'] },
      { id: 'stage-3', kind: 'review', name: '复核', roleIds: [], review: { reviewerRoleIds: ['role-1'] } },
    ],
    maxRounds: 2,
    createdAt: now,
    updatedAt: now,
  }
    const run: OrchestrationRun = {
      id: 'run-1',
      chatId: chat.id,
      flowId: flow.id,
      status,
      currentRound: 1,
      maxNodeExecutions: 50,
      maxRounds: 2,
    stageRuns: [
      {
        stageId: 'stage-1',
        stageIndex: 0,
        kind: 'roles',
        round: 1,
        status: status === 'error' ? 'error' : 'running',
        roleRuns: {
          'role-1': { roleId: 'role-1', status: status === 'error' ? 'error' : 'running', error: status === 'error' ? '投递失败' : undefined },
        },
      },
    ],
    error: status === 'error' ? '投递失败' : undefined,
    createdAt: now,
    updatedAt: now,
  }
  const store: OpenTeamStore = {
    ...createDefaultStore(),
    currentChatId: chat.id,
    chatOrder: [chat.id],
    chatsById: { [chat.id]: chat },
    rolesById: Object.fromEntries(roles.map(role => [role.id, role])),
    orchestrationFlowsById: { [flow.id]: flow },
    orchestrationRunsById: { [run.id]: run },
    activeOrchestrationRunIdByChatId: { [chat.id]: run.id },
  }
  return { chat, roles, flow, run, store }
}

describe('orchestration status view', () => {
  it('renders active run round, step, running roles, and waiting nodes without stage wording', () => {
    const fixture = baseFixture('running')
    const view = createOrchestrationStatusView({
      getStore: () => fixture.store,
      getCurrentChat: () => fixture.chat,
      getCurrentRoles: () => fixture.roles,
      reconnectRolesForSend: vi.fn(async () => undefined),
      runCommand: vi.fn(async () => undefined),
      showError: vi.fn(),
    })

    const node = view.renderOrchestrationStatus()

    expect(node?.textContent).toContain('编排运行中 · 已执行 1 / 50 个节点 · 第 1 / 3 个节点')
    expect(node?.textContent).toContain('产品（ChatGPT）')
    expect(node?.textContent).toContain('产品（DeepSeek）、产品（ChatGPT）')
    expect(node?.textContent).not.toContain('阶段')
  })

  it('renders terminal states with distinct classes', () => {
    const completed = baseFixture('completed')
    completed.run.stageRuns[0].status = 'completed'
    const stopped = baseFixture('stopped')

    const completedNode = createOrchestrationStatusView({
      getStore: () => completed.store,
      getCurrentChat: () => completed.chat,
      getCurrentRoles: () => completed.roles,
      reconnectRolesForSend: vi.fn(async () => undefined),
      runCommand: vi.fn(async () => undefined),
      showError: vi.fn(),
    }).renderOrchestrationStatus()
    const stoppedNode = createOrchestrationStatusView({
      getStore: () => stopped.store,
      getCurrentChat: () => stopped.chat,
      getCurrentRoles: () => stopped.roles,
      reconnectRolesForSend: vi.fn(async () => undefined),
      runCommand: vi.fn(async () => undefined),
      showError: vi.fn(),
    }).renderOrchestrationStatus()

    expect(completedNode?.classList.contains('orchestration-status-completed')).toBe(true)
    expect(completedNode?.textContent).toContain('编排已完成')
    expect(stoppedNode?.classList.contains('orchestration-status-stopped')).toBe(true)
    expect(stoppedNode?.textContent).toContain('编排已停止')
  })

  it('renders terminal run progress from the current node instead of cumulative stage runs', () => {
    const fixture = baseFixture('error')
    fixture.run.currentRound = 2
    fixture.run.stageRuns = [
      { stageId: 'stage-1', stageIndex: 0, kind: 'roles', round: 1, status: 'completed', roleRuns: {} },
      { stageId: 'stage-2', stageIndex: 1, kind: 'roles', round: 1, status: 'completed', roleRuns: {} },
      { stageId: 'stage-3', stageIndex: 2, kind: 'review', round: 1, status: 'completed', roleRuns: {} },
      { stageId: 'stage-1', stageIndex: 0, kind: 'roles', round: 2, status: 'completed', roleRuns: {} },
      { stageId: 'stage-2', stageIndex: 1, kind: 'roles', round: 2, status: 'completed', roleRuns: {} },
      {
        stageId: 'stage-3',
        stageIndex: 2,
        kind: 'review',
        round: 2,
        status: 'error',
        roleRuns: { 'role-1': { roleId: 'role-1', status: 'error', error: '投递失败' } },
      },
    ]
    const node = createOrchestrationStatusView({
      getStore: () => fixture.store,
      getCurrentChat: () => fixture.chat,
      getCurrentRoles: () => fixture.roles,
      reconnectRolesForSend: vi.fn(async () => undefined),
      runCommand: vi.fn(async () => undefined),
      showError: vi.fn(),
    }).renderOrchestrationStatus()

    expect(node?.textContent).toContain('编排出错 · 已执行 6 / 50 个节点 · 第 3 / 3 个节点')
    expect(node?.textContent).not.toContain('6 / 3 步')
    expect(node?.textContent).not.toContain('第 2 轮')
  })

  it('dispatches stop, retry node, skip node, and retry review actions when applicable', async () => {
    const running = baseFixture('running')
    const runCommand = vi.fn(async () => undefined)
    const runningNode = createOrchestrationStatusView({
      getStore: () => running.store,
      getCurrentChat: () => running.chat,
      getCurrentRoles: () => running.roles,
      reconnectRolesForSend: vi.fn(async () => undefined),
      runCommand,
      showError: vi.fn(),
    }).renderOrchestrationStatus()

    runningNode?.querySelector<HTMLButtonElement>('button')?.click()
    expect(runCommand).toHaveBeenCalledWith('GROUP_ORCHESTRATION_STOP', { chatId: running.chat.id })

    const failed = baseFixture('error')
    const failedRunCommand = vi.fn(async () => undefined)
    const failedReconnectRolesForSend = vi.fn(async () => undefined)
    const failedNode = createOrchestrationStatusView({
      getStore: () => failed.store,
      getCurrentChat: () => failed.chat,
      getCurrentRoles: () => failed.roles,
      reconnectRolesForSend: failedReconnectRolesForSend,
      runCommand: failedRunCommand,
      showError: vi.fn(),
    }).renderOrchestrationStatus()
    failedNode?.querySelector<HTMLButtonElement>('button:nth-of-type(1)')?.click()
    failedNode?.querySelector<HTMLButtonElement>('button:nth-of-type(2)')?.click()
    await flushAsync()
    expect(failedReconnectRolesForSend).toHaveBeenCalledWith(failed.chat, [failed.roles[0]])
    expect(failedNode?.textContent).toContain('失败节点')
    expect(failedNode?.textContent).toContain('分析')
    expect(failedNode?.textContent).toContain('重发')
    expect(failedNode?.textContent).toContain('跳过节点')
    expect(failedNode?.textContent).not.toContain('阶段')
    expect(failedRunCommand).toHaveBeenCalledWith('GROUP_ORCHESTRATION_RETRY_STAGE', { chatId: failed.chat.id, stageId: 'stage-1' })
    expect(failedRunCommand).toHaveBeenCalledWith('GROUP_ORCHESTRATION_SKIP_STAGE', { chatId: failed.chat.id, stageId: 'stage-1' })

    failed.run.stageRuns[0].kind = 'review'
    const reviewRunCommand = vi.fn(async () => undefined)
    const reviewNode = createOrchestrationStatusView({
      getStore: () => failed.store,
      getCurrentChat: () => failed.chat,
      getCurrentRoles: () => failed.roles,
      reconnectRolesForSend: vi.fn(async () => undefined),
      runCommand: reviewRunCommand,
      showError: vi.fn(),
    }).renderOrchestrationStatus()
    reviewNode?.querySelector<HTMLButtonElement>('button:nth-of-type(1)')?.click()
    await flushAsync()
    expect(reviewNode?.textContent).toContain('重发')
    expect(reviewRunCommand).toHaveBeenCalledWith('GROUP_ORCHESTRATION_RETRY_REVIEW', { chatId: failed.chat.id })
  })
})

function flushAsync(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}
