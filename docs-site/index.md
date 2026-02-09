---
layout: home

hero:
  name: "ClawdCode"
  text: "从零构建 AI Coding Agent"
  tagline: 参考 Claude Code 架构，从原理到实现，构建一个生产级 CLI 编程助手。17 章深度教程，完整开源。
  image:
    src: /logo.svg
    alt: ClawdCode
  actions:
    - theme: brand
      text: 开始阅读
      link: /guide/
    - theme: alt
      text: GitHub
      link: https://github.com/kkkhs/ClawdCode

features:
  - icon: ">"
    title: Agentic Loop
    details: "理解 LLM + System Prompt + Context + Tools 的核心循环 — 与 Claude Code、Cursor 相同的设计模式。"
    link: /guide/chapter-01
  - icon: "{}"
    title: 七阶段执行管道
    details: "Discovery → Permission → Hooks → Confirm → Execute → PostHook → Format，安全优先的工具执行架构。"
    link: /guide/chapter-07
  - icon: "$"
    title: 终端 UI
    details: "Ink (React for CLI) 驱动 — Markdown 渲染、140+ 语言语法高亮、主题系统、流式输出。"
    link: /guide/chapter-09
  - icon: "|"
    title: 权限与安全
    details: "四级权限模式、敏感文件检测、内联确认对话框、用户拒绝即停 — 不信任 LLM 的每一次操作。"
    link: /guide/chapter-07
  - icon: "+"
    title: MCP 协议
    details: "集成 Model Context Protocol，动态发现外部工具和数据源，无限扩展 Agent 能力边界。"
    link: /guide/chapter-10
  - icon: "~"
    title: 插件化扩展
    details: "Slash Commands、Skills、Hooks、自定义命令 — Markdown 文件即命令，零代码扩展 Agent 行为。"
    link: /guide/chapter-13
---

<div class="vp-doc custom-home">

## 🔨 你将构建什么

一个功能完整的 CLI Coding Agent，具备以下能力：

<div class="capability-grid">
<div class="capability">

🤖 **智能对话** — 基于 OpenAI 兼容 API 的多轮对话，支持思考过程展示与自动折叠

</div>
<div class="capability">

📂 **文件操作** — 读写、编辑、搜索、Glob 匹配，Agent 自主操作你的代码库

</div>
<div class="capability">

⚡ **命令执行** — Shell 命令执行，带权限控制和用户确认机制

</div>
<div class="capability">

🧠 **上下文管理** — Token 统计、自动压缩、会话持久化，突破上下文窗口限制

</div>
<div class="capability">

🎨 **交互式 UI** — 语法高亮、Markdown 渲染、主题切换、命令补全、代码块复制

</div>
<div class="capability">

🧩 **可扩展架构** — MCP 协议、自定义命令、Hooks 系统，面向真实场景设计

</div>
</div>

## 🏗️ 架构总览

```
┌──────────────────────────────────────────────────────────┐
│  CLI Entry (yargs)                                       │
│    ↓                                                     │
│  Agent Loop ←──────────────────────────────┐             │
│    ├─ Build Context (messages + tools)     │             │
│    ├─ Call LLM (streaming)                 │             │
│    ├─ Parse Response                       │             │
│    │   ├─ text → render to UI              │             │
│    │   └─ tool_calls → Execution Pipeline  │             │
│    │        ├─ 1. Discovery                │             │
│    │        ├─ 2. Permission               │             │
│    │        ├─ 3. Pre-Hooks                │             │
│    │        ├─ 4. Confirmation (UI)        │             │
│    │        ├─ 5. Execute                  │             │
│    │        ├─ 6. Post-Hooks               │             │
│    │        └─ 7. Format                   │             │
│    └─ Inject Results ──────────────────────┘             │
│                                                          │
│  Store (Zustand) ← → UI (Ink/React) ← → Theme Manager   │
│  Context Manager ← → Token Counter ← → Compaction        │
│  MCP Registry ← → External Tool Servers                  │
└──────────────────────────────────────────────────────────┘
```

## 💡 为什么选择这个教程

<div class="why-grid">
<div class="why-item">

### 🔬 参考 Claude Code

不是玩具项目。参考 Anthropic Claude Code 的真实架构设计，包括权限系统、Hooks、MCP 集成。

</div>
<div class="why-item">

### 📖 17 章循序渐进

从 Hello World 到完整 Agent，每章都有可运行的代码。理解每一行为什么存在。

</div>
<div class="why-item">

### ✅ 生产级质量

TypeScript 严格模式、Zod 运行时验证、完整错误处理、AbortController 中断机制。

</div>
<div class="why-item">

### 📦 开箱即用

`npm install -g clawdcode` 直接使用，不只是教学项目 — 它本身就是一个可用的 Coding Agent。

</div>
</div>

## 🚀 快速开始

```bash
# 安装
npm install -g clawdcode

# 配置
export OPENAI_API_KEY=sk-...

# 使用
clawdcode "帮我分析一下这个项目的架构"
```

## 🔧 技术栈

<div class="stack-grid">
<div class="stack-item">
<span class="stack-name">TypeScript</span>
<span class="stack-desc">类型安全，LLM 最熟悉的语言</span>
</div>
<div class="stack-item">
<span class="stack-name">Bun</span>
<span class="stack-desc">极速构建与运行时</span>
</div>
<div class="stack-item">
<span class="stack-name">Ink</span>
<span class="stack-desc">React for CLI — 声明式终端 UI</span>
</div>
<div class="stack-item">
<span class="stack-name">Zustand</span>
<span class="stack-desc">轻量状态管理，细粒度订阅</span>
</div>
<div class="stack-item">
<span class="stack-name">OpenAI SDK</span>
<span class="stack-desc">兼容 OpenAI / DeepSeek / 本地模型</span>
</div>
<div class="stack-item">
<span class="stack-name">Zod</span>
<span class="stack-desc">运行时参数验证</span>
</div>
<div class="stack-item">
<span class="stack-name">MCP</span>
<span class="stack-desc">Model Context Protocol 外部工具集成</span>
</div>
<div class="stack-item">
<span class="stack-name">lowlight</span>
<span class="stack-desc">140+ 语言语法高亮</span>
</div>
</div>

## 📊 数据一览

<div class="stats-grid">
<div class="stat">
<span class="stat-number">17</span>
<span class="stat-label">章节</span>
</div>
<div class="stat">
<span class="stat-number">7</span>
<span class="stat-label">内置工具</span>
</div>
<div class="stat">
<span class="stat-number">7</span>
<span class="stat-label">管道阶段</span>
</div>
<div class="stat">
<span class="stat-number">11</span>
<span class="stat-label">Hook 事件</span>
</div>
<div class="stat">
<span class="stat-number">5</span>
<span class="stat-label">预设主题</span>
</div>
<div class="stat">
<span class="stat-number">MIT</span>
<span class="stat-label">开源协议</span>
</div>
</div>

<div style="margin-top: 3rem; display: flex; gap: 1rem; justify-content: center;">
  <a href="/ClawdCode/guide/" class="action-link">阅读教程 →</a>
  <a href="https://github.com/kkkhs/ClawdCode" class="action-link alt">查看源码 ↗</a>
</div>

</div>

<style>
:root {
  --vp-home-hero-name-color: transparent;
  --vp-home-hero-name-background: -webkit-linear-gradient(120deg, #a5b4fc 30%, #818cf8 70%);
  --vp-home-hero-image-background-image: linear-gradient(-45deg, #312e81 50%, #4338ca 50%);
  --vp-home-hero-image-filter: blur(44px);
}

.dark {
  --vp-home-hero-name-background: -webkit-linear-gradient(120deg, #c7d2fe 30%, #a5b4fc 70%);
  --vp-home-hero-image-background-image: linear-gradient(-45deg, #3730a3 50%, #6366f1 50%);
}

@media (min-width: 640px) {
  :root { --vp-home-hero-image-filter: blur(56px); }
}

@media (min-width: 960px) {
  :root { --vp-home-hero-image-filter: blur(68px); }
}

.custom-home {
  max-width: 780px;
  margin: 0 auto;
  padding: 2rem 1.5rem 4rem;
}

.custom-home h2 {
  font-family: 'SF Mono', 'Fira Code', monospace;
  letter-spacing: -0.02em;
  margin-top: 3rem;
}

.custom-home h3 {
  margin-top: 0;
  font-size: 1rem;
}

/* Capability grid */
.capability-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.75rem;
  margin-top: 1rem;
}

.capability {
  padding: 0.875rem 1rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  font-size: 0.875rem;
  line-height: 1.5;
}

.capability strong {
  color: var(--vp-c-brand-1);
}

/* Why grid */
.why-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1rem;
  margin-top: 1rem;
}

.why-item {
  padding: 1rem 1.25rem;
  border-left: 2px solid var(--vp-c-brand-1);
  background: var(--vp-c-bg-soft);
  border-radius: 0 8px 8px 0;
}

.why-item p {
  margin: 0.5rem 0 0;
  font-size: 0.875rem;
  color: var(--vp-c-text-2);
}

/* Stack grid */
.stack-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.5rem;
  margin-top: 1rem;
}

.stack-item {
  display: flex;
  flex-direction: column;
  padding: 0.75rem 1rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  transition: border-color 0.2s;
}

.stack-item:hover {
  border-color: var(--vp-c-brand-1);
}

.stack-name {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-weight: 600;
  font-size: 0.9375rem;
  color: var(--vp-c-text-1);
}

.stack-desc {
  font-size: 0.8125rem;
  color: var(--vp-c-text-3);
  margin-top: 0.125rem;
}

/* Stats grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: 0.75rem;
  margin-top: 1rem;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1rem 0.5rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
}

.stat-number {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--vp-c-brand-1);
  line-height: 1;
}

.stat-label {
  font-size: 0.75rem;
  color: var(--vp-c-text-3);
  margin-top: 0.375rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Action links */
.action-link {
  display: inline-block;
  padding: 0.5rem 1.25rem;
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 0.875rem;
  text-decoration: none;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  color: var(--vp-c-text-1);
  transition: border-color 0.2s, color 0.2s;
}

.action-link:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.action-link.alt {
  border-color: transparent;
  color: var(--vp-c-text-2);
}

.action-link.alt:hover {
  color: var(--vp-c-text-1);
}

:deep(.VPFeature .icon) {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 1.5rem;
}
</style>
