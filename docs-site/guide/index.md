# ClawdCode 教程

从零构建一个生产级 CLI Coding Agent 的完整教程。

## 核心公式

```
Coding Agent = LLM + System Prompt + Context + Tools
```

| 组件 | 角色 |
|:-----|:-----|
| **LLM** | 推理引擎 |
| **System Prompt** | 身份、约束、风格 |
| **Context** | 项目信息、对话历史 |
| **Tools** | 文件读写、Shell、搜索 — Agent 的双手 |

## 目录

### 起步

| # | 主题 | 内容 |
|:--|:-----|:-----|
| [01](/guide/chapter-01) | Coding Agent 概述 | 核心概念、设计理念 |
| [02](/guide/chapter-02) | 项目搭建 | 技术栈选型、Hello World |
| [03](/guide/chapter-03) | CLI 入口 | yargs 配置、中间件 |

### 核心架构

| # | 主题 | 内容 |
|:--|:-----|:-----|
| [04](/guide/chapter-04) | Agent 核心 | Agent 类、Agentic Loop |
| [05](/guide/chapter-05) | System Prompt | 提示词架构、Plan 模式 |
| [06](/guide/chapter-06) | 工具系统 | 工具抽象、内置工具 |
| [07](/guide/chapter-07) | 执行管道与权限 | 七阶段管道、权限模型 |

### 系统集成

| # | 主题 | 内容 |
|:--|:-----|:-----|
| [08](/guide/chapter-08) | 上下文管理 | Token 统计、自动压缩 |
| [09](/guide/chapter-09) | UI 系统 | Ink (React for CLI)、Markdown |
| [10](/guide/chapter-10) | MCP 协议 | 外部工具发现、协议集成 |
| [11](/guide/chapter-11) | 状态管理 | Zustand Store、会话持久化 |
| [12](/guide/chapter-12) | 命令历史与队列 | 命令历史、队列系统 |

### 扩展能力

| # | 主题 | 内容 |
|:--|:-----|:-----|
| [13](/guide/chapter-13) | Slash Commands | 命令系统、自定义命令 |
| [14](/guide/chapter-14) | 交互式 Commands | 模型/主题交互式选择 |
| [15](/guide/chapter-15) | 流式输出与主题 | 流式渲染、主题持久化 |
| [16](/guide/chapter-16) | Skills 系统 | Agent 技能模块 |
| [17](/guide/chapter-17) | Hooks 系统 | 生命周期钩子 |

## 技术栈

```
TypeScript · Bun · Ink · Zustand · OpenAI SDK · Zod · MCP
```

## 环境要求

- Node.js >= 18
- Bun >= 1.0
- OpenAI 兼容的 API Key

## 安装

::: code-group

```bash [npm]
npm install -g clawdcode
```

```bash [bun]
bun add -g clawdcode
```

```bash [源码]
git clone https://github.com/kkkhs/ClawdCode.git
cd ClawdCode && bun install && bun run dev
```

:::

## 运行

```bash
clawdcode                          # 交互模式
clawdcode "分析一下这个项目"         # 带初始消息
clawdcode --continue               # 恢复上次会话
```

## 参考资源

- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [Ink](https://github.com/vadimdemedes/ink)
- [Model Context Protocol](https://modelcontextprotocol.io/)

---

准备好了？从 [01. Coding Agent 概述](/guide/chapter-01) 开始。
