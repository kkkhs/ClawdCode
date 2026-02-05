# 简介

::: tip 🎉 欢迎来到 ClawdCode 教程！
本教程将带你从零开始，一步步实现一个功能完整的 CLI Coding Agent，深入理解 AI Agent 的设计原理。
:::

## 🧠 核心公式

```
Coding Agent = LLM + System Prompt + Context + Tools
```

<div class="tip-box">

| 组件 | 类比 | 作用 |
|:-----|:-----|:-----|
| **LLM** | 🧠 大脑 | 提供逻辑推理与决策能力 |
| **System Prompt** | 🎭 性格 | 定义行为边界、能力范围 |
| **Context** | 💾 记忆 | 当前项目信息、任务上下文 |
| **Tools** | 🤲 双手 | 真正操作世界（读写文件、执行命令） |

</div>

## 📚 教程结构

### 🌱 第一部分：基础篇

| 章节 | 标题 | 内容 |
|:-----|:-----|:-----|
| [01](/guide/chapter-01) | Coding Agent 概述 | 核心概念、设计理念、架构概览 |
| [02](/guide/chapter-02) | 项目搭建 | 技术栈选择、Hello World Agent |
| [03](/guide/chapter-03) | CLI 入口 | yargs 配置、中间件、版本检查 |

### ⚡ 第二部分：核心篇

| 章节 | 标题 | 内容 |
|:-----|:-----|:-----|
| [04](/guide/chapter-04) | Agent 核心 | Agent 类设计、Agentic Loop |
| [05](/guide/chapter-05) | System Prompt | 系统提示词、Plan 模式 |
| [06](/guide/chapter-06) | 工具系统 | 工具抽象、内置工具 |
| [07](/guide/chapter-07) | 执行管道 | 权限模型、确认机制 |
| [08](/guide/chapter-08) | 上下文管理 | Token 统计、自动压缩 |

### 🚀 第三部分：进阶篇

| 章节 | 标题 | 内容 |
|:-----|:-----|:-----|
| [09](/guide/chapter-09) | UI 系统 | Ink 框架、Markdown 渲染 |
| [10](/guide/chapter-10) | MCP 协议 | 工具发现、服务器管理 |
| [11](/guide/chapter-11) | 状态管理 | Zustand Store、会话持久化 |
| [12a](/guide/chapter-12a) | Slash Commands | 命令系统、自定义命令 |

## 🛠️ 技术栈

<div class="tech-stack">

| 组件 | 选择 | 说明 |
|:-----|:-----|:-----|
| 📝 语言 | TypeScript | 类型安全，LLM 熟悉 |
| 🎨 UI 框架 | Ink | React for CLI |
| ⌨️ CLI 框架 | yargs | 命令解析 |
| 🤖 LLM 接口 | OpenAI SDK | 兼容多种服务 |
| ✅ 验证 | Zod | 运行时验证 |
| ⚡ 运行时 | Bun | 快速构建 |
| 📦 状态管理 | Zustand | 轻量级 Store |

</div>

## 🚀 快速开始

### 环境要求

- Node.js >= 18.0.0
- Bun >= 1.0.0
- 一个 OpenAI 兼容的 API Key

### 安装使用

::: code-group

```bash [npm]
npm install -g clawdcode
```

```bash [bun]
bun add -g clawdcode
```

```bash [从源码]
git clone https://github.com/kkkhs/ClawdCode.git
cd ClawdCode
bun install
bun run dev
```

:::

### 配置 API

```bash
# 方式 1: 交互式配置
clawdcode --init

# 方式 2: 环境变量
export OPENAI_API_KEY=sk-your-api-key
```

### 运行

```bash
# 交互模式
clawdcode

# 带初始消息
clawdcode "帮我分析这个项目"

# 恢复上次会话
clawdcode --continue
```

## 🗺️ 学习路径

```
第 1 章 (概念理解)
    ↓
第 2 章 (环境搭建)
    ↓
第 3 章 (CLI 框架)
    ↓
第 4-5 章 (Agent 核心) ←── 重点章节
    ↓
第 6-7 章 (工具系统) ←── 重点章节
    ↓
第 8 章 (上下文管理)
    ↓
进阶章节 (UI / MCP / 状态管理)
```

## 📖 参考资源

- [万字长文 | 实现自己的 Claude Code](https://bytetech.info/articles/7585343019822350379)
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [Ink 文档](https://github.com/vadimdemedes/ink)
- [Model Context Protocol](https://modelcontextprotocol.io/)

---

::: info 准备好了吗？
让我们从 [第 1 章：Coding Agent 概述](/guide/chapter-01) 开始你的 AI Agent 之旅！
:::

<style>
.tip-box {
  background: var(--vp-c-bg-soft);
  border-radius: 8px;
  padding: 1rem;
  margin: 1rem 0;
}

.tech-stack {
  background: var(--vp-c-bg-soft);
  border-radius: 8px;
  padding: 1rem;
  margin: 1rem 0;
}
</style>
