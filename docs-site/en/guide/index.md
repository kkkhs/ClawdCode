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
| [01](/en/guide/chapter-01) | Coding Agent Overview | Core concepts, design philosophy |
| [02](/en/guide/chapter-02) | Project Setup | Tech stack, Hello World agent |
| [03](/en/guide/chapter-03) | CLI Entry | yargs, middleware, version check |

### Core Architecture

| # | Topic | What you'll learn |
|:--|:------|:------------------|
| [04](/en/guide/chapter-04) | Agent Core | Agent class, Agentic Loop |
| [05](/en/guide/chapter-05) | System Prompt | Prompt architecture, Plan mode |
| [06](/en/guide/chapter-06) | Tool System | Tool abstraction, built-in tools |
| [07](/en/guide/chapter-07) | Execution Pipeline | 7-stage pipeline, permission model |

### System Integration

| # | Topic | What you'll learn |
|:--|:------|:------------------|
| [08](/en/guide/chapter-08) | Context Management | Token counting, auto-compaction |
| [09](/en/guide/chapter-09) | UI System | Ink (React for CLI), Markdown |
| [10](/en/guide/chapter-10) | MCP Protocol | External tool discovery, protocol |
| [11](/en/guide/chapter-11) | State Management | Zustand store, session persistence |
| [12](/en/guide/chapter-12) | Command History & Queue | Command history, queue system |

### Extensions

| # | Topic | What you'll learn |
|:--|:------|:------------------|
| [13](/en/guide/chapter-13) | Slash Commands | Command system, custom commands |
| [14](/en/guide/chapter-14) | Interactive Commands | Model/theme interactive selection |
| [15](/en/guide/chapter-15) | Streaming & Themes | Streaming output, theme persistence |
| [16](/en/guide/chapter-16) | Skills System | Agent skill modules |
| [17](/en/guide/chapter-17) | Hooks System | Lifecycle hooks |

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

Ready? Start with [01. Coding Agent Overview](/en/guide/chapter-01).
