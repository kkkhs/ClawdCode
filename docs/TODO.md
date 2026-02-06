# TODO - 待实现功能跟踪

> 记录各章节中提及但未实现的功能，等待后续章节补充。

---

## 第 12 章拆分计划

原第 12 章内容较多（约 4200 行），拆分为以下 6 个小步骤：

| 步骤 | 主题 | 包含内容 | 预估行数 |
|------|------|---------|---------|
| **12a** | Slash Commands | 命令注册、执行、模糊搜索、自定义命令（Markdown 定义）、`/compact` 等 | ~1080 |
| **12b** | Hooks 系统 | 11 种事件类型、HookExecutor、`/hooks` 命令、HookManager 完整实现 | ~770 |
| **12c** | Subagent 机制 | SubagentRegistry、SubagentExecutor、内置 Agent（Explore/Plan）、BackgroundAgentManager | ~422 |
| **12d** | Skills 系统 | 渐进式披露、SkillRegistry、SkillLoader、SkillInstaller、Skill 工具 | ~412 |
| **12e** | 插件系统 | PluginManifest、PluginLoader、PluginRegistry、命名空间、远程安装、扩展模式总结 | ~679 |
| **12f** | IDE 集成 | VS Code 扩展、WebSocket 通信、IdeClient、IdeContext、多端扩展展望 | ~856 |

**补充内容**（分散到各步骤）：
- `doctor` / `update` 子命令 → 12a（Slash Commands）
- `--mcp-config` CLI 参数 → 12a
- `registerCleanup` (GracefulShutdown) → 12b（Hooks 的 SessionEnd 事件）
- 交互式确认 UI → 12a（已有 ConfirmationPrompt，需集成到 SlashCommand 流程）

---

## 第三章遗留

| 功能 | 说明 | 依赖 | 计划章节 |
|------|------|------|----------|
| ~~`initializeStoreState`~~ | ~~初始化应用状态到 Store~~ | ~~Zustand Store~~ | ✅ 第 11 章 |
| ~~`mergeRuntimeConfig`~~ | ~~合并 CLI 参数到运行时配置~~ | ~~RuntimeConfig 类型~~ | ✅ 第 11 章 |
| ~~`appActions().setInitializationStatus`~~ | ~~设置初始化状态~~ | ~~Zustand actions~~ | ✅ 第 11 章 |
| ~~子命令 `mcp`~~ | ~~MCP 服务器管理~~ | ~~MCP 模块~~ | ✅ 第 10 章 |
| 子命令 `doctor` | 诊断命令 | 诊断模块 | 第 12a 章 |
| 子命令 `update` | 更新命令 | - | 第 12a 章 |
| `subagentRegistry` | Subagent 注册表 | Subagent 系统 | 第 12c 章 |
| ~~`HookManager`~~ | ~~Hooks 管理器~~ | ~~Hooks 系统~~ | ✅ 第 12e 章 |
| `registerCleanup` | 注册退出清理函数 | GracefulShutdown | 第 12e 章 |
| `BackgroundShellManager` | 后台 Shell 管理 | Shell 工具 | 第 6 章 |
| ~~`McpRegistry`~~ | ~~MCP 注册表~~ | ~~MCP 模块~~ | ✅ 第 10 章 |

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
| ~~MCP 工具注册~~ | ~~动态注册 MCP 工具~~ | ~~McpRegistry~~ | ✅ 第 10 章 |
| ~~集成到 Agent~~ | ~~Agent 使用工具系统~~ | ~~ExecutionPipeline~~ | ✅ 第 7 章 |

## 第七章遗留

| 功能 | 说明 | 依赖 | 计划章节 |
|------|------|------|----------|
| ~~HookManager 完整实现~~ | ~~Hooks 管理器完整版（11 种事件）~~ | - | ✅ 第 12e 章 |
| 交互式确认 UI | 集成 ConfirmationPrompt 到 SlashCommand 流程 | Store 集成 | 第 12a 章 |

## 第九章遗留

| 功能 | 说明 | 依赖 | 状态 |
|------|------|------|------|
| App.tsx 切换到 ClawdInterface | 使用完整主界面替换 MainInterface | Zustand Store | ✅ 第 11 章 |
| 集成 MessageArea/InputArea | 使用新组件替换 ink-text-input | ClawdInterface | ✅ 第 11 章 |
| 集成 LoadingIndicator/ChatStatusBar | 使用新组件 | ClawdInterface | ✅ 第 11 章 |

## 第八章遗留

| 功能 | 说明 | 依赖 | 计划章节 |
|------|------|------|----------|
| ~~`/compact` 命令~~ | ~~用户手动触发压缩~~ | ~~slash-commands 系统~~ | ✅ 第 12a 章（基础版） |
| ContextFilter | 上下文过滤器 | - | 可选优化 |
| ~~Agent 集成 ContextManager~~ | ~~Agent 使用上下文管理（含会话持久化保存）~~ | ~~UI/Store~~ | ✅ 第 11 章 |

## 第十章遗留

| 功能 | 说明 | 依赖 | 计划章节 |
|------|------|------|----------|
| `loadMcpConfigFromCli` | 从 CLI 参数 `--mcp-config` 加载临时 MCP 配置 | Store 集成 | 第 12a 章（TODO） |
| `OAuthProvider` | OAuth 2.0 认证流程（需要浏览器交互） | - | 可选优化 |
| `src/mcp/auth/` 目录 | OAuth 认证相关文件 | OAuthProvider | 可选优化 |
| `--mcp-config` CLI 参数 | CLI 传递临时 MCP 配置 | loadMcpConfigFromCli | 第 12a 章（TODO） |
| ~~Slash 命令集成到 UI~~ | ~~在 UI 中处理 `/mcp`、`/compact` 等 slash 命令~~ | ~~UI 系统~~ | ✅ 第 12a 章 |

## 第十一章遗留

| 功能 | 说明 | 依赖 | 计划章节 |
|------|------|------|----------|
| ConfigService 完整实现 | 字段路由表、防抖、Per-file Mutex | write-file-atomic | 可选优化 |
| 双文件配置加载 | settings.json + settings.local.json | ConfigManager 重构 | ✅ 第 11 章 |
| 环境变量插值 | 配置文件中支持 `${VAR}` 语法 | ConfigManager | 可选优化 |
| Store 与 UI 完整集成 | App.tsx 使用 Store 管理状态 | ClawdInterface | ✅ 第 11 章 |
| configActions 持久化 | setTheme 等方法同步持久化到磁盘 | ConfigService | 可选优化 |

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
| 主题系统 (ThemeManager) | 第 9 章 | 2026-02-03 |
| 焦点管理系统 (FocusManager) | 第 9 章 | 2026-02-03 |
| Markdown 解析器 | 第 9 章 | 2026-02-03 |
| MessageRenderer 消息渲染 | 第 9 章 | 2026-02-03 |
| CodeHighlighter 代码高亮 | 第 9 章 | 2026-02-03 |
| CustomTextInput 自定义输入 | 第 9 章 | 2026-02-03 |
| InputArea 输入区域 | 第 9 章 | 2026-02-03 |
| ClawdInterface 主界面 | 第 9 章 | 2026-02-03 |
| 自定义 Hooks (useTerminalWidth 等) | 第 9 章 | 2026-02-03 |
| McpClient MCP 客户端 | 第 10 章 | 2026-02-03 |
| McpRegistry MCP 注册中心 | 第 10 章 | 2026-02-03 |
| HealthMonitor 健康监控 | 第 10 章 | 2026-02-03 |
| createMcpTool JSON Schema 转换器 | 第 10 章 | 2026-02-03 |
| /mcp Slash 命令 | 第 10 章 | 2026-02-03 |
| ConfigManager MCP 配置支持 | 第 10 章 | 2026-02-03 |
| Agent 集成 MCP 工具 | 第 10 章 | 2026-02-03 |
| Zustand Vanilla Store | 第 11 章 | 2026-02-04 |
| sessionSlice 会话状态 | 第 11 章 | 2026-02-04 |
| configSlice 配置状态 | 第 11 章 | 2026-02-04 |
| appSlice 应用状态 | 第 11 章 | 2026-02-04 |
| focusSlice 焦点状态 | 第 11 章 | 2026-02-04 |
| commandSlice 命令队列 | 第 11 章 | 2026-02-04 |
| React 选择器 (selectors.ts) | 第 11 章 | 2026-02-04 |
| ensureStoreInitialized | 第 11 章 | 2026-02-04 |
| RuntimeConfig 类型 | 第 11 章 | 2026-02-04 |
| FIELD_ROUTING_TABLE 字段路由表 | 第 11 章 | 2026-02-04 |
| DEFAULT_PERMISSIONS 默认权限 | 第 11 章 | 2026-02-04 |
| mergeRuntimeConfig CLI 参数合并 | 第 11 章 | 2026-02-04 |
| initializeStoreState Store 初始化 | 第 11 章 | 2026-02-04 |
| App.tsx 切换到 ClawdInterface | 第 11 章 | 2026-02-04 |
| Store 与 UI 完整集成 | 第 11 章 | 2026-02-04 |
| ContextManager 集成到 ClawdInterface | 第 11 章 | 2026-02-04 |
| 会话持久化（JSONL 自动保存） | 第 11 章 | 2026-02-04 |
| Token 计数 + 自动压缩检查 | 第 11 章 | 2026-02-04 |
| sessionActions.setSessionId | 第 11 章 | 2026-02-04 |
| 完整 Session ID 显示 | 第 11 章 | 2026-02-04 |
| 退出时会话恢复提示 | 第 11 章 | 2026-02-04 |
| useCtrlCHandler onBeforeExit 回调 | 第 11 章 | 2026-02-04 |
| ExitMessage 退出提示组件 | 第 11 章 | 2026-02-04 |
| Slash 命令类型定义 | 第 12a 章 | 2026-02-04 |
| 命令注册中心 (index.ts) | 第 12a 章 | 2026-02-04 |
| 模糊匹配 (fuse.js) | 第 12a 章 | 2026-02-04 |
| 内置命令 (help, clear, compact, version, model, theme, status) | 第 12a 章 | 2026-02-04 |
| 自定义命令加载器 (CustomCommandLoader) | 第 12a 章 | 2026-02-04 |
| 自定义命令执行器 (CustomCommandExecutor) | 第 12a 章 | 2026-02-04 |
| 自定义命令注册中心 (CustomCommandRegistry) | 第 12a 章 | 2026-02-04 |
| ClawdInterface Slash 命令集成 | 第 12a 章 | 2026-02-04 |
| 命令补全建议组件 (CommandSuggestions) | 第 12a 章 | 2026-02-04 |
| 命令补全 UI (↑↓ 选择, Tab 补全) | 第 12a 章 | 2026-02-04 |
| 交互式选择器 (InteractiveSelector) | 第 12b 章 | 2026-02-05 |
| /model 交互式选择 | 第 12b 章 | 2026-02-05 |
| /theme 交互式选择 | 第 12b 章 | 2026-02-05 |
| 流式输出 (ChatService streaming) | 第 12c 章 | 2026-02-06 |
| 思考过程显示 (thinking/reasoning) | 第 12c 章 | 2026-02-06 |
| 流式消息管理 (sessionSlice streaming actions) | 第 12c 章 | 2026-02-06 |
| 节流更新器 (throttled stream updater) | 第 12c 章 | 2026-02-06 |
| 细粒度选择器 (useMessageById, useMessageIds) | 第 12c 章 | 2026-02-06 |
| 主题自动检测 (detectColorMode) | 第 12c 章 | 2026-02-06 |
| 主题持久化 (getTheme, saveTheme) | 第 12c 章 | 2026-02-06 |
| Light 主题 (lightTheme.ts) | 第 12c 章 | 2026-02-06 |
| Skills 类型定义 (types.ts) | 第 12d 章 | 2026-02-06 |
| SkillLoader 解析器 | 第 12d 章 | 2026-02-06 |
| SkillRegistry 注册中心 | 第 12d 章 | 2026-02-06 |
| 内置 skill-creator Skill | 第 12d 章 | 2026-02-06 |
| generateAvailableSkillsList 系统提示生成 | 第 12d 章 | 2026-02-06 |
| Skill 工具 (skill.ts) | 第 12d 章 | 2026-02-06 |
| 系统提示注入 Skills 列表 | 第 12d 章 | 2026-02-06 |
| ClawdInterface Skills 初始化 | 第 12d 章 | 2026-02-06 |
| /skills 管理命令 | 第 12d 章 | 2026-02-06 |
| Hooks 类型定义 (types.ts) | 第 12e 章 | 2026-02-06 |
| Matcher 匹配器 | 第 12e 章 | 2026-02-06 |
| HookExecutor 执行器 | 第 12e 章 | 2026-02-06 |
| HookManager 管理器 | 第 12e 章 | 2026-02-06 |
| /hooks 管理命令 | 第 12e 章 | 2026-02-06 |
| HookStage ExecutionPipeline 集成 | 第 12e 章 | 2026-02-06 |
| PostHookStage ExecutionPipeline 集成 | 第 12e 章 | 2026-02-06 |
| ClawdInterface Hooks 初始化 | 第 12e 章 | 2026-02-06 |
| config/types.ts HookConfig Schema 完善 | 第 12e 章 | 2026-02-06 |
| ConfigSchema 添加 hooks 字段 | 第 12e 章 | 2026-02-06 |
| ConfigManager.mergeConfig 支持 hooks | 第 12e 章 | 2026-02-06 |
| HookService 简洁 API 层 | 第 12e 章 | 2026-02-06 |
| SessionStart/SessionEnd hooks 集成 | 第 12e 章 | 2026-02-06 |
| UserPromptSubmit hooks 集成 | 第 12e 章 | 2026-02-06 |
| PermissionRequest hooks 集成 | 第 12e 章 | 2026-02-06 |
| Compaction hooks 集成 | 第 12e 章 | 2026-02-06 |
| HookService 统一工具执行 Hooks (onPreToolUse/onPostToolUse/onPostToolUseFailure) | 第 12e 章 | 2026-02-06 |
| HookStage/PostHookStage 通过 HookService 调用 | 第 12e 章 | 2026-02-06 |
| Stop hooks 集成到 Agent.executeLoop | 第 12e 章 | 2026-02-06 |
