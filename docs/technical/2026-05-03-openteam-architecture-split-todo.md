# OpenTeam 架构拆分与优化 ToDo

本文档是 `docs/technical/2026-05-03-openteam-architecture-split-optimization-plan.md` 的执行清单版，用于后续逐项推进、勾选和拆 PR。

## 执行约定

- 每一轮只做一个阶段，避免大范围重构同时发生。
- 每一轮完成后都运行：

```bash
npm run typecheck
npm test
npm run build
```

- 如果新增 `verify` 脚本，则统一运行：

```bash
npm run verify
```

- 每个阶段完成后更新本文档勾选状态。

## P0：工程基线与安全基线

目标：先让项目具备稳定质量门禁，并收敛最高风险权限。

### P0.1 TypeScript 基线

- [ ] 在 `package.json` 新增 `typecheck` 脚本。
- [ ] 在 `package.json` 新增 `verify` 脚本。
- [ ] 修复 `src/group/roleTemplates.ts` 中批量创建人员的可选字段类型问题。
- [ ] 修复 `Intl.Segmenter` 类型定义问题。
- [ ] 删除或使用 `src/teamPage/index.ts` 中未使用的 `resetTemplateForm`。
- [ ] 补充 Node 测试类型，解决 `teamHtml.test.ts` 中 `node:fs`、`node:path`、`process` 类型报错。
- [ ] 确认 `npm run typecheck` 通过。

### P0.2 测试与构建基线

- [ ] 确认 `npm test` 通过。
- [ ] 确认 `npm run build` 通过。
- [ ] 确认 `npm run verify` 通过。
- [ ] 在 README 或开发文档中补充 `verify` 命令说明。

### P0.3 依赖安全

- [ ] 运行 `npm audit --audit-level=moderate` 记录当前风险。
- [ ] 尝试执行非破坏性 `npm audit fix`。
- [ ] 单独评估 Vite/Vitest/Rollup 升级影响。
- [ ] 升级依赖后重新运行 `npm run verify`。
- [ ] 如果仍有无法无痛升级的漏洞，在文档中记录原因和后续升级策略。

### P0.4 扩展权限收敛

- [ ] 将 `public/rules.json` 的 `urlFilter` 从全站收敛到目标 AI 站点。
- [ ] 优先将 DNR `resourceTypes` 收敛为 `sub_frame`。
- [ ] 将 `public/manifest.json` 的 `host_permissions` 从 `<all_urls>` 改为明确站点。
- [ ] 复核 `clipboardRead`、`clipboardWrite` 是否都必须保留。
- [ ] 增加或更新 DNR 相关测试，确认不会影响非目标站点。
- [ ] 手动验证 Gemini、ChatGPT、Claude iframe 加载。

## P1：拆分 background

目标：让 background 只保留 Chrome 事件入口和消息路由，业务逻辑下沉到 handler 模块。

### P1.1 准备模块边界

- [ ] 新建 `src/background/messageRouter.ts`。
- [ ] 新建 `src/background/runtimeClient.ts`。
- [ ] 新建 `src/background/storeAccess.ts`。
- [ ] 确认 `src/background/runtimeFrames.ts` 保持独立，不和拆分混合修改。

### P1.2 抽 runtime 与 store 工具

- [ ] 将 `broadcastStoreUpdated` 移到 `runtimeClient.ts`。
- [ ] 将 `sendError` 移到 `runtimeClient.ts`。
- [ ] 将 host tab 管理逻辑移到 `runtimeClient.ts`。
- [ ] 将 `mutateStore` 移到 `storeAccess.ts`。
- [ ] 将 `requireChat`、`requireRole`、`getChatRoles`、`getChatMessages` 移到 `storeAccess.ts`。
- [ ] 跑 `npm run typecheck`。
- [ ] 跑 `npm test -- src/background/groupExperience.test.ts`。

### P1.3 抽 chat handlers

- [ ] 新建 `src/background/chatHandlers.ts`。
- [ ] 迁移 `GROUP_CHAT_CREATE` 处理逻辑。
- [ ] 迁移 `GROUP_CHAT_DUPLICATE` 处理逻辑。
- [ ] 迁移 `GROUP_CHAT_SWITCH` 处理逻辑。
- [ ] 迁移 `GROUP_CHAT_UPDATE` 处理逻辑。
- [ ] 迁移 `GROUP_CHAT_DELETE` 处理逻辑。
- [ ] 迁移 `GROUP_CHAT_CLEAR_MESSAGES` 处理逻辑。
- [ ] 迁移 `GROUP_CHAT_CLOSE` 处理逻辑。
- [ ] 迁移 `GROUP_CHAT_MARK_READ` 处理逻辑。
- [ ] 跑 background 相关测试。

### P1.4 抽 role handlers

- [ ] 新建 `src/background/roleHandlers.ts`。
- [ ] 迁移 `ROLE_TEMPLATE_CREATE` 处理逻辑。
- [ ] 迁移 `ROLE_TEMPLATE_UPDATE` 处理逻辑。
- [ ] 迁移 `ROLE_TEMPLATE_DELETE` 处理逻辑。
- [ ] 迁移 `GROUP_ROLE_CREATE` 处理逻辑。
- [ ] 迁移 `GROUP_ROLES_CREATE_BATCH` 处理逻辑。
- [ ] 迁移 `GROUP_ROLE_UPDATE` 处理逻辑。
- [ ] 迁移 `GROUP_ROLE_DELETE` 处理逻辑。
- [ ] 迁移 `GROUP_ROLE_RECOVER` 处理逻辑。
- [ ] 迁移 `GROUP_ROLE_REINITIALIZE` 处理逻辑。
- [ ] 跑 role/group 相关测试。

### P1.5 抽 message 与 prompt delivery

- [ ] 新建 `src/background/messageHandlers.ts`。
- [ ] 新建 `src/background/promptDelivery.ts`。
- [ ] 将 `sendPrompt` 移到 `promptDelivery.ts`。
- [ ] 将 prompt delivery 类型移到 `promptDelivery.ts`。
- [ ] 迁移 `GROUP_MESSAGE_SEND` 处理逻辑。
- [ ] 迁移 `GROUP_ROLE_RETRY_REPLY` 处理逻辑。
- [ ] 迁移 `TEAM_FRAME_ROLE_READY` 处理逻辑。
- [ ] 迁移 `TEAM_SEND_ACK` 处理逻辑。
- [ ] 迁移 `TEAM_ROLE_STATUS` 处理逻辑。
- [ ] 迁移 `TEAM_ROLE_REPLY` 处理逻辑。
- [ ] 迁移 `TEAM_ROLE_ERROR` 处理逻辑。
- [ ] 跑 `npm run verify`。

### P1.6 隔离 legacy adapter

- [ ] 新建 `src/background/legacyAdapter.ts`。
- [ ] 迁移 `TEAM_HOST_READY` 处理逻辑。
- [ ] 迁移 `TEAM_GET_STATE` 处理逻辑。
- [ ] 迁移 `TEAM_CREATE_ROLE` 处理逻辑。
- [ ] 迁移 `TEAM_SEND_MESSAGE` 处理逻辑。
- [ ] 将 `toLegacyState` 移入 `legacyAdapter.ts`。
- [ ] 给 legacy handler 加 debug 日志，便于后续确认是否仍被触发。
- [ ] 控制 `src/background/index.ts` 在 150-250 行。
- [ ] 跑 `npm run verify`。

## P2：拆分 teamPage

目标：降低 `src/teamPage/index.ts` 维护压力，把 UI 状态、视图和事件拆开。

### P2.1 基础模块

- [ ] 新建 `src/teamPage/domRefs.ts`。
- [ ] 新建 `src/teamPage/runtimeClient.ts`。
- [ ] 新建 `src/teamPage/appState.ts`。
- [ ] 将 `requireElement` 和 DOM 引用集中到 `domRefs.ts`。
- [ ] 将 `sendRuntimeMessage`、`runCommand` 移到 `runtimeClient.ts`。
- [ ] 将 `store`、`selectedChatId`、`selectedRoleId`、`selectedReference` 等页面状态移到 `appState.ts`。
- [ ] 跑 `npm run typecheck`。

### P2.2 拆聊天列表

- [ ] 新建 `src/teamPage/chatListView.ts`。
- [ ] 迁移 `renderChatList`。
- [ ] 迁移 `chatActionMenu`。
- [ ] 迁移 `switchChat`。
- [ ] 迁移删除、清空、关闭群聊相关 UI 命令。
- [ ] 补充或调整 chat list 相关测试。

### P2.3 拆消息流

- [ ] 新建 `src/teamPage/messagesView.ts`。
- [ ] 迁移 `renderMessages`。
- [ ] 迁移 `renderMessageNode`。
- [ ] 迁移 Markdown 渲染。
- [ ] 迁移复制、引用、跳转原始 iframe 相关逻辑。
- [ ] 迁移 thinking bubble 和 thinking timeout 逻辑。
- [ ] 跑 `npm test -- src/teamPage/chatExperience.test.ts`。

### P2.4 拆 composer

- [ ] 新建 `src/teamPage/composerView.ts`。
- [ ] 迁移 `renderComposerState`。
- [ ] 迁移 `renderReferenceDraft`。
- [ ] 迁移 `renderMentionPanel`。
- [ ] 迁移 `submitComposerMessage`。
- [ ] 迁移 @ mention 键盘交互。
- [ ] 补充 composer 行为测试。

### P2.5 拆人员库和人员面板

- [ ] 新建 `src/teamPage/peopleLibraryView.ts`。
- [ ] 新建 `src/teamPage/rolePanelView.ts`。
- [ ] 迁移人员库弹窗渲染。
- [ ] 迁移人员模板创建、编辑、删除逻辑。
- [ ] 迁移添加人员弹窗逻辑。
- [ ] 迁移右侧人员面板。
- [ ] 迁移人员站点切换菜单。
- [ ] 迁移人员恢复和重试逻辑。
- [ ] 跑 teamPage 相关测试。

### P2.6 拆浮窗控制

- [ ] 新建 `src/teamPage/floatingWindow.ts`。
- [ ] 迁移拖拽逻辑。
- [ ] 迁移最小化和恢复逻辑。
- [ ] 迁移窗口位置 clamp 逻辑。
- [ ] 确认右下角 launcher 行为不变。

### P2.7 拆 CSS

- [ ] 新建 `public/team.css`。
- [ ] 将 `public/team.html` 中的 `<style>` 内容迁移到 `public/team.css`。
- [ ] 在 `public/team.html` 中添加 `<link rel="stylesheet" href="team.css" />`。
- [ ] 修改 `vite.config.ts`，确保 `team.css` 被复制到 `dist`。
- [ ] 更新 `teamHtml.test.ts` 中对 CSS 的读取逻辑。
- [ ] 确认 `npm run build` 后 `dist/team.css` 存在。

### P2.8 收尾

- [ ] 控制 `src/teamPage/index.ts` 在 200-350 行。
- [ ] 跑 `npm run verify`。
- [ ] 手动打开扩展 team 页面，验证聊天列表、消息流、人员库、人员恢复。

## P3：拆分 content script

目标：让 content script 的启动、角色运行态、回复监听和 iframe handshake 清晰分离。

### P3.1 基础模块

- [ ] 新建 `src/content/runtimeClient.ts`。
- [ ] 新建 `src/content/roleSession.ts`。
- [ ] 将 runtime message wrapper 移到 `runtimeClient.ts`。
- [ ] 将 `assignedRole`、`activeMessageId`、`activeReplyAttemptId` 移到 `roleSession.ts`。
- [ ] 跑 `npm run typecheck`。

### P3.2 拆回复监听

- [ ] 新建 `src/content/replyObserver.ts`。
- [ ] 迁移 `observeResponseContainers`。
- [ ] 迁移 reply polling。
- [ ] 迁移 timeout compensation。
- [ ] 迁移 baseline capture 和 reply tracker 连接逻辑。
- [ ] 保持现有 reply 相关测试全部通过。

### P3.3 拆 iframe handshake 与会话监听

- [ ] 新建 `src/content/frameHandshake.ts`。
- [ ] 新建 `src/content/conversationMonitor.ts`。
- [ ] 迁移 `registerFrameRoleHandshake`。
- [ ] 迁移 `startConversationMonitoring`。
- [ ] 迁移 conversation update 上报。
- [ ] 验证 `TEAM_FRAME_ROLE_READY` 行为不变。

### P3.4 隔离旧 host panel

- [ ] 新建 `src/content/legacyHostPanel.ts`。
- [ ] 迁移 `createTeamPanel`。
- [ ] 迁移 `ensureHostPanel`。
- [ ] 给 legacy panel 入口加 debug 日志。
- [ ] 确认新 `team.html` 主链路不依赖 legacy panel。

### P3.5 站点适配公共工具

- [ ] 新建 `src/content/sites/waitForElement.ts`。
- [ ] 新建 `src/content/sites/contentEditable.ts`。
- [ ] 新建 `src/content/sites/clipboardCopy.ts`。
- [ ] 新建 `src/content/sites/domText.ts`。
- [ ] 将 Gemini/ChatGPT/Claude 中重复的 wait、contenteditable、clipboard、clean text 逻辑逐步迁移。
- [ ] 跑 `npm test -- src/content/sites`。

### P3.6 收尾

- [ ] 控制 `src/content/index.ts` 在 150-250 行。
- [ ] 跑 `npm run verify`。
- [ ] 手动验证 Gemini、ChatGPT、Claude 基础发送和回复监听。

## P4：legacy 协议清理

目标：减少 `src/team/*` 和旧 `TEAM_*` 协议带来的双模型复杂度。

### P4.1 使用情况确认

- [ ] 搜索所有 `TEAM_CONTENT_READY` 调用。
- [ ] 搜索所有 `TEAM_GET_STATE` 调用。
- [ ] 搜索所有 `TEAM_CREATE_ROLE` 调用。
- [ ] 搜索所有 `TEAM_REMOVE_ROLE` 调用。
- [ ] 搜索所有 `TEAM_SEND_MESSAGE` 调用。
- [ ] 运行扩展时观察 legacy debug 日志是否触发。

### P4.2 删除或迁移旧代码

- [ ] 如果 legacy panel 不再触发，删除 `src/content/legacyHostPanel.ts`。
- [ ] 如果 `src/team/*` 不再参与构建，删除旧模型文件。
- [ ] 删除 background 中 legacy adapter。
- [ ] 删除旧协议类型。
- [ ] 更新 README 中旧 tab/旧 panel 的描述。
- [ ] 更新技术文档中已废弃的旧链路。

### P4.3 验证

- [ ] 跑 `rg "TEAM_CONTENT_READY|TEAM_GET_STATE|TEAM_CREATE_ROLE|TEAM_REMOVE_ROLE|TEAM_SEND_MESSAGE" src public docs`，确认只剩文档归档内容或无结果。
- [ ] 跑 `npm run verify`。
- [ ] 手动验证 team 页面主链路。

## P5：E2E 与诊断体系

目标：补上真实扩展运行链路测试和可控日志。

### P5.1 E2E 基础设施

- [ ] 选择 E2E 工具方案。
- [ ] 增加加载 unpacked extension 的测试脚本。
- [ ] 增加打开 `team.html` 的 smoke test。
- [ ] 将 E2E 命令加入 package scripts。

### P5.2 主链路 E2E

- [ ] 测试创建群聊。
- [ ] 测试添加人员。
- [ ] 测试 iframe host 创建 frame。
- [ ] 模拟 `TEAM_FRAME_ROLE_READY`。
- [ ] 测试发送用户消息。
- [ ] 模拟 `TEAM_ROLE_REPLY`。
- [ ] 验证消息流出现人员回复。
- [ ] 验证后台群聊收到回复后左侧显示新消息状态。

### P5.3 恢复与错误 E2E

- [ ] 测试人员 iframe 加载失败提示。
- [ ] 测试人员恢复。
- [ ] 测试 thinking 超时。
- [ ] 测试打断重试。

### P5.4 诊断日志

- [ ] 新建统一 logger 模块。
- [ ] 支持开发模式 debug 日志。
- [ ] 生产默认只输出 warn/error。
- [ ] 关键日志统一包含 `chatId`、`roleId`、`messageId`、`tabId`、`frameId`。
- [ ] 替换 background/content/teamPage 中散落的 console wrapper。

### P5.5 验收

- [ ] 至少一条 happy path E2E 通过。
- [ ] 至少一条恢复或重试 E2E 通过。
- [ ] `npm run verify` 通过。
- [ ] 文档更新 E2E 和日志使用方式。

## 推荐执行批次

### Batch 1：基础安全网

- [ ] 完成 P0.1。
- [ ] 完成 P0.2。
- [ ] 完成 P0.3 中非破坏性依赖修复。

### Batch 2：扩展权限

- [ ] 完成 P0.4。
- [ ] 手动验证三个 AI 站点。

### Batch 3：background 拆分

- [ ] 完成 P1.1。
- [ ] 完成 P1.2。
- [ ] 完成 P1.3。
- [ ] 完成 P1.4。
- [ ] 完成 P1.5。
- [ ] 完成 P1.6。

### Batch 4：teamPage 拆分

- [ ] 完成 P2.1。
- [ ] 完成 P2.2。
- [ ] 完成 P2.3。
- [ ] 完成 P2.4。
- [ ] 完成 P2.5。
- [ ] 完成 P2.6。
- [ ] 完成 P2.7。
- [ ] 完成 P2.8。

### Batch 5：content 拆分

- [ ] 完成 P3.1。
- [ ] 完成 P3.2。
- [ ] 完成 P3.3。
- [ ] 完成 P3.4。
- [ ] 完成 P3.5。
- [ ] 完成 P3.6。

### Batch 6：清理与产品化测试

- [ ] 完成 P4。
- [ ] 完成 P5。

## 当前推荐的下一步

- [ ] 先从 P0.1 开始，建立 `typecheck` 和 `verify`。
- [ ] 修复所有 `tsc --noEmit` 报错。
- [ ] 跑通完整验证命令后，再进入权限收敛和 background 拆分。
