# ClawdCode Guide

A step-by-step tutorial on building a production-grade CLI coding agent.

## The Formula

```
Coding Agent = LLM + System Prompt + Context + Tools
```

| Component | Role |
|:----------|:-----|
| **LLM** | Reasoning engine |
| **System Prompt** | Identity, constraints, style |
| **Context** | Project info, conversation history |
| **Tools** | File I/O, shell, search — the agent's hands |

## Structure

### Getting Started

| # | Topic | What you'll learn |
|:--|:------|:------------------|
| [01](/guide/chapter-01) | Coding Agent 概述 | Core concepts, design philosophy |
| [02](/guide/chapter-02) | 项目搭建 | Tech stack, Hello World agent |
| [03](/guide/chapter-03) | CLI 入口 | yargs, middleware, version check |

### Agent Core

| # | Topic | What you'll learn |
|:--|:------|:------------------|
| [04](/guide/chapter-04) | Agent 核心 | Agent class, Agentic Loop |
| [05](/guide/chapter-05) | System Prompt | Prompt architecture, Plan mode |

### Tools & Execution

| # | Topic | What you'll learn |
|:--|:------|:------------------|
| [06](/guide/chapter-06) | 工具系统 | Tool abstraction, built-in tools |
| [07](/guide/chapter-07) | 执行管道与权限 | 7-stage pipeline, permission model |
| [10](/guide/chapter-10) | MCP 协议 | External tool discovery, protocol |

### State & Context

| # | Topic | What you'll learn |
|:--|:------|:------------------|
| [08](/guide/chapter-08) | 上下文管理 | Token counting, auto-compaction |
| [11](/guide/chapter-11) | 状态管理 | Zustand store, session persistence |
| [11b](/guide/chapter-11b) | 命令历史与队列 | Command history, queue system |

### Interface

| # | Topic | What you'll learn |
|:--|:------|:------------------|
| [09](/guide/chapter-09) | UI 系统 | Ink (React for CLI), Markdown |
| [12c](/guide/chapter-12c) | 流式输出与主题 | Streaming, theme persistence |

### Extensions

| # | Topic | What you'll learn |
|:--|:------|:------------------|
| [12a](/guide/chapter-12a) | Slash Commands | Command system, custom commands |
| [12b](/guide/chapter-12b) | 交互式 Commands | Interactive model/theme selection |
| [12d](/guide/chapter-12d) | Skills 系统 | Agent skill modules |
| [12e](/guide/chapter-12e) | Hooks 系统 | Lifecycle hooks |

## Tech Stack

```
TypeScript · Bun · Ink · Zustand · OpenAI SDK · Zod · MCP
```

## Requirements

- Node.js >= 18
- Bun >= 1.0
- An OpenAI-compatible API key

## Install

::: code-group

```bash [npm]
npm install -g clawdcode
```

```bash [bun]
bun add -g clawdcode
```

```bash [source]
git clone https://github.com/kkkhs/ClawdCode.git
cd ClawdCode && bun install && bun run dev
```

:::

## Run

```bash
clawdcode                          # interactive mode
clawdcode "analyze this project"   # with initial message
clawdcode --continue               # resume last session
```

## Resources

- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [Ink](https://github.com/vadimdemedes/ink)
- [Model Context Protocol](https://modelcontextprotocol.io/)

---

Ready? Start with [01. Coding Agent 概述](/guide/chapter-01).
