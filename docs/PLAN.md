# ClawdCode - 实现自己的 Claude Code

> 参考文章：[万字长文 | 实现自己的 Claude Code](https://bytetech.info/articles/7585343019822350379)

## 项目目标

从零实现一个功能完整的 CLI Coding Agent，深入理解 Coding Agent 的设计原理。

## 核心公式

```
Coding Agent = LLM + System Prompt + Context + Tools
```

- **LLM** - 大脑，提供逻辑推理与决策能力
- **System Prompt** - 性格、行为边界和能做什么
- **Context** - 当前项目、当前任务中"应该怎么做"
- **Tools** - 可以真正操作世界的手（读写文件、执行命令等）

## 核心设计原则

1. **无状态 Agent** - 每次对话创建新实例，简单可靠
2. **Agentic Loop** - 工具调用 → 执行 → 反馈 → 继续，直到任务完成
3. **权限控制** - 读操作自动执行，写操作需要确认，安全可控
4. **本地优先** - 工具在本地执行，直接访问文件系统

## 技术栈

| 组件 | 选择 | 说明 |
|------|------|------|
| 语言 | TypeScript | 模型训练数据中大量存在 |
| UI 框架 | Ink (React for CLI) | 组件化，复用 React 知识 |
| CLI 框架 | yargs | 命令解析 |
| 状态管理 | Zustand | 与 React 解耦，Agent 可直接访问 |
| LLM 接口 | OpenAI SDK | 支持 OpenAI 兼容的所有服务 |
| 验证 | Zod | 运行时参数验证 |
| 运行时/构建 | Bun | 超快的 JavaScript 运行时和构建工具 |

## 项目结构

```
clawdcode/
├── src/
│   ├── agent/              # Agent 核心（无状态设计）
│   │   ├── SimpleAgent.ts  # 简单 Agent（第 2 章）
│   │   ├── Agent.ts        # 主 Agent 类（待实现）
│   │   └── types.ts        # 类型定义
│   ├── cli/                # CLI 模块（第 3 章）
│   │   ├── types.ts        # CLI 类型定义
│   │   ├── config.ts       # yargs 选项配置
│   │   ├── middleware.ts   # 中间件函数
│   │   └── index.ts        # 模块导出
│   ├── tools/              # 工具系统
│   │   ├── builtin/        # 内置工具 (Read, Write, Edit, Bash, Grep, Glob)
│   │   ├── registry/       # 工具注册表
│   │   └── execution/      # 执行管道
│   ├── ui/                 # UI 系统（第 9 章）
│   │   ├── App.tsx         # UI 入口（AppWrapper + MainInterface）
│   │   ├── components/     # React 组件（按功能分组）
│   │   │   ├── common/     # 通用组件
│   │   │   │   ├── ErrorBoundary.tsx
│   │   │   │   └── LoadingIndicator.tsx
│   │   │   ├── input/      # 输入组件
│   │   │   │   ├── CustomTextInput.tsx
│   │   │   │   └── InputArea.tsx
│   │   │   ├── markdown/   # Markdown 渲染
│   │   │   │   ├── CodeHighlighter.tsx
│   │   │   │   ├── MessageRenderer.tsx
│   │   │   │   ├── parser.ts
│   │   │   │   └── types.ts
│   │   │   ├── dialog/     # 对话框组件
│   │   │   │   ├── ConfirmationPrompt.tsx
│   │   │   │   └── UpdatePrompt.tsx
│   │   │   ├── layout/     # 布局组件
│   │   │   │   ├── ChatStatusBar.tsx
│   │   │   │   └── MessageArea.tsx
│   │   │   └── ClawdInterface.tsx  # 主界面（顶层）
│   │   ├── themes/         # 主题系统
│   │   │   ├── ThemeManager.ts
│   │   │   ├── defaultTheme.ts
│   │   │   └── darkTheme.ts
│   │   ├── hooks/          # 自定义 Hooks
│   │   │   ├── useTerminalWidth.ts
│   │   │   ├── useCommandHistory.ts
│   │   │   ├── useInputBuffer.ts
│   │   │   └── useConfirmation.ts
│   │   └── focus/          # 焦点管理
│   │       ├── FocusManager.ts
│   │       └── useFocus.ts
│   ├── config/             # 配置管理
│   ├── context/            # 上下文管理（第 8 章）
│   │   ├── storage/        # 存储层 (Memory/Persistent/Cache)
│   │   ├── ContextManager  # 上下文管理器
│   │   ├── TokenCounter    # Token 计算
│   │   └── CompactionService # 压缩服务
│   ├── services/           # 服务层 (ChatService)
│   ├── prompts/            # 提示词管理
│   ├── mcp/                # MCP 协议（第 10 章）
│   │   ├── types.ts        # MCP 类型定义
│   │   ├── McpClient.ts    # MCP 客户端
│   │   ├── McpRegistry.ts  # 服务器注册中心
│   │   ├── createMcpTool.ts # JSON Schema → Zod 转换
│   │   └── HealthMonitor.ts # 健康监控
│   ├── slash-commands/     # Slash 命令
│   │   ├── types.ts        # 命令类型
│   │   ├── mcpCommand.ts   # /mcp 命令
│   │   └── index.ts        # 命令注册
│   ├── store/              # Zustand Store（第 11 章）
│   │   ├── types.ts        # Store 类型定义
│   │   ├── vanilla.ts      # Vanilla Store 实例
│   │   ├── selectors.ts    # React 选择器
│   │   ├── slices/         # Store Slices
│   │   │   ├── sessionSlice.ts
│   │   │   ├── configSlice.ts
│   │   │   ├── appSlice.ts
│   │   │   ├── focusSlice.ts
│   │   │   └── commandSlice.ts
│   │   └── index.ts        # 模块导出
│   └── main.tsx            # CLI 入口
├── package.json
└── tsconfig.json
```

---

## 章节计划

### 第一部分：基础篇

| 章节 | 内容 | 状态 |
|------|------|------|
| 01 | 什么是 Coding Agent、Claude Code 的设计理念、核心架构概览 | ✅ 已完成 → [文档](01-coding-agent-overview.md) |
| 02 | 技术栈选择、项目结构设计、开发环境搭建 | ✅ 已完成 → [文档](02-project-setup.md) |
| 03 | yargs CLI 框架、中间件机制、启动流程详解 | ✅ 已完成 → [文档](03-cli-entry.md) |

### 第二部分：核心篇

| 章节 | 内容 | 状态 |
|------|------|------|
| 04 | Agent 类设计、无状态架构、核心执行循环 | ✅ 已完成 → [文档](04-agent-core.md) |
| 05 | 系统提示词、Plan 模式提示词、工具提示词、压缩提示词 | ✅ 已完成 → [文档](05-system-prompt.md) |
| 06 | 工具抽象、内置工具、工具注册机制 | ✅ 已完成 → [文档](06-tool-system.md) |
| 07 | 执行管道、权限模型、确认机制 | ✅ 已完成 → [文档](07-execution-pipeline.md) |
| 08 | 消息历史、Token 统计、自动压缩策略 | ✅ 已完成 → [文档](08-context-management.md) |

### 第三部分：进阶篇

| 章节 | 内容 | 状态 |
|------|------|------|
| 09 | Ink 框架、Markdown 渲染、焦点管理 | ✅ 已完成 → [文档](09-ui-system.md) |
| 10 | MCP 协议介绍、工具发现、服务器管理 | ✅ 已完成 → [文档](10-mcp-protocol.md) |
| 11 | 双文件配置、Zustand Store、SSOT 架构 | ✅ 已完成 → [文档](11-config-state-management.md) |
| 11b | 命令历史、命令队列、队列可视化 | ✅ 已完成 → [文档](11b-command-history-queue.md) |
| 12a | Slash Commands：命令注册、执行、自定义命令、`/compact`、`doctor`、`update` | ✅ 已完成 → [文档](12a-slash-commands.md) |
| 12b | Hooks 系统：11 种事件、HookExecutor、`/hooks` 命令 | ⏳ 待实现 |
| 12c | Subagent 机制：SubagentRegistry、SubagentExecutor、内置 Agent | ⏳ 待实现 |
| 12d | Skills 系统：渐进式披露、SkillRegistry、SkillInstaller | ⏳ 待实现 |
| 12e | 插件系统：PluginManifest、PluginLoader、命名空间、远程安装 | ⏳ 待实现 |
| 12f | IDE 集成：VS Code 扩展、WebSocket、IdeClient、多端展望 | ⏳ 待实现 |

---

## Agentic Loop 核心流程

```
用户输入 → 构建消息 → 调用 LLM → 有工具调用？
                                    ↓ 是
                              执行工具 → 注入结果 → 继续循环
                                    ↓ 否
                              返回响应（任务完成）
```

循环终止条件：
1. 任务完成：LLM 不再请求工具调用
2. 达到轮次上限：防止无限循环（默认 100 轮）
3. 用户中止
4. 不可恢复的错误

---

## 工具分类

| 工具类别 | 示例 | 用途 |
|----------|------|------|
| 文件工具 | Read, Write, Edit | 读取、创建、修改文件 |
| 搜索工具 | Glob, Grep | 查找文件和代码 |
| 执行工具 | Bash | 运行命令 |
| 网络工具 | WebFetch | 获取网络资源 |

---

## 权限模型

```
安全级别：
- 只读操作：自动允许（如 Read, Glob, Grep）
- 写入操作：需要用户确认（如 Edit, Write）
- 危险操作：明确提示风险（如 rm -rf）
```

---

## 实现进度

- [x] 第 01 章：概念理解 ✅
- [x] 第 02 章：项目初始化 ✅ (Hello World Agent 完成)
- [x] 第 03 章：CLI 入口 ✅ (yargs + 中间件 + ErrorBoundary)
- [x] 第 04 章：Agent 核心 ✅ (无状态设计 + Agentic Loop)
- [x] 第 05 章：System Prompt ✅ (四层架构 + Plan 模式)
- [x] 第 06 章：工具系统 ✅ (createTool + Registry + 6 个内置工具)
- [x] 第 07 章：执行管道 ✅ (七阶段管道 + 权限模型 + 确认机制)
- [x] 第 08 章：上下文管理 ✅ (ContextManager + TokenCounter + 压缩服务 + JSONL 持久化)
- [x] 第 09 章：UI 系统 ✅ (主题系统 + 焦点管理 + Markdown 渲染 + 代码高亮 + ClawdInterface)
- [x] 第 10 章：MCP 协议 ✅ (McpClient + McpRegistry + createMcpTool + HealthMonitor + /mcp 命令)
- [x] 第 11 章：配置系统与状态管理 ✅ (Zustand Store + 5 Slices + 选择器 + UI 集成 + ClawdInterface + ContextManager 集成)
- [x] 第 11b 章：命令历史与命令队列 ✅ (useCommandHistory + 命令队列 + 队列可视化 + 状态栏集成)
- [x] 第 12a 章：Slash Commands 系统 ✅ (命令注册中心 + 模糊匹配 + 内置命令 + 自定义命令 + UI 集成)
- [ ] 第 12b 章：Hooks 系统
- [ ] 第 12c 章：Subagent 机制
- [ ] 第 12d 章：Skills 系统
- [ ] 第 12e 章：插件系统
- [ ] 第 12f 章：IDE 集成
