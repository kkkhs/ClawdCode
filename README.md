<p align="center">
  <img src="https://raw.githubusercontent.com/kkkhs/ClawdCode/main/docs-site/public/logo.svg" alt="ClawdCode Logo" width="120" height="120">
</p>

<h1 align="center">ClawdCode</h1>

<p align="center">
  <strong>An AI-Powered CLI Coding Agent</strong>
  <br>
  <em>Inspired by Claude Code — read, write, and execute code directly in your terminal.</em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/clawdcode"><img src="https://img.shields.io/npm/v/clawdcode?style=flat-square&color=CB3837&logo=npm" alt="npm version"></a>
  <a href="https://github.com/kkkhs/ClawdCode/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="license"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D18.0.0-339933?style=flat-square&logo=node.js" alt="node version"></a>
  <a href="https://bun.sh/"><img src="https://img.shields.io/badge/bun-runtime-f9f1e1?style=flat-square&logo=bun" alt="bun"></a>
  <a href="https://kkkhs.github.io/ClawdCode/"><img src="https://img.shields.io/badge/docs-tutorial-8B5CF6?style=flat-square&logo=bookstack" alt="documentation"></a>
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-installation">Installation</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#%EF%B8%8F-architecture">Architecture</a> •
  <a href="#-documentation">Documentation</a>
</p>

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 🤖 Intelligent Agent
- Agentic Loop: LLM + System Prompt + Context + Tools
- Streaming output with real-time response
- Thinking process with auto-collapse/expand
- Tool call display with compact dim-styled logs
- AbortController-based Ctrl+C interruption

</td>
<td width="50%">

### 🛠️ Built-in Tools (7)
- **Read / Write / Edit** — file operations with diff preview
- **Glob / Grep** — fast code search and pattern matching
- **Bash** — shell execution with permission control
- **MCP** — external tool integration via Model Context Protocol

</td>
</tr>
<tr>
<td width="50%">

### 🔒 Security & Permissions
- 4 permission modes: `default` / `autoEdit` / `yolo` / `plan`
- 7-stage execution pipeline with safety checks
- Inline permission prompt above input area
- Sensitive file detection (`.env`, credentials, etc.)
- Deny stops agent immediately — no continued thinking

</td>
<td width="50%">

### 🎨 Terminal UI
- Ink (React for CLI) — declarative interactive UI
- Markdown rendering with 140+ language syntax highlighting
- 5 built-in themes with auto dark/light detection
- Theme persistence across sessions
- Code block file paths and `/copy` clipboard support

</td>
</tr>
<tr>
<td width="50%">

### 🧩 Extensions
- **Slash Commands** — `/help`, `/compact`, `/model`, `/theme`, ...
- **Custom Commands** — Markdown files as commands, zero code
- **Skills** — pluggable agent capabilities via `SKILL.md`
- **Hooks** — 11 lifecycle events with pre/post shell scripts

</td>
<td width="50%">

### 📦 State & Context
- Zustand store with fine-grained subscriptions
- Token counting and auto-compaction
- Session persistence and resume (`--continue`)
- Command history with arrow key navigation
- MCP Registry for external tool servers

</td>
</tr>
</table>

## 📥 Installation

```bash
# npm
npm install -g clawdcode

# pnpm
pnpm add -g clawdcode

# bun (recommended)
bun add -g clawdcode
```

## 🚀 Quick Start

### 1. Configure API Key

```bash
# Interactive setup
clawdcode --init

# Or set environment variable
export OPENAI_API_KEY=sk-your-api-key

# Or use other OpenAI-compatible providers
export OPENAI_BASE_URL=https://api.deepseek.com
export OPENAI_API_KEY=sk-your-deepseek-key
```

### 2. Start Coding

```bash
# Interactive mode
clawdcode

# With initial message
clawdcode "analyze this project structure"

# With specific model
clawdcode --model gpt-4o

# Resume previous session
clawdcode --continue
```

### 3. Slash Commands

```
/help       Show all commands
/clear      Clear conversation
/compact    Compress context (save tokens)
/model      Switch model interactively
/theme      Switch theme (dark/light/ocean/forest/sunset)
/status     Show session info
/copy       Copy code block to clipboard (/copy list)
/thinking   Toggle thinking block expand/collapse
/mcp        MCP server status
/hooks      List active hooks
/skills     List loaded skills
```

## 🏗️ Architecture

```
Coding Agent = LLM + System Prompt + Context + Tools
```

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

## 📝 Custom Commands

Create project-specific commands in `.clawdcode/commands/` (shareable via Git):

**`.clawdcode/commands/review.md`**
```markdown
---
description: Code review for current changes
---

Review the current Git changes.

## Changes
!`git diff --stat HEAD~1`

## Requirements
1. Summarize what changed
2. Point out potential issues
3. Suggest improvements
```

**`.clawdcode/commands/test.md`**
```markdown
---
description: Run tests and analyze failures
argument-hint: [test file or pattern]
allowed-tools:
  - Bash(npm:*)
  - Read
---

Run tests: $ARGUMENTS

If any test fails, analyze the cause and suggest fixes.
```

Then use them:
```bash
/review              # Code review
/test src/utils      # Run specific tests
```

<details>
<summary><strong>Dynamic Content Syntax</strong></summary>

| Syntax | Description | Example |
|--------|-------------|---------|
| `$ARGUMENTS` | All arguments | `/cmd foo bar` → `foo bar` |
| `$1`, `$2` | Positional args | `/greet Alice` → `$1=Alice` |
| `` !`cmd` `` | Bash embed | `` !`git branch` `` |
| `@path` | File reference | `@package.json` |

</details>

## ⚙️ Configuration

ClawdCode supports multiple configuration methods (in priority order):

1. **CLI arguments** — `--api-key`, `--base-url`, `--model`
2. **Environment variables** — `OPENAI_API_KEY`, `OPENAI_BASE_URL`
3. **Project config** — `./.clawdcode/config.json`
4. **User config** — `~/.clawdcode/config.json`

<details>
<summary><strong>Config File Example</strong></summary>

```json
{
  "default": {
    "apiKey": "sk-your-api-key",
    "baseURL": "https://api.openai.com/v1",
    "model": "gpt-4o"
  },
  "ui": {
    "theme": "dark"
  },
  "permissions": {
    "allow": ["Bash(npm:*)", "Bash(git:*)"],
    "deny": ["Bash(rm -rf:*)"]
  },
  "mcpServers": {
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    }
  }
}
```

</details>

<details>
<summary><strong>Permission Modes</strong></summary>

| Mode | Read | Write | Execute | Description |
|------|:----:|:-----:|:-------:|-------------|
| `default` | ✅ | ❓ | ❓ | Ask for write/execute |
| `autoEdit` | ✅ | ✅ | ❓ | Auto-approve writes |
| `yolo` | ✅ | ✅ | ✅ | Full auto mode |
| `plan` | ✅ | ❌ | ❌ | Read-only analysis |

```bash
clawdcode --permission yolo "fix all lint errors automatically"
```

</details>

<details>
<summary><strong>Permission Rules</strong></summary>

```json
{
  "permissions": {
    "allow": [
      "Read(**/*.ts)",
      "Bash(npm:*)",
      "Bash(git:*)"
    ],
    "deny": [
      "Bash(rm -rf:*)",
      "Write(/etc/*)"
    ]
  }
}
```

Rule format: `ToolName(pattern)`
- Exact: `Bash(npm test)`
- Prefix: `Bash(npm:*)` → matches `npm install`, `npm test`, etc.
- Glob: `Read(**/*.ts)` → matches all TypeScript files

</details>

<details>
<summary><strong>Hooks</strong></summary>

Add lifecycle hooks in `.clawdcode/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": ["echo 'About to run shell command: $TOOL_INPUT'"]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": ["npx prettier --write $FILE_PATH"]
      }
    ],
    "Notification": [
      {
        "matcher": "",
        "hooks": ["terminal-notifier -message '$NOTIFICATION_MESSAGE'"]
      }
    ]
  }
}
```

11 hook events: `PreToolUse`, `PostToolUse`, `Stop`, `UserPromptSubmit`, `Notification`, etc.

</details>

## 💻 CLI Options

```
Usage: clawdcode [options] [message]

Options:
  --api-key, -k      OpenAI API key
  --base-url, -b     OpenAI API base URL
  --model, -m        Model to use (default: gpt-4o)
  --permission, -p   Permission mode (default/autoEdit/yolo/plan)
  --theme, -t        Color theme (dark/light/ocean/forest/sunset)
  --continue, -c     Resume previous session
  --debug, -d        Enable debug mode
  --init             Create default config file
  --help, -h         Show help
  --version, -v      Show version
```

## 🔧 Tech Stack

| Technology | Role |
|:-----------|:-----|
| **TypeScript** | Type safety, strict mode |
| **Bun** | Build & runtime |
| **Ink** | React for CLI — declarative terminal UI |
| **Zustand** | Lightweight state management |
| **OpenAI SDK** | Compatible with OpenAI / DeepSeek / local models |
| **Zod** | Runtime parameter validation |
| **MCP** | Model Context Protocol for external tools |
| **lowlight** | 140+ language syntax highlighting |

## 📖 Documentation

> 📚 **[Complete Tutorial — 17 Chapters](https://kkkhs.github.io/ClawdCode/)** — Build an AI CLI Coding Agent from scratch

| Part | Chapters | Topics |
|:-----|:---------|:-------|
| **Getting Started** | 01 - 03 | Coding Agent overview, project setup, CLI entry |
| **Core Architecture** | 04 - 07 | Agent core, system prompt, tool system, execution pipeline |
| **System Integration** | 08 - 12 | Context management, UI system, MCP protocol, state management, command history |
| **Extensions** | 13 - 17 | Slash commands, interactive commands, streaming & themes, skills, hooks |

## 💡 Examples

```bash
# Analyze project structure
clawdcode "analyze this project's architecture"

# Fix TypeScript errors
clawdcode "fix all TypeScript type errors"

# Code review (read-only mode)
clawdcode --permission plan "review the recent code changes"

# Full auto mode
clawdcode --permission yolo "format all files with prettier"

# Use DeepSeek
clawdcode --base-url https://api.deepseek.com --model deepseek-chat "refactor this function"
```

## 🛠 Development

```bash
# Clone
git clone https://github.com/kkkhs/ClawdCode.git
cd ClawdCode

# Install
bun install

# Dev
bun run dev

# Build
bun run build

# Type check
bun run typecheck
```

## 🤝 Contributing

Contributions welcome. Please submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feat/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feat/amazing-feature`)
5. Open a Pull Request

## 📄 License

[MIT](LICENSE) © 2024-present

---

<p align="center">
  <sub>Built with ❤️ by <a href="https://github.com/kkkhs">kkkhs</a></sub>
</p>

<p align="center">
  <a href="https://github.com/kkkhs/ClawdCode">
    <img src="https://img.shields.io/github/stars/kkkhs/ClawdCode?style=social" alt="GitHub stars">
  </a>
</p>
