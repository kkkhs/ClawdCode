# 简介

欢迎来到 **ClawdCode 教程**！

本教程将带你从零开始，一步步实现一个功能完整的 CLI Coding Agent，深入理解 Coding Agent 的设计原理。

## 核心公式

```
Coding Agent = LLM + System Prompt + Context + Tools
```

| 组件 | 类比 | 作用 |
|------|------|------|
| **LLM** | 大脑 | 提供逻辑推理与决策能力 |
| **System Prompt** | 性格 | 定义行为边界、能力范围 |
| **Context** | 记忆 | 当前项目信息、任务上下文 |
| **Tools** | 双手 | 真正操作世界（读写文件、执行命令） |

## 教程结构

### 第一部分：基础篇

| 章节 | 标题 | 内容 |
|------|------|------|
| 01 | Coding Agent 概述 | 核心概念、设计理念、架构概览 |
| 02 | 项目搭建 | 技术栈选择、Hello World Agent |
| 03 | CLI 入口 | yargs 配置、中间件、版本检查 |

### 第二部分：核心篇

| 章节 | 标题 | 内容 |
|------|------|------|
| 04 | Agent 核心 | Agent 类设计、Agentic Loop |
| 05 | System Prompt | 系统提示词、Plan 模式 |
| 06 | 工具系统 | 工具抽象、内置工具 |
| 07 | 执行管道 | 权限模型、确认机制 |
| 08 | 上下文管理 | Token 统计、自动压缩 |

### 第三部分：进阶篇

| 章节 | 标题 | 内容 |
|------|------|------|
| 09 | UI 系统 | Ink 框架、Markdown 渲染 |
| 10 | MCP 协议 | 工具发现、服务器管理 |

## 技术栈

| 组件 | 选择 | 说明 |
|------|------|------|
| 语言 | TypeScript | 类型安全，LLM 熟悉 |
| UI 框架 | Ink | React for CLI |
| CLI 框架 | yargs | 命令解析 |
| LLM 接口 | OpenAI SDK | 兼容多种服务 |
| 验证 | Zod | 运行时验证 |
| 运行时 | Bun | 快速构建 |

## 快速开始

### 环境要求

- Node.js >= 18.0.0
- Bun >= 1.0.0
- 一个 OpenAI 兼容的 API Key

### 克隆项目

```bash
git clone https://github.com/kkkhs/ClawdCode.git
cd ClawdCode
bun install
```

### 配置 API

```bash
# 方式 1: 创建配置文件
bun run dev -- --init
# 然后编辑 ~/.clawdcode/config.json 添加 API Key

# 方式 2: 环境变量
export OPENAI_API_KEY=sk-your-api-key
```

### 运行

```bash
# 开发模式
bun run dev

# 带初始消息
bun run dev "帮我分析这个项目"
```

## 学习路径

```
第 1 章 (概念理解)
    ↓
第 2 章 (环境搭建)
    ↓
第 3 章 (CLI 框架)
    ↓
第 4-5 章 (Agent 核心)
    ↓
第 6-7 章 (工具系统)
    ↓
第 8 章 (上下文管理)
    ↓
进阶章节...
```

## 参考资源

- [万字长文 | 实现自己的 Claude Code](https://bytetech.info/articles/7585343019822350379)
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [Ink 文档](https://github.com/vadimdemedes/ink)

---

准备好了吗？让我们从 [第 1 章：Coding Agent 概述](/guide/chapter-01) 开始！
