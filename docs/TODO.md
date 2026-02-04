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
| ~~`registerBuiltinTools`~~ | ~~注册内置工具~~ | ~~ToolRegistry~~ | ✅ 第 6 章 |
| ~~`executeToolCall` 完整实现~~ | ~~工具执行管道~~ | ~~ExecutionPipeline~~ | ✅ 第 7 章 |
| ~~`checkAndCompact`~~ | ~~上下文压缩~~ | ~~CompactionService~~ | ✅ 第 8 章 |
| ~~Plan 模式~~ | ~~只读调研模式~~ | ~~PLAN_MODE_SYSTEM_PROMPT~~ | ✅ 第 5 章 |
| `processAtMentions` | @ 文件提及处理 | AttachmentCollector | 第 9 章 |
| ~~`runPlanLoop`~~ | ~~Plan 模式执行循环~~ | ~~权限过滤~~ | ✅ 第 7 章 |
| `applyToolWhitelist` | 工具白名单 | ToolRegistry | 第 9 章 |
| ~~循环检测~~ | ~~防止 Agent 陷入循环~~ | ~~LoopDetector~~ | ✅ 第 8 章（基础版）|

## 第五章遗留

| 功能 | 说明 | 依赖 | 计划章节 |
|------|------|------|----------|
| ~~压缩提示词~~ | ~~上下文压缩时使用~~ | ~~CompactionService~~ | ✅ 第 8 章 |
| ~~工具描述格式~~ | ~~ToolDescription 结构化~~ | ~~Tool 系统~~ | ✅ 第 6 章 |
| CLAWDCODE.md 多级查找 | 向上递归查找项目配置 | - | 可选优化 |

## 第六章遗留

| 功能 | 说明 | 依赖 | 计划章节 |
|------|------|------|----------|
| ~~Edit 工具~~ | ~~字符串替换编辑~~ | - | ✅ 基础版已实现 |
| ~~Write 工具~~ | ~~文件写入~~ | - | ✅ 基础版已实现 |
| ~~Bash 工具~~ | ~~Shell 命令执行~~ | - | ✅ 基础版已实现 |
| SnapshotManager | 编辑前创建文件快照 | - | 第 9 章 |
| FileAccessTracker | Read-Before-Write 追踪 | - | 第 9 章 |
| BackgroundShellManager | 后台 Shell 进程管理 | - | 第 9 章 |
| ~~权限确认流程~~ | ~~写操作用户确认~~ | ~~ExecutionPipeline~~ | ✅ 第 7 章 |
| MCP 工具注册 | 动态注册 MCP 工具 | McpRegistry | 第 10 章 |
| ~~集成到 Agent~~ | ~~Agent 使用工具系统~~ | ~~ExecutionPipeline~~ | ✅ 第 7 章 |

## 第七章遗留

| 功能 | 说明 | 依赖 | 计划章节 |
|------|------|------|----------|
| HookManager 完整实现 | Hooks 管理器完整版 | - | 第 12 章 |
| 交互式确认 UI | 集成 ConfirmationPrompt 到主 UI | - | 第 9 章 |

## 第八章遗留

| 功能 | 说明 | 依赖 | 计划章节 |
|------|------|------|----------|
| `/compact` 命令 | 用户手动触发压缩 | slash-commands 系统 | 第 9 章 |
| ContextFilter | 上下文过滤器 | - | 可选优化 |
| Agent 集成 ContextManager | Agent 使用上下文管理 | UI/Store | 第 11 章 |

---

## 完成记录

当 TODO 项完成时，移动到此处并标注完成章节。

| 功能 | 完成章节 | 日期 |
|------|----------|------|
| registerBuiltinTools | 第 6 章 | 2026-02-03 |
| 工具描述格式 (ToolDescription) | 第 6 章 | 2026-02-03 |
| Edit 工具（基础版） | 第 6 章 | 2026-02-03 |
| Write 工具 | 第 6 章 | 2026-02-03 |
| Bash 工具（基础版） | 第 6 章 | 2026-02-03 |
| Tool 完整接口 | 第 6 章 | 2026-02-03 |
| ToolRegistry MCP 支持 | 第 6 章 | 2026-02-03 |
| ExecutionPipeline 七阶段管道 | 第 7 章 | 2026-02-03 |
| PermissionChecker 权限检查器 | 第 7 章 | 2026-02-03 |
| SensitiveFileDetector 敏感文件检测 | 第 7 章 | 2026-02-03 |
| ConfirmationPrompt 确认 UI | 第 7 章 | 2026-02-03 |
| Agent 集成 ExecutionPipeline | 第 7 章 | 2026-02-03 |
| executeToolCall 完整实现 | 第 7 章 | 2026-02-03 |
| Plan 模式权限过滤 | 第 7 章 | 2026-02-03 |
| ContextManager 上下文管理 | 第 8 章 | 2026-02-03 |
| TokenCounter Token 计算 | 第 8 章 | 2026-02-03 |
| CompactionService 压缩服务 | 第 8 章 | 2026-02-03 |
| FileAnalyzer 文件分析 | 第 8 章 | 2026-02-03 |
| JSONL 持久化存储 | 第 8 章 | 2026-02-03 |
| MemoryStore 内存存储 | 第 8 章 | 2026-02-03 |
| CacheStore LRU 缓存 | 第 8 章 | 2026-02-03 |
| --continue/--resume 参数 | 第 8 章 | 2026-02-03 |
