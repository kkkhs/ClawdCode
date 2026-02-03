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
│   ├── ui/                 # UI 系统
│   │   ├── components/     # React 组件
│   │   │   └── ErrorBoundary.tsx  # 错误边界（第 3 章）
│   │   └── App.tsx         # UI 入口
│   ├── config/             # 配置管理
│   ├── context/            # 上下文管理（消息历史、压缩）
│   ├── services/           # 服务层 (ChatService)
│   ├── prompts/            # 提示词管理
│   ├── mcp/                # MCP 协议（进阶）
│   ├── store/              # Zustand Store
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
| 04 | Agent 类设计、无状态架构、核心执行循环 | ⏳ 待提供 |
| 05 | 系统提示词、Plan 模式提示词、工具提示词、压缩提示词 | ⏳ 待提供 |
| 06 | 工具抽象、内置工具、工具注册机制 | ⏳ 待提供 |
| 07 | 执行管道、权限模型、确认机制 | ⏳ 待提供 |
| 08 | 消息历史、Token 统计、自动压缩策略 | ⏳ 待提供 |

### 第三部分：进阶篇

| 章节 | 内容 | 状态 |
|------|------|------|
| 09 | Ink 框架、Markdown 渲染、焦点管理 | ⏳ 待提供 |
| 10 | MCP 协议介绍、工具发现、服务器管理 | ⏳ 待提供 |
| 11 | 双文件配置、Zustand Store、SSOT 架构 | ⏳ 待提供 |
| 12 | Hooks、Subagents、Skills、IDE 集成、多端架构 | ⏳ 待提供 |

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
- [ ] 第 04 章：Agent 核心
- [ ] 第 05 章：提示词系统
- [ ] 第 06 章：工具系统
- [ ] 第 07 章：执行管道
- [ ] 第 08 章：上下文管理
- [ ] 第 09 章：UI 系统
- [ ] 第 10 章：MCP 协议
- [ ] 第 11 章：配置管理
- [ ] 第 12 章：进阶功能
