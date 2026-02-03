# TODO - 待实现功能跟踪

> 记录各章节中提及但未实现的功能，等待后续章节补充。

## 第三章遗留

| 功能 | 说明 | 依赖 | 计划章节 |
|------|------|------|----------|
| `initializeStoreState` | 初始化应用状态到 Store | Zustand Store | 第 11 章 |
| `mergeRuntimeConfig` | 合并 CLI 参数到运行时配置 | RuntimeConfig 类型 | 第 11 章 |
| `appActions().setInitializationStatus` | 设置初始化状态 | Zustand actions | 第 11 章 |
| 子命令 `mcp` | MCP 服务器管理 | MCP 模块 | 第 10 章 |
| 子命令 `doctor` | 诊断命令 | 诊断模块 | 第 12 章 |
| 子命令 `update` | 更新命令 | - | 第 12 章 |
| `subagentRegistry` | Subagent 注册表 | Subagent 系统 | 第 12 章 |
| `HookManager` | Hooks 管理器 | Hooks 系统 | 第 12 章 |
| `registerCleanup` | 注册退出清理函数 | GracefulShutdown | 第 12 章 |
| `BackgroundShellManager` | 后台 Shell 管理 | Shell 工具 | 第 6 章 |
| `McpRegistry` | MCP 注册表 | MCP 模块 | 第 10 章 |

## 第四章遗留

| 功能 | 说明 | 依赖 | 计划章节 |
|------|------|------|----------|
| `registerBuiltinTools` | 注册内置工具 | ToolRegistry | 第 6 章 |
| `executeToolCall` 完整实现 | 工具执行管道 | ExecutionPipeline | 第 7 章 |
| `checkAndCompact` | 上下文压缩 | CompactionService | 第 8 章 |
| ~~Plan 模式~~ | ~~只读调研模式~~ | ~~PLAN_MODE_SYSTEM_PROMPT~~ | ✅ 第 5 章 |
| `processAtMentions` | @ 文件提及处理 | AttachmentCollector | 第 6 章 |
| `runPlanLoop` | Plan 模式执行循环 | 权限过滤 | 第 7 章 |
| `applyToolWhitelist` | 工具白名单 | ToolRegistry | 第 6 章 |
| 循环检测 | 防止 Agent 陷入循环 | LoopDetector | 第 8 章 |

## 第五章遗留

| 功能 | 说明 | 依赖 | 计划章节 |
|------|------|------|----------|
| 压缩提示词 | 上下文压缩时使用 | CompactionService | 第 8 章 |
| 工具描述格式 | ToolDescription 结构化 | Tool 系统 | 第 6 章 |
| CLAWDCODE.md 多级查找 | 向上递归查找项目配置 | - | 可选优化 |

---

## 完成记录

当 TODO 项完成时，移动到此处并标注完成章节。

| 功能 | 完成章节 | 日期 |
|------|----------|------|
| - | - | - |
