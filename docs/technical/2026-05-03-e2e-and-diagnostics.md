# OpenTeam E2E 与诊断日志

## E2E 分层

OpenTeam 当前使用两层 E2E：

- `npm run test:e2e`：Vitest 集成式 E2E，使用真实 background 入口、Chrome API mock 和 storage mock，覆盖群聊主链路、iframe ready、消息发送、回复入库、新消息标记、人员恢复和重试。
- `npm run e2e:extension`：先构建 `dist`，再通过 CDP 打开已安装插件的 `chrome-extension://<id>/team.html`，验证扩展页可渲染。脚本需要传入 `OPENTEAM_EXTENSION_ID`，并使用 `CHROME_USER_DATA_DIR` 启动指定 Chrome profile，或使用 `OPENTEAM_CDP_URL` 连接已经开启 remote debugging 的浏览器。

`npm run verify` 会执行 `typecheck`、单元测试、`test:e2e` 和构建。`e2e:extension` 依赖本机 Chrome 与已安装插件，作为发布前或本地验收命令单独运行。开发调试时可用 `OPENTEAM_LOAD_UNPACKED=1 npm run e2e:extension` 临时加载 `dist`，但正式验收以已安装插件模式为准。

## 诊断日志

统一日志入口在 `src/shared/logger.ts`。

- `debug` / `info`：默认只在开发模式或显式开启时输出。
- `warn` / `error`：默认输出。
- 可通过 `localStorage.setItem('openteam:debug', 'true')` 或 URL 参数 `openteam_debug=1` 开启详细日志。
- 日志 details 支持携带 `chatId`、`roleId`、`messageId`、`tabId`、`frameId` 等上下文字段。

当前 background、content、teamPage 都已接入统一 logger。
