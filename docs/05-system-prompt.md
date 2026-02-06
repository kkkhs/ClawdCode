# 第五章：System Prompt 设计与实现

> System Prompt（系统提示词）是 Coding Agent 的"灵魂"，定义了 Agent 的身份、能力边界、行为准则和输出风格。

## 5.1 提示词工程概述

### 5.1.1 什么是提示词工程

提示词工程是设计和优化 LLM 输入的过程，目标是让模型产生期望的输出：

| 问题 | 提示词解决方案 |
|------|----------------|
| Agent 是谁？ | 身份定义 |
| 能做什么？不能做什么？ | 安全边界 |
| 如何输出？ | 风格约束 |
| 如何使用工具？ | 工具策略 |
| 如何处理复杂任务？ | 任务管理 |

### 5.1.2 Claude Code 的设计理念

> 更少的规定性指导，更多地信任模型的判断力。

**主要特点**：
- 40+ 个模块化提示词，动态组合
- 12 个章节结构化管理
- "short and concise" 灵活输出约束

## 5.2 提示词架构

### 5.2.1 四层架构

```
┌─────────────────────────────────────┐
│  1. 环境上下文 (动态生成)            │
│     - 工作目录、平台、日期           │
├─────────────────────────────────────┤
│  2. 基础提示词 (DEFAULT_SYSTEM_PROMPT)│
│     - 身份、安全、风格、工具策略      │
├─────────────────────────────────────┤
│  3. 项目配置 (CLAWDCODE.md)          │
│     - 项目特定的约定和命令            │
├─────────────────────────────────────┤
│  4. 追加内容 (用户自定义)             │
│     - 临时指令                       │
└─────────────────────────────────────┘
```

**设计要点**：
- **固定顺序**：环境 → 基础 → 项目 → 追加，确保优先级清晰
- **来源追踪**：`sources` 数组记录每部分的加载状态
- **项目配置独立**：即使使用 `replaceDefault`，项目配置仍然加载

### 5.2.2 提示词构建器

```typescript
export async function buildSystemPrompt(
  options: BuildSystemPromptOptions = {}
): Promise<BuildSystemPromptResult> {
  const parts: string[] = [];
  const sources: PromptSource[] = [];

  // 1. 环境上下文（始终在最前面）
  if (options.includeEnvironment !== false) {
    const envContext = getEnvironmentContext();
    parts.push(envContext);
  }

  // 2. 基础提示词（Plan 模式使用独立 prompt）
  const basePrompt = options.mode === 'plan'
    ? PLAN_MODE_SYSTEM_PROMPT
    : (options.replaceDefault ?? DEFAULT_SYSTEM_PROMPT);
  parts.push(basePrompt);

  // 3. 项目配置（CLAWDCODE.md）
  const projectConfig = await loadProjectConfig(options.projectPath);
  if (projectConfig) {
    parts.push(projectConfig);
  }

  // 4. 追加内容
  if (options.append) {
    parts.push(options.append);
  }

  return { prompt: parts.join('\n\n---\n\n'), sources };
}
```

## 5.3 主系统提示词

### 5.3.1 结构概览

`DEFAULT_SYSTEM_PROMPT` 包含以下部分：

1. **身份定义** - Agent 是谁
2. **安全边界** - 允许和禁止的操作
3. **输出风格** - 4 行原则
4. **执行效率** - 行动优于叙述
5. **语言要求** - 中文响应
6. **工具使用** - 并行调用策略
7. **代码引用** - 格式规范
8. **代码块格式** - `language:filepath` 路径标注

### 5.3.2 身份定义与安全边界

```typescript
export const DEFAULT_SYSTEM_PROMPT = `You are ClawdCode, an interactive CLI tool that helps users with software engineering tasks.

IMPORTANT: Assist with authorized security testing, defensive security, CTF challenges, and educational contexts. Refuse requests for destructive techniques, DoS attacks, mass targeting, supply chain compromise, or detection evasion for malicious purposes.

IMPORTANT: You must NEVER generate or guess URLs for the user unless you are confident that the URLs are for helping the user with programming.
`;
```

### 5.3.3 输出风格（4 行原则）

```typescript
# Tone and style
- Minimize output tokens. Respond in fewer than 4 lines for most cases
- Only go beyond 4 lines when:
  * User explicitly requests detailed explanation
  * Generating actual code
  * Complex debugging that requires step-by-step analysis
- Only use emojis if the user explicitly requests it
- NEVER create files unless absolutely necessary
- ALWAYS prefer editing an existing file to creating a new one
```

### 5.3.4 执行效率

```typescript
# Execution Efficiency

Action over narration. Execute tools directly without explaining each step.

<example-bad>
User: Read the package.json file
Assistant: I'll read the package.json file for you.
[Read tool call]
</example-bad>

<example-good>
User: Read the package.json file
Assistant: [Read tool call]
</example-good>
```

## 5.4 环境上下文

### 5.4.1 动态生成

环境上下文在每次构建系统提示时重新生成：

```typescript
export function getEnvironmentContext(): string {
  return `# Environment Context

## Working Directory
**Current**: \`${process.cwd()}\`

## System Information
- **Platform**: ${process.platform}
- **Node.js**: ${process.version}
- **Date**: ${new Date().toLocaleDateString()}

## File Path Guidelines
When using file tools, provide **absolute paths**:
- ✅ Correct: \`${process.cwd()}/package.json\`
- ❌ Incorrect: \`package.json\` (relative path)`;
}
```

### 5.4.2 包含的信息

| 信息 | 用途 |
|------|------|
| 工作目录 | 文件路径解析 |
| 平台 | 系统特定命令 |
| Node.js 版本 | 兼容性检查 |
| 当前日期 | 时间敏感操作 |

## 5.5 Plan 模式提示词

### 5.5.1 三层防护机制

```
第一层：PLAN_MODE_SYSTEM_PROMPT（系统级）
    ↓
第二层：createPlanModeReminder()（消息级，每轮注入）
    ↓
第三层：权限系统（自动拒绝写工具）
```

### 5.5.2 Plan 模式系统提示词

```typescript
export const PLAN_MODE_SYSTEM_PROMPT = `You are in **PLAN MODE** - a read-only research phase.

## Core Objective
Research the codebase thoroughly, then create a detailed implementation plan.
No file modifications allowed until plan is approved.

## Key Constraints
1. **Read-only tools only**: File readers, search tools
2. **Write tools prohibited**: Auto-denied by permission system
3. **Text output required**: Never call 3+ tools without explaining findings

## Plan Format
1. **Summary** - What and why
2. **Current State** - Relevant existing code
3. **Steps** - Detailed implementation steps
4. **Testing** - How to verify changes
5. **Risks** - Potential issues
`;
```

### 5.5.3 消息级提示注入

```typescript
export function createPlanModeReminder(userMessage: string): string {
  return (
    `<system-reminder>Plan mode is active. You MUST NOT make any file changes ` +
    `or run non-readonly tools.</system-reminder>\n\n` +
    userMessage
  );
}
```

## 5.6 代码块文件路径指令

系统提示词中包含一段指令，要求 AI 在展示项目代码时使用 `language:filepath` 格式：

```typescript
// 在 DEFAULT_SYSTEM_PROMPT 中
`# Code block formatting

When showing code from the project, ALWAYS include the file path in the code fence:

\`\`\`language:relative/path/to/file
code here
\`\`\`

Examples:
- \`\`\`typescript:src/utils/helper.ts
- \`\`\`python:scripts/deploy.py

Use paths relative to the project root.
Only use plain \`\`\`language when the code is a standalone snippet not tied to any file.`
```

**作用**：配合 Markdown 解析器的 `parseCodeBlockSpec` 函数，UI 层自动提取文件路径并在代码块头部展示。

## 5.7 项目配置文件

### 5.7.1 CLAWDCODE.md

项目级配置文件，追加到系统提示词末尾：

```markdown
# CLAWDCODE.md

## 常用命令
- `bun run build` - 构建项目
- `bun run test` - 运行测试

## 代码风格
- 使用单引号、分号
- 缩进 2 空格

## 项目结构
src/
├── agent/     # Agent 核心
├── tools/     # 工具系统
└── ui/        # UI 组件

## 重要约定
- 所有 API 响应使用 camelCase
```

## 5.8 测试方法

### 运行提示词系统测试

```bash
bun run test:prompts
```

**预期输出**：

```
=== 提示词系统测试 ===

1. 环境信息:
   工作目录: /path/to/project
   平台: darwin 24.6.0
   日期: 2026年2月3日 星期二

2. 环境上下文 (前 300 字符):
   # Environment Context...

3. 默认提示词长度: 3574 字符
   包含关键词:
   - ClawdCode: ✅
   - 4 lines: ✅
   - Chinese: ✅

...

=== 测试完成 ===
```

### 测试项说明

| 测试项 | 验证内容 |
|--------|----------|
| 环境信息 | 动态获取工作目录、平台、日期 |
| 环境上下文 | 生成格式正确的环境提示词 |
| 默认提示词 | 包含身份、安全、风格关键词 |
| Plan 模式提示词 | 包含只读约束关键词 |
| 消息注入 | `<system-reminder>` 正确包裹 |
| 完整构建 | 四层架构正确组装 |

---

## 5.9 本章实现

1. **默认系统提示词** (`src/prompts/default.ts`)
   - 身份定义、安全边界、输出风格
   - 执行效率、语言要求

2. **Plan 模式提示词** (`src/prompts/plan.ts`)
   - 只读研究模式
   - 消息注入函数

3. **提示词构建器** (`src/prompts/builder.ts`)
   - 四层架构组装
   - 来源追踪

4. **环境上下文** (`src/utils/environment.ts`)
   - 动态生成系统信息

---

## 技术亮点

### 1. 四层分离架构

```typescript
// 环境（动态）→ 基础（固定）→ 项目（可选）→ 追加（临时）
const prompt = parts.join('\n\n---\n\n');
```

**为什么**：职责分离，便于调试和定制。

### 2. 4 行原则硬性约束

```
Respond in fewer than 4 lines for most cases
```

**为什么**：CLI 环境下，简洁输出提升交互效率。

### 3. 示例驱动的指导

```xml
<example-bad>...</example-bad>
<example-good>...</example-good>
```

**为什么**：示例比文字描述更清晰，LLM 更容易理解。

### 4. Plan 模式三层防护

```
System Prompt + Message Reminder + Permission System
```

**为什么**：关键约束多层冗余，防止 LLM "忘记"。

### 5. 动态环境上下文

```typescript
// 每次构建时重新生成，确保日期、路径准确
const envContext = getEnvironmentContext();
```

**为什么**：静态提示词会导致日期过期、路径错误。

### 6. 来源追踪

```typescript
sources: [
  { name: 'environment', loaded: true, length: 500 },
  { name: 'default', loaded: true, length: 2000 },
  { name: 'project_config', loaded: false },
]
```

**为什么**：便于调试提示词来源和长度。
