<p align="center">
  <img src="https://raw.githubusercontent.com/kkkhs/ClawdCode/main/docs-site/public/logo.svg" alt="ClawdCode Logo" width="120" height="120">
</p>

<h1 align="center">ClawdCode</h1>

<p align="center">
  <strong>An AI-Powered CLI Coding Agent</strong>
  <br>
  <em>Your intelligent coding companion that reads, writes, and executes code directly in your terminal.</em>
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
  <a href="#-custom-commands">Custom Commands</a> •
  <a href="#-documentation">Documentation</a>
</p>

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 🤖 Intelligent Agent
- Natural language interface for coding tasks
- **Streaming output** with real-time response
- **Thinking process** with auto-collapse/expand
- **Tool call display** with compact dim-styled logs
- Context-aware project understanding

</td>
<td width="50%">

### 🛠️ Powerful Tools
- **File Operations** - Read, write, and edit files
- **Code Search** - Glob and Grep integration  
- **Command Execution** - Safe shell operations
- **MCP Protocol** - Extensible tool ecosystem
- **Code block paths** - File paths in code fences

</td>
</tr>
<tr>
<td width="50%">

### 🔒 Security First
- **Inline permission prompt** above input area
- User confirmation for write/execute operations
- Configurable allow/deny rules
- **Deny stops agent** - no continued thinking
- Multiple permission modes

</td>
<td width="50%">

### 🎨 Beautiful CLI
- Ink-powered interactive UI
- Markdown rendering & syntax highlighting
- **Auto theme detection** (dark/light terminal)
- **Theme persistence** across sessions
- **`/copy` command** - Copy code blocks to clipboard

</td>
</tr>
</table>

## 📦 Installation

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
clawdcode "分析这个项目的结构"

# With specific model
clawdcode --model gpt-4o

# Resume previous session
clawdcode --continue
```

### 3. Use Slash Commands

```
/help      Show all commands
/clear     Clear conversation
/compact   Compress context (save tokens)
/theme     Switch theme (dark/light/ocean/...)
/status    Show session status
/mcp       MCP server status
/copy      Copy code block to clipboard (/copy list)
/thinking  Toggle thinking blocks expand/collapse
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

## 📖 Documentation

> 📚 **[Complete Tutorial](https://kkkhs.github.io/ClawdCode/)** - Build an AI CLI Coding Agent from scratch

<details>
<summary><strong>📗 Tutorial Chapters</strong></summary>

| Part | Chapter | Topic |
|------|---------|-------|
| **Basics** | 1 | Coding Agent Overview |
| | 2 | Project Setup |
| | 3 | CLI Entry & Config |
| **Core** | 4 | Agent Core & Agentic Loop |
| | 5 | System Prompt Design |
| | 6 | Tool System |
| | 7 | Execution Pipeline |
| | 8 | Context Management |
| **Advanced** | 9 | UI System (Ink) |
| | 10 | MCP Protocol |
| | 11 | State Management (Zustand) |
| | 12a | Slash Commands |
| | 12b | Interactive Selectors |
| | 12c | Streaming & Theme Persistence |

</details>

## ⚙️ Configuration

ClawdCode supports multiple configuration methods (in priority order):

1. **CLI arguments** - `--api-key`, `--base-url`, `--model`
2. **Environment variables** - `OPENAI_API_KEY`, `OPENAI_BASE_URL`
3. **Project config** - `./.clawdcode/config.json`
4. **User config** - `~/.clawdcode/config.json`

<details>
<summary><strong>📝 Config File Example</strong></summary>

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
<summary><strong>🔐 Permission Modes</strong></summary>

| Mode | Read | Write | Execute | Description |
|------|:----:|:-----:|:-------:|-------------|
| `default` | ✅ | ❓ | ❓ | Ask for write/execute |
| `autoEdit` | ✅ | ✅ | ❓ | Auto-approve writes |
| `yolo` | ✅ | ✅ | ✅ | Full auto mode |
| `plan` | ✅ | ❌ | ❌ | Read-only analysis |

```bash
clawdcode --permission yolo "自动修复所有 lint 错误"
```

</details>

<details>
<summary><strong>📋 Permission Rules</strong></summary>

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

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Coding Agent = LLM + Tools               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   User Input ──▶ Build Context ──▶ Call LLM ──▶ Response   │
│                                        │                    │
│                                   Tool Calls?               │
│                                   ↓ Yes    ↓ No             │
│                            Execute Tools   Return           │
│                                   │                         │
│                            Inject Results ──▶ Continue      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 🛠️ CLI Options

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

## 💡 Examples

```bash
# Analyze project structure
clawdcode "分析这个项目的结构"

# Fix TypeScript errors
clawdcode "帮我修复 TypeScript 类型错误"

# Create a new feature
clawdcode "添加一个用户登录功能"

# Code review with auto-read permission
clawdcode --permission plan "review 最近的代码改动"

# Use DeepSeek for cost-effective coding
clawdcode --base-url https://api.deepseek.com --model deepseek-chat "重构这个函数"
```

## 🔧 Development

```bash
# Clone the repository
git clone https://github.com/kkkhs/ClawdCode.git
cd ClawdCode

# Install dependencies
bun install

# Run in development mode
bun run dev

# Build
bun run build

# Type check
bun run typecheck
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

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
