---
layout: home

hero:
  name: "ClawdCode"
  text: "Build your own AI Coding Agent"
  tagline: A deep-dive tutorial on building a CLI coding agent from scratch — open source, TypeScript, production-grade.
  image:
    src: /logo.svg
    alt: ClawdCode
  actions:
    - theme: brand
      text: Get Started
      link: /en/guide/
    - theme: alt
      text: GitHub
      link: https://github.com/kkkhs/ClawdCode

features:
  - icon: ">"
    title: Agent Loop
    details: "LLM + System Prompt + Context + Tools. Understand the core loop that powers coding agents like Claude Code."
    link: /en/guide/chapter-01
  - icon: "{}"
    title: Tool System
    details: "7-stage execution pipeline with permission control, hooks, and confirmation — build tools that are safe by default."
    link: /en/guide/chapter-07
  - icon: "$"
    title: Terminal UI
    details: "React-based CLI with Ink — Markdown rendering, syntax highlighting, themes, inline confirmation prompts."
    link: /en/guide/chapter-09
  - icon: "~"
    title: Extensible
    details: "MCP protocol, slash commands, skills, hooks — a plugin architecture designed for real-world use."
    link: /en/guide/chapter-10
---

<div class="vp-doc custom-home">

## Architecture

```
User ──▶ CLI ──▶ Agent Loop ──▶ LLM
                    │                │
                    │          tool_calls?
                    │           ↓ yes
                    │     ┌─────────────┐
                    │     │  Pipeline   │
                    │     │  discovery  │
                    │     │  permission │
                    │     │  hooks      │
                    │     │  confirm    │
                    │     │  execute    │
                    │     │  format     │
                    │     └─────┬───────┘
                    │           │
                    └───────────┘  inject results, continue
```

## Quick Start

```bash
npm install -g clawdcode
export OPENAI_API_KEY=sk-...
clawdcode "analyze this project"
```

## Tech Stack

```
TypeScript · Bun · Ink (React for CLI) · Zustand · OpenAI SDK · Zod · MCP
```

<div style="margin-top: 2rem; display: flex; gap: 1rem;">
  <a href="/ClawdCode/en/guide/" class="action-link">Read the Guide →</a>
  <a href="https://github.com/kkkhs/ClawdCode" class="action-link alt">View Source ↗</a>
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
  max-width: 720px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
}

.custom-home h2 {
  font-family: 'SF Mono', 'Fira Code', monospace;
  letter-spacing: -0.02em;
}

.action-link {
  display: inline-block;
  padding: 0.5rem 1rem;
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
