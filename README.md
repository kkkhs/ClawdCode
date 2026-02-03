# ClawdCode

A CLI Coding Agent inspired by Claude Code - An AI-powered coding assistant that can read, write, and execute code directly in your terminal.

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

## Requirements

- Node.js >= 18.0.0
- OpenAI API key (or compatible API)

## License

MIT
