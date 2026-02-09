---
layout: home

hero:
  name: "ClawdCode"
  text: "Build your own AI Coding Agent"
  tagline: "Inspired by Claude Code's architecture. From first principles to production. 17 chapters, fully open source."
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
    title: Agentic Loop
    details: "Understand the LLM + System Prompt + Context + Tools loop — the same design pattern behind Claude Code and Cursor."
    link: /en/guide/chapter-01
  - icon: "{}"
    title: 7-Stage Pipeline
    details: "Discovery → Permission → Hooks → Confirm → Execute → PostHook → Format. Safety-first tool execution."
    link: /en/guide/chapter-07
  - icon: "$"
    title: Terminal UI
    details: "Powered by Ink (React for CLI) — Markdown rendering, 140+ language syntax highlighting, themes, streaming."
    link: /en/guide/chapter-09
  - icon: "|"
    title: Permission & Security
    details: "4 permission modes, sensitive file detection, inline confirmation, deny-stops-agent. Never trust a single LLM action."
    link: /en/guide/chapter-07
  - icon: "+"
    title: MCP Protocol
    details: "Model Context Protocol integration — dynamically discover external tools and data sources."
    link: /en/guide/chapter-10
  - icon: "~"
    title: Plugin Architecture
    details: "Slash commands, skills, hooks, custom commands — extend agent behavior with a Markdown file, zero code needed."
    link: /en/guide/chapter-13
---

<div class="vp-doc custom-home">

## 🔨 What You'll Build

A fully functional CLI coding agent with these capabilities:

<div class="capability-grid">
<div class="capability">

🤖 **Smart Conversations** — Multi-turn chat via OpenAI-compatible APIs with thinking display and auto-collapse

</div>
<div class="capability">

📂 **File Operations** — Read, write, edit, search, glob — the agent autonomously operates on your codebase

</div>
<div class="capability">

⚡ **Command Execution** — Shell command execution with permission control and user confirmation

</div>
<div class="capability">

🧠 **Context Management** — Token counting, auto-compaction, session persistence — break through context window limits

</div>
<div class="capability">

🎨 **Interactive UI** — Syntax highlighting, Markdown rendering, themes, command completion, code block copy

</div>
<div class="capability">

🧩 **Extensible Architecture** — MCP protocol, custom commands, hooks system — designed for real-world use

</div>
</div>

## 🏗️ Architecture

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

## 💡 Why This Tutorial

<div class="why-grid">
<div class="why-item">

### 🔬 Claude Code Reference

Not a toy project. Architecture modeled after Anthropic's Claude Code — permission system, hooks, MCP integration.

</div>
<div class="why-item">

### 📖 17 Progressive Chapters

From Hello World to a complete agent. Every chapter has runnable code. Understand why every line exists.

</div>
<div class="why-item">

### ✅ Production Quality

TypeScript strict mode, Zod runtime validation, complete error handling, AbortController cancellation.

</div>
<div class="why-item">

### 📦 Ready to Use

`npm install -g clawdcode` and go. Not just a tutorial — it's a working coding agent you can use today.

</div>
</div>

## 🚀 Quick Start

```bash
# Install
npm install -g clawdcode

# Configure
export OPENAI_API_KEY=sk-...

# Use
clawdcode "analyze the architecture of this project"
```

## 🔧 Tech Stack

<div class="stack-grid">
<div class="stack-item">
<span class="stack-name">TypeScript</span>
<span class="stack-desc">Type safety, LLM's most familiar language</span>
</div>
<div class="stack-item">
<span class="stack-name">Bun</span>
<span class="stack-desc">Ultra-fast build and runtime</span>
</div>
<div class="stack-item">
<span class="stack-name">Ink</span>
<span class="stack-desc">React for CLI — declarative terminal UI</span>
</div>
<div class="stack-item">
<span class="stack-name">Zustand</span>
<span class="stack-desc">Lightweight state with fine-grained subscriptions</span>
</div>
<div class="stack-item">
<span class="stack-name">OpenAI SDK</span>
<span class="stack-desc">Compatible with OpenAI / DeepSeek / local models</span>
</div>
<div class="stack-item">
<span class="stack-name">Zod</span>
<span class="stack-desc">Runtime parameter validation</span>
</div>
<div class="stack-item">
<span class="stack-name">MCP</span>
<span class="stack-desc">Model Context Protocol for external tools</span>
</div>
<div class="stack-item">
<span class="stack-name">lowlight</span>
<span class="stack-desc">140+ language syntax highlighting</span>
</div>
</div>

## 📊 By the Numbers

<div class="stats-grid">
<div class="stat">
<span class="stat-number">17</span>
<span class="stat-label">Chapters</span>
</div>
<div class="stat">
<span class="stat-number">7</span>
<span class="stat-label">Built-in Tools</span>
</div>
<div class="stat">
<span class="stat-number">7</span>
<span class="stat-label">Pipeline Stages</span>
</div>
<div class="stat">
<span class="stat-number">11</span>
<span class="stat-label">Hook Events</span>
</div>
<div class="stat">
<span class="stat-number">5</span>
<span class="stat-label">Themes</span>
</div>
<div class="stat">
<span class="stat-number">MIT</span>
<span class="stat-label">License</span>
</div>
</div>

<div style="margin-top: 3rem; display: flex; gap: 1rem; justify-content: center;">
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
