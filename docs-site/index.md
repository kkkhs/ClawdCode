---
layout: home

hero:
  name: "ClawdCode"
  text: "从零实现 AI Coding Agent"
  tagline: 深入理解 Coding Agent 的设计原理，一步步构建你自己的 AI 编程助手
  image:
    src: /logo.svg
    alt: ClawdCode
  actions:
    - theme: brand
      text: 🚀 开始学习
      link: /guide/
    - theme: alt
      text: 📦 npm install
      link: https://www.npmjs.com/package/clawdcode
    - theme: alt
      text: GitHub
      link: https://github.com/kkkhs/ClawdCode

features:
  - icon: 🧠
    title: 理解核心概念
    details: 深入理解 Coding Agent = LLM + System Prompt + Context + Tools 的设计哲学，掌握 Agentic Loop 工作原理
    link: /guide/chapter-01
    linkText: 了解更多
  - icon: 🔧
    title: 动手实践
    details: 每一章都有完整可运行的代码，边学边做，循序渐进，从 Hello World 到完整 Agent
    link: /guide/chapter-02
    linkText: 开始搭建
  - icon: 🏗️
    title: 工业级架构
    details: 参考 Claude Code 设计，学习无状态 Agent、七阶段执行管道、权限控制等最佳实践
    link: /guide/chapter-07
    linkText: 查看架构
  - icon: 🎨
    title: 现代化 UI
    details: 使用 Ink (React for CLI) 构建精美的终端界面，支持主题切换、Markdown 渲染、代码高亮
    link: /guide/chapter-09
    linkText: 探索 UI
  - icon: 🔌
    title: MCP 协议
    details: 集成 Model Context Protocol，连接外部工具和数据源，无限扩展 Agent 能力
    link: /guide/chapter-10
    linkText: 学习 MCP
  - icon: 📦
    title: 开箱即用
    details: TypeScript + Bun + Ink + Zustand + OpenAI SDK，现代化技术栈，完整的类型支持
    link: /guide/
    linkText: 查看技术栈
---

<div class="vp-doc" style="padding: 2rem 1.5rem;">

## 📚 教程目录

<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; margin-top: 1.5rem;">

<div style="border: 1px solid var(--vp-c-divider); border-radius: 8px; padding: 1rem;">

### 🌱 基础篇

| 章节 | 内容 |
|:-----|:-----|
| [第 1 章](/guide/chapter-01) | Coding Agent 概述 |
| [第 2 章](/guide/chapter-02) | 项目搭建 |
| [第 3 章](/guide/chapter-03) | CLI 入口与配置 |

</div>

<div style="border: 1px solid var(--vp-c-divider); border-radius: 8px; padding: 1rem;">

### ⚡ 核心篇

| 章节 | 内容 |
|:-----|:-----|
| [第 4 章](/guide/chapter-04) | Agent 核心 |
| [第 5 章](/guide/chapter-05) | System Prompt |
| [第 6 章](/guide/chapter-06) | 工具系统 |
| [第 7 章](/guide/chapter-07) | 执行管道 |
| [第 8 章](/guide/chapter-08) | 上下文管理 |

</div>

<div style="border: 1px solid var(--vp-c-divider); border-radius: 8px; padding: 1rem;">

### 🚀 进阶篇

| 章节 | 内容 |
|:-----|:-----|
| [第 9 章](/guide/chapter-09) | UI 系统 |
| [第 10 章](/guide/chapter-10) | MCP 协议 |
| [第 11 章](/guide/chapter-11) | 状态管理 |
| [第 12a 章](/guide/chapter-12a) | Slash Commands |

</div>

</div>

## 🎯 核心架构

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│    Coding Agent = LLM + System Prompt + Context + Tools         │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│    User Input ──▶ Build Context ──▶ Call LLM ──▶ Response      │
│                                          │                      │
│                                     Tool Calls?                 │
│                                     ↓ Yes    ↓ No               │
│                              Execute Tools   Return             │
│                                     │                           │
│                              Inject Results ──▶ Continue Loop   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## ⚡ 快速开始

```bash
# 安装
npm install -g clawdcode

# 配置
export OPENAI_API_KEY=sk-your-api-key

# 启动
clawdcode "帮我分析这个项目"
```

<div style="display: flex; gap: 1rem; margin-top: 1.5rem; flex-wrap: wrap;">
  <a href="/guide/" class="action-button brand">📖 阅读教程</a>
  <a href="https://github.com/kkkhs/ClawdCode" class="action-button alt">⭐ Star on GitHub</a>
</div>

</div>

<style>
:root {
  --vp-home-hero-name-color: transparent;
  --vp-home-hero-name-background: -webkit-linear-gradient(120deg, #6366f1 30%, #8b5cf6);
  --vp-home-hero-image-background-image: linear-gradient(-45deg, #6366f1 50%, #8b5cf6 50%);
  --vp-home-hero-image-filter: blur(44px);
}

.dark {
  --vp-home-hero-image-background-image: linear-gradient(-45deg, #6366f1 50%, #a855f7 50%);
}

@media (min-width: 640px) {
  :root {
    --vp-home-hero-image-filter: blur(56px);
  }
}

@media (min-width: 960px) {
  :root {
    --vp-home-hero-image-filter: blur(68px);
  }
}

.action-button {
  display: inline-block;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.2s;
}

.action-button.brand {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: white;
}

.action-button.brand:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
}

.action-button.alt {
  border: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-1);
}

.action-button.alt:hover {
  border-color: var(--vp-c-brand);
  color: var(--vp-c-brand);
}
</style>
