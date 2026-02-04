# ClawdCode

A CLI Coding Agent inspired by Claude Code - An AI-powered coding assistant that can read, write, and execute code directly in your terminal.

> 📚 **[查看完整教程文档](https://kkkhs.github.io/ClawdCode/)** - 从零开始实现一个 AI CLI Coding Agent

## Features

- **Interactive CLI** - Natural language interface for coding tasks
- **File Operations** - Read, write, and edit files automatically
- **Code Search** - Find files and search code with Glob and Grep
- **Command Execution** - Run shell commands safely
- **Context Aware** - Understands your project structure
- **Permission Control** - Safe execution with user confirmation for write operations

## Installation

```bash
npm install -g clawdcode
```

Or using other package managers:

```bash
# yarn
yarn global add clawdcode

# pnpm
pnpm add -g clawdcode

# bun
bun add -g clawdcode
```

## Quick Start

### 1. Configure API Key

Create a config file:

```bash
clawdcode --init
```

Or set environment variable:

```bash
export OPENAI_API_KEY=sk-your-api-key
```

### 2. Start Using

```bash
# Start interactive mode
clawdcode

# Start with an initial message
clawdcode "帮我分析这个项目"

# Use a specific model
clawdcode --model gpt-4
```

## Configuration

ClawdCode supports multiple configuration methods (in priority order):

1. **CLI arguments** - `--api-key`, `--base-url`, `--model`
2. **Environment variables** - `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`
3. **Project config** - `./.clawdcode/config.json`
4. **User config** - `~/.clawdcode/config.json`

### Config File Example

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
  "defaultPermissionMode": "default"
}
```

### Permission Modes

| Mode | Read | Write | Execute |
|------|------|-------|---------|
| `default` | ✅ Auto | ❓ Ask | ❓ Ask |
| `autoEdit` | ✅ Auto | ✅ Auto | ❓ Ask |
| `yolo` | ✅ Auto | ✅ Auto | ✅ Auto |
| `plan` | ✅ Auto | ❌ Deny | ❌ Deny |

### Permission Rules

```json
{
  "permissions": {
    "allow": [
      "Read(**/*.ts)",
      "Bash(npm:*)"
    ],
    "deny": [
      "Bash(rm -rf:*)",
      "Write(/etc/*)"
    ]
  }
}
```

Rule format: `ToolName(pattern)` where pattern supports:
- Exact match: `Bash(npm test)`
- Prefix wildcard: `Bash(npm:*)` matches `npm install`, `npm test`, etc.
- Glob pattern: `Read(**/*.ts)` matches all TypeScript files

## Usage

### CLI Options

```
Options:
  --api-key        OpenAI API key
  --base-url       OpenAI API base URL
  --model          Model to use (default: gpt-4)
  --debug, -d      Enable debug mode
  --init           Create default config file
  --help, -h       Show help
  --version, -v    Show version
```

### Examples

```bash
# Analyze project structure
clawdcode "分析这个项目的结构"

# Fix TypeScript errors
clawdcode "帮我修复 TypeScript 类型错误"

# Create a new feature
clawdcode "添加一个用户登录功能"

# Debug mode
clawdcode --debug "为什么这个测试失败了"
```

## Architecture

```
Coding Agent = LLM + System Prompt + Context + Tools
```

ClawdCode follows the Agentic Loop pattern:

```
User Input → Build Messages → Call LLM → Tool Calls?
                                            ↓ Yes
                                      Execute Tools → Inject Results → Continue Loop
                                            ↓ No
                                      Return Response (Task Complete)
```

## Documentation

📚 **[完整教程文档](https://kkkhs.github.io/ClawdCode/)** - 从零开始实现一个 AI CLI Coding Agent

### 教程目录

| 章节 | 内容 |
|------|------|
| **基础篇** | |
| 第 1 章 | Coding Agent 概述 - 理解 AI Agent 架构 |
| 第 2 章 | 项目搭建 - 技术栈选择与环境配置 |
| 第 3 章 | CLI 入口 - yargs、配置管理、版本检查 |
| **核心篇** | |
| 第 4 章 | Agent 核心 - 无状态设计与 Agentic Loop |
| 第 5 章 | System Prompt - 四层提示词架构 |
| 第 6 章 | 工具系统 - 工具定义、注册与执行 |
| 第 7 章 | 执行管道 - 七阶段执行流程与权限控制 |
| 第 8 章 | 上下文管理 - Token 计数与智能压缩 |
| **进阶篇** | |
| 第 9 章 | UI 系统 - Ink 组件与交互设计 |
| 第 10 章 | MCP 协议 - 外部工具集成 |

## Requirements

- Node.js >= 18.0.0
- OpenAI API key (or compatible API)

## Development

### Release & Publish

项目使用 [release-please](https://github.com/google-github-actions/release-please-action) 自动管理版本和发布。

**Commit 规范（Conventional Commits）：**
- `feat:` 新功能 → minor 版本
- `fix:` 修复 → patch 版本  
- `feat!:` 或 `BREAKING CHANGE` → major 版本
- `docs:` / `chore:` / `refactor:` → 不触发版本更新

**配置 GitHub Secrets：**

| Secret | 用途 | 获取方式 |
|--------|------|----------|
| `RELEASE_TOKEN` | release-please 创建 Release | GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens，权限：Contents (R/W)、Pull requests (R/W) |
| `NPM_TOKEN` | 发布到 npm | npm → Access Tokens → Granular Access Token，勾选 Read and write |

**发布流程：**
```
Push to main → release-please 创建 PR → 合并 PR → 创建 GitHub Release → 自动 npm publish
```

## License

MIT
