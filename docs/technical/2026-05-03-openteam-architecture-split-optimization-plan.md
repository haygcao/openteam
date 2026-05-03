# OpenTeam 架构拆分与优化方案

## 1. 背景

OpenTeam 当前已经完成从“后台静默 tab”到“team.html + 多 iframe 群聊工作台”的关键技术验证。主链路已经跑通：

```text
team.html/team.js
  -> background service worker
  -> chrome.storage.local
  -> chrome.tabs.sendMessage(tabId, frameId)
  -> AI 站点 iframe content script
  -> DOM 输入 prompt / 监听回复
  -> background 落库
  -> team.html 更新群聊 UI
```

当前项目的主要问题不是功能不可用，而是实验期代码开始进入维护瓶颈：

- 入口文件过大：`background/index.ts` 1478 行，`content/index.ts` 1104 行，`teamPage/index.ts` 1867 行。
- 新旧模型并存：`src/group/*` 是新群聊模型，`src/team/*` 和部分 `TEAM_*` 协议仍是旧模型残留。
- 权限较宽：DNR 规则目前对所有 URL 的 frame 移除 `CSP` 和 `X-Frame-Options`。
- 构建和测试能通过，但 `tsc --noEmit` 当前失败，说明质量基线不完整。
- UI/CSS 集中在 `public/team.html`，后续视觉和交互迭代会越来越难维护。

本方案目标是把 OpenTeam 从“可验证实验项目”推进到“可持续迭代的产品代码”。

## 2. 优化目标

### 2.1 核心目标

- 建立可靠工程基线：`typecheck + test + build` 全部通过。
- 收敛扩展权限，降低上架和安全风险。
- 拆分大文件，让每个模块职责清晰、可独立测试。
- 清理旧协议和旧模型，减少状态和消息路由的认知负担。
- 为后续 E2E、站点适配、UI 迭代打基础。

### 2.2 非目标

本轮不做：

- 大规模重写 UI。
- 更换框架。
- 引入后端服务或云端同步。
- 改变当前 `team.html + iframe + content script` 主架构。
- 一次性删除所有 legacy 代码。旧协议应先隔离，再逐步删除。

## 3. 当前架构判断

### 3.1 值得保留的设计

- `chatId + roleId` 是业务身份，`tabId + frameId` 是运行时投递地址。这个边界正确。
- `RuntimeFrameRegistry` 单独封装，适合继续保留。
- `src/group/store.ts` 已经做 v2 分片存储，方向正确。
- `src/content/sites/*` 的站点适配器抽象清楚，适合继续扩展。
- prompt 构造、mention 解析、context sync 已经有独立模块和测试，值得沿用。

### 3.2 需要处理的债务

- `background/index.ts` 同时承担 Chrome listener、store mutation、prompt delivery、状态恢复、legacy adapter。
- `teamPage/index.ts` 同时承担状态、DOM 查询、聊天列表、消息流、人员库、人员面板、composer、浮窗控制。
- `content/index.ts` 同时承担 content boot、站点回复监听、iframe handshake、旧悬浮 panel。
- `public/team.html` 同时包含完整 HTML 和大量 CSS。
- 旧 `src/team/*` 模型仍被部分旧类型和旧 panel 使用。

## 4. 执行原则

- 先稳基线，再拆模块。
- 每次只拆一个职责域，不和 UI 重做、功能新增混在一起。
- 每个阶段都必须保持：

```bash
npm run typecheck
npm test
npm run build
```

- 拆分以“移动代码 + 补测试”为主，避免边拆边改业务语义。
- `background` 优先于 `teamPage`，因为状态和路由中心稳定后，UI 拆分风险更低。
- legacy 代码先隔离成明确模块，确认无调用后再删除。

## 5. 分阶段方案

## P0：工程基线与安全基线

### 目标

让项目拥有可信的质量门禁，并先处理最高风险的权限和依赖问题。

### 任务

1. 新增脚本：

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "verify": "npm run typecheck && npm test && npm run build"
  }
}
```

2. 修复当前 `npx tsc --noEmit` 报错：

- `src/group/roleTemplates.ts` 中批量创建人员的可选字段类型收窄。
- `Intl.Segmenter` 类型定义问题。
- `src/teamPage/index.ts` 中未使用的 `resetTemplateForm`。
- 测试文件缺少 Node 类型，补 `@types/node` 或单独测试 tsconfig。

3. 处理依赖安全问题：

- 优先尝试非破坏性 `npm audit fix`。
- 单独评估 Vite/Vitest/Rollup 升级影响。
- 升级后必须跑完整 `npm run verify`。

4. 收敛 DNR 和 manifest 权限：

- `public/rules.json` 从 `*://*/*` 收敛到：
  - `https://gemini.google.com/*`
  - `https://chatgpt.com/*`
  - `https://chat.openai.com/*`
  - `https://claude.ai/*`
- 优先只作用 `sub_frame`。
- `public/manifest.json` 的 `host_permissions` 从 `<all_urls>` 改为明确站点。
- clipboard 权限逐项确认是否必须。

### 验收标准

- `npm run typecheck` 通过。
- `npm test` 通过。
- `npm run build` 通过。
- `npm audit --audit-level=moderate` 没有可直接修复的高风险项。
- DNR 规则不再影响非目标站点。

## P1：拆分 background

### 目标

让 background 成为清晰的消息路由层，而不是所有业务逻辑的堆叠入口。

### 建议目录

```text
src/background/index.ts
src/background/messageRouter.ts
src/background/runtimeClient.ts
src/background/storeAccess.ts
src/background/chatHandlers.ts
src/background/roleHandlers.ts
src/background/messageHandlers.ts
src/background/promptDelivery.ts
src/background/legacyAdapter.ts
src/background/runtimeFrames.ts
```

### 文件职责

- `index.ts`：只注册 `chrome.runtime.onMessage`、`chrome.action.onClicked`、`chrome.tabs.onRemoved`。
- `messageRouter.ts`：根据 `message.type` 分发到具体 handler。
- `runtimeClient.ts`：封装 `broadcastStoreUpdated`、`sendError`、host tab 管理。
- `storeAccess.ts`：封装 `mutateStore`、`requireChat`、`requireRole`、常用读取工具。
- `chatHandlers.ts`：处理 `GROUP_CHAT_*`。
- `roleHandlers.ts`：处理 `GROUP_ROLE_*` 和 `ROLE_TEMPLATE_*`。
- `messageHandlers.ts`：处理 `GROUP_MESSAGE_SEND`、`TEAM_ROLE_REPLY`、`TEAM_ROLE_ERROR`、retry。
- `promptDelivery.ts`：构造和发送 `TEAM_SEND_PROMPT`。
- `legacyAdapter.ts`：集中放 `TEAM_HOST_READY`、`TEAM_CREATE_ROLE`、`TEAM_SEND_MESSAGE` 等旧协议适配。
- `runtimeFrames.ts`：保留现有实现。

### 拆分顺序

1. 抽 `runtimeClient.ts` 和 `storeAccess.ts`。
2. 抽 `chatHandlers.ts`。
3. 抽 `roleHandlers.ts`。
4. 抽 `messageHandlers.ts` 和 `promptDelivery.ts`。
5. 抽 `legacyAdapter.ts`。
6. 让 `index.ts` 控制在 150-250 行。

### 测试策略

- 保留现有 `background/groupExperience.test.ts`。
- 新增或迁移针对 handler 的单元测试。
- 每完成一个 handler 拆分，就跑相关测试和 `npm run typecheck`。

### 验收标准

- `background/index.ts` 不再包含具体业务 mutation。
- 旧 `background/groupExperience.test.ts` 全部通过。
- prompt 发送、frame ready、role reply、chat delete 等关键链路行为不变。

## P2：拆分 teamPage

### 目标

降低 `teamPage/index.ts` 的 UI 维护压力，把视图、状态、命令、浮窗行为拆开。

### 建议目录

```text
src/teamPage/index.ts
src/teamPage/runtimeClient.ts
src/teamPage/appState.ts
src/teamPage/domRefs.ts
src/teamPage/chatListView.ts
src/teamPage/messagesView.ts
src/teamPage/composerView.ts
src/teamPage/peopleLibraryView.ts
src/teamPage/rolePanelView.ts
src/teamPage/floatingWindow.ts
src/teamPage/iframeHost.ts
src/teamPage/chatExperience.ts
```

### 文件职责

- `index.ts`：boot、模块装配、全局事件注册。
- `runtimeClient.ts`：`sendRuntimeMessage`、`runCommand`。
- `appState.ts`：`store`、当前 chat/role/reference、`applyStore`。
- `domRefs.ts`：集中 DOM 查询和必需元素校验。
- `chatListView.ts`：左侧群聊列表、菜单、切换、删除、复制。
- `messagesView.ts`：消息流、Markdown 渲染、复制、引用、thinking bubble。
- `composerView.ts`：输入框、@ 面板、发送状态、快捷键。
- `peopleLibraryView.ts`：人员库弹窗、人员模板编辑。
- `rolePanelView.ts`：右侧人员面板、站点切换、恢复、重试。
- `floatingWindow.ts`：拖拽、缩小、恢复、窗口位置。
- `iframeHost.ts`：保留现有 iframe 管理。
- `chatExperience.ts`：保留现有纯 UI 逻辑工具。

### CSS 拆分

第一轮不引入 Tailwind，先把 `public/team.html` 中 `<style>` 内容搬到：

```text
public/team.css
```

并在 HTML 中引用：

```html
<link rel="stylesheet" href="team.css" />
```

后续如果决定使用 Tailwind，再单独做一轮样式工程化。

### 测试策略

- 保留 `teamHtml.test.ts`，但逐步减少对源码字符串的依赖。
- 给拆出的纯函数继续放在 `chatExperience.test.ts`。
- 关键 DOM 行为后续由 E2E 覆盖。

### 验收标准

- `teamPage/index.ts` 控制在 200-350 行。
- `team.html` 不再包含大段内联 CSS。
- 当前群聊切换、发送消息、引用、人员库、人员恢复行为不变。
- `npm run verify` 通过。

## P3：拆分 content script

### 目标

把 content script 从“所有页面逻辑入口”拆成 role session、回复监听、iframe handshake、legacy panel 几块。

### 建议目录

```text
src/content/index.ts
src/content/runtimeClient.ts
src/content/roleSession.ts
src/content/replyObserver.ts
src/content/frameHandshake.ts
src/content/conversationMonitor.ts
src/content/legacyHostPanel.ts
src/content/sites/*
```

### 文件职责

- `index.ts`：判断是否 iframe、注册模块、启动。
- `runtimeClient.ts`：封装 runtime message。
- `roleSession.ts`：当前 assigned role、active message、状态上报。
- `replyObserver.ts`：`MutationObserver`、polling compensation、timeout compensation。
- `frameHandshake.ts`：处理 `OPENTEAM_ASSIGN_FRAME_ROLE`。
- `conversationMonitor.ts`：监听 URL 和 conversationId 变化。
- `legacyHostPanel.ts`：旧页面悬浮 panel，先隔离，后续删除。
- `sites/*`：保留站点适配器。

### 站点适配器二次优化

Gemini、ChatGPT、Claude 三个 adapter 现在重复了大量 DOM 工具。拆 content 主入口后，可以再抽：

```text
src/content/sites/domText.ts
src/content/sites/contentEditable.ts
src/content/sites/clipboardCopy.ts
src/content/sites/waitForElement.ts
src/content/sites/generationStatus.ts
```

这一步放在 P3 后半段，避免一次拆太多。

### 验收标准

- `content/index.ts` 控制在 150-250 行。
- 站点适配器测试全部通过。
- 回复去重、超时补偿、polling compensation 行为不变。
- iframe 角色绑定行为不变。

## P4：legacy 协议清理

### 目标

减少新旧两代 team/group 模型并存导致的复杂度。

### 处理对象

- `src/team/*`
- `TEAM_CONTENT_READY`
- `TEAM_GET_STATE`
- `TEAM_HOST_READY`
- `TEAM_CREATE_ROLE`
- `TEAM_REMOVE_ROLE`
- `TEAM_SEND_MESSAGE`
- content 里的旧 host panel
- background 里的 legacy state adapter

### 推荐步骤

1. 在 `legacyAdapter.ts` 中集中所有旧协议。
2. 给旧协议加 debug 日志，确认真实运行是否仍触发。
3. 如果当前产品只保留 `team.html` 群聊工作台，删除旧悬浮 panel。
4. 删除 `src/team/*` 或把其中仍需要的类型迁移到 `src/group/*`。
5. 更新 README 和技术文档，去掉旧 tab 方案的开发入口描述。

### 验收标准

- runtime message 类型只保留 group 模型主路径。
- `src/team/*` 不再参与构建，或被明确标记为迁移兼容层。
- README 中架构描述与代码一致。

## P5：E2E 与诊断体系

### 目标

覆盖真实扩展运行链路，避免仅靠单元测试和源码字符串测试。

### 建议测试链路

- 加载 unpacked extension。
- 打开 `team.html`。
- 创建群聊。
- 添加人员。
- 创建 iframe host frame。
- 模拟或触发 `TEAM_FRAME_ROLE_READY`。
- 发送群聊消息。
- 模拟 `TEAM_ROLE_REPLY`。
- 验证消息流更新。
- 验证后台群聊收到回复后左侧有新消息状态。

### 诊断优化

- 统一日志开关。
- 将 `console.debug/info/warn` 包装为可配置 logger。
- 生产默认只保留 warn/error，开发模式打开 debug。
- 关键状态上报包含 `chatId`、`roleId`、`messageId`、`frameId`。

### 验收标准

- 至少有一条端到端 happy path 测试。
- 至少有一条 iframe 恢复/重试测试。
- 日志能按环境开关控制。

## 6. 推荐实施顺序

```text
第 1 轮：P0 工程基线 + 权限收敛
第 2 轮：P1 background 拆分
第 3 轮：P2 teamPage 拆分 + CSS 外置
第 4 轮：P3 content 拆分
第 5 轮：P4 legacy 清理
第 6 轮：P5 E2E 和诊断
```

第一轮建议只做 P0，不要同时拆大文件。P0 完成后，后续每一轮都应以一个独立 PR 或提交组完成，方便回滚和 review。

## 7. 风险与应对

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| MV3 service worker 被挂起导致内存态丢失 | iframe binding 失效 | 保持 iframe handshake 可重复，恢复时重新绑定 |
| DNR 收敛后 iframe 加载失败 | 核心功能不可用 | 按站点逐个验证，必要时保留站点级例外 |
| 拆分 background 时改变消息顺序 | 发送和回复状态错乱 | 先抽纯函数，再迁移 handler；测试覆盖 prompt/reply/retry |
| 拆分 teamPage 时 DOM 状态错乱 | UI 行为回归 | 先拆命令和纯渲染，再拆事件注册 |
| 删除 legacy 代码过早 | 旧入口不可用 | 先隔离 legacy adapter，确认无触发后删除 |
| 站点 DOM 变化 | prompt 输入或回复监听失效 | 保持 adapter 测试和诊断日志，后续补 E2E |

## 8. 完成后的目标形态

完成以上优化后，项目应形成以下结构：

```text
src/background/
  index.ts              Chrome 事件入口
  messageRouter.ts      runtime message 分发
  runtimeClient.ts      广播和错误推送
  storeAccess.ts        store mutation 和读取工具
  chatHandlers.ts       群聊命令
  roleHandlers.ts       人员和人员库命令
  messageHandlers.ts    消息发送、回复、错误、重试
  promptDelivery.ts     prompt 投递
  legacyAdapter.ts      临时旧协议兼容
  runtimeFrames.ts      frame binding

src/teamPage/
  index.ts              team 页面启动
  appState.ts           页面状态
  runtimeClient.ts      background 通信
  domRefs.ts            DOM 引用
  chatListView.ts       群聊列表
  messagesView.ts       消息流
  composerView.ts       输入框和 @
  peopleLibraryView.ts  人员库
  rolePanelView.ts      人员面板
  floatingWindow.ts     悬浮窗
  iframeHost.ts         iframe 管理

src/content/
  index.ts              content 启动
  runtimeClient.ts      background 通信
  roleSession.ts        当前人员运行态
  replyObserver.ts      回复监听
  frameHandshake.ts     iframe 绑定
  conversationMonitor.ts 会话 URL 监听
  legacyHostPanel.ts    待删除旧面板
  sites/                站点适配
```

## 9. 后续建议

拆分完成后，再考虑产品体验优化：

- 角色加载失败的诊断 UI。
- 站点登录状态检测。
- 人员恢复流程可视化。
- 自动多轮讨论调度。
- 人员库搜索和分类。
- 更稳定的 E2E 测试环境。

当前最重要的不是加功能，而是把现有可行架构整理成低风险、可测试、可长期迭代的工程结构。
