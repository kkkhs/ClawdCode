<p align="center">
  <img src="https://raw.githubusercontent.com/kkkhs/ClawdCode/main/docs-site/public/logo.svg" alt="ClawdCode Logo" width="120" height="120">
</p>

<h1 align="center">
  <span style="font-size: 2em;">🦀</span> ClawdCode
</h1>

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
  <a href="#-documentation">Documentation</a> •
  <a href="#-configuration">Configuration</a>
</p>

---

<!--
<p align="center">
  <img src="https://raw.githubusercontent.com/kkkhs/ClawdCode/main/docs-site/public/demo.gif" alt="ClawdCode Demo" width="700">
</p>
-->

## ✨ Features

<table>
<tr>
<td width="50%">

### 🤖 Intelligent Agent
- Natural language interface for coding tasks
- Context-aware project understanding
- Agentic Loop with tool execution

</td>
<td width="50%">

### 🛠️ Powerful Tools
- **File Operations** - Read, write, and edit files
- **Code Search** - Glob and Grep integration  
- **Command Execution** - Safe shell operations

</td>
</tr>
<tr>
<td width="50%">

### 🔒 Security First
- Fine-grained permission control
- User confirmation for write operations
- Configurable allow/deny rules

</td>
<td width="50%">

### 🎨 Beautiful CLI
- Ink-powered interactive UI
- Markdown rendering & code highlighting
- Multiple themes support

</td>
</tr>
</table>

## 📦 Installation

```bash
# npm
npm install -g clawdcode

# yarn
yarn global add clawdcode

# pnpm
pnpm add -g clawdcode

# bun (recommended)
bun add -g clawdcode
```

## 🚀 Quick Start

### 1️⃣ Configure API Key

```bash
# Interactive setup
clawdcode --init

# Or set environment variable
export OPENAI_API_KEY=sk-your-api-key
```

### 2️⃣ Start Coding

```bash
# Interactive mode
clawdcode

# With initial message
clawdcode "帮我分析这个项目的结构"

# With specific model
clawdcode --model gpt-4
```

### 3️⃣ Use Slash Commands

```bash
/help      # Show all commands
/clear     # Clear conversation
/theme     # Switch theme
/status    # Show session status
/mcp       # MCP server status
```

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
| | 11 | State Management |
| | 12a | Slash Commands |

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
    "model": "gpt-4"
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
  --api-key          OpenAI API key
  --base-url         OpenAI API base URL
  --model            Model to use (default: gpt-4)
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

# Resume previous session
clawdcode --continue

# Debug mode
clawdcode --debug "为什么这个测试失败了"
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

### Release & Publish

This project uses [release-please](https://github.com/google-github-actions/release-please-action) for automated releases.

**Commit Convention:**
- `feat:` → minor version
- `fix:` → patch version
- `feat!:` or `BREAKING CHANGE` → major version

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
