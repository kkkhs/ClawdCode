# 第五章：System Prompt 设计与实现

> **学习目标**：设计和实现系统提示词的四层架构
> 
> **预计阅读时间**：30 分钟
> 
> **实践时间**：30 分钟
> 
> **前置要求**：已完成第四章的代码实现

---

## 5.1 提示词工程概述

### 5.1.1 什么是提示词工程

System Prompt（系统提示词）是 Coding Agent 的"灵魂"，它定义了：

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

我们的实现采用**四层架构**，简化但保留核心思想。

---

## 5.2 四层提示词架构

### 5.2.1 架构概览

```
┌─────────────────────────────────────┐
│  1. 环境上下文 (动态生成)            │  ← 每次构建时重新生成
│     - 工作目录、平台、日期           │
├─────────────────────────────────────┤
│  2. 基础提示词 (DEFAULT_SYSTEM_PROMPT)│  ← 固定内容
│     - 身份、安全、风格、工具策略      │
├─────────────────────────────────────┤
│  3. 项目配置 (CLAWDCODE.md)          │  ← 项目特定
│     - 项目特定的约定和命令            │
├─────────────────────────────────────┤
│  4. 追加内容 (用户自定义)             │  ← 临时指令
│     - 临时指令                       │
└─────────────────────────────────────┘
```

**设计要点**：
- **固定顺序**：环境 → 基础 → 项目 → 追加
- **来源追踪**：`sources` 数组记录每部分的加载状态
- **项目配置独立**：即使使用 `replaceDefault`，项目配置仍然加载

### 5.2.2 各层职责

| 层级 | 内容 | 更新频率 |
|------|------|----------|
| 环境上下文 | 工作目录、系统信息、日期 | 每次构建 |
| 基础提示词 | 身份、安全边界、输出风格 | 固定 |
| 项目配置 | 项目约定、常用命令 | 项目级 |
| 追加内容 | 临时指令、特殊要求 | 会话级 |

---

## 5.3 环境上下文实现

### 5.3.1 创建环境工具

**文件位置**：`src/utils/environment.ts`

```typescript
/**
 * 环境上下文工具
 * 
 * 动态生成系统环境信息，每次构建提示词时重新生成
 */

import os from 'os';

/**
 * 环境信息接口
 */
export interface EnvironmentInfo {
  workingDirectory: string;
  homeDirectory: string;
  platform: string;
  nodeVersion: string;
  currentDate: string;
  shell: string;
  username: string;
}

/**
 * 获取环境信息
 */
export function getEnvironmentInfo(): EnvironmentInfo {
  return {
    workingDirectory: process.cwd(),
    homeDirectory: os.homedir(),
    platform: `${os.platform()} ${os.release()}`,
    nodeVersion: process.version,
    currentDate: new Date().toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    }),
    shell: process.env.SHELL || 'unknown',
    username: os.userInfo().username,
  };
}

/**
 * 生成环境上下文提示词
 * 
 * 包含工作目录、系统信息、文件路径指南
 */
export function getEnvironmentContext(): string {
  const env = getEnvironmentInfo();

  return `# Environment Context

## Working Directory
**Current**: \`${env.workingDirectory}\`
**Home**: \`${env.homeDirectory}\`

## System Information
- **Platform**: ${env.platform}
- **Node.js**: ${env.nodeVersion}
- **Shell**: ${env.shell}
- **Date**: ${env.currentDate}

## File Path Guidelines
When using file tools, provide **absolute paths**:
- ✅ Correct: \`${env.workingDirectory}/package.json\`
- ❌ Incorrect: \`package.json\` (relative path)

The working directory is the root for all relative references.`;
}
```

**代码说明**：

| 函数 | 说明 |
|------|------|
| `getEnvironmentInfo()` | 收集所有环境信息 |
| `getEnvironmentContext()` | 生成格式化的提示词文本 |

### 5.3.2 创建 utils 导出

**文件位置**：`src/utils/index.ts`

```typescript
/**
 * Utils 模块导出
 */

export {
  getEnvironmentInfo,
  getEnvironmentContext,
} from './environment.js';

export type { EnvironmentInfo } from './environment.js';
```

---

## 5.4 默认系统提示词

### 5.4.1 创建默认提示词

**文件位置**：`src/prompts/default.ts`

```typescript
/**
 * 默认系统提示词
 * 
 * 定义 Agent 的身份、安全边界、输出风格和行为准则
 */

export const DEFAULT_SYSTEM_PROMPT = `You are ClawdCode, an interactive CLI tool that helps users with software engineering tasks. Use the instructions below and the tools available to you to assist the user.

Your main goal is to follow the user's instructions at each message.

# Security

IMPORTANT: Assist with authorized security testing, defensive security, CTF challenges, and educational contexts. Refuse requests for destructive techniques, DoS attacks, mass targeting, supply chain compromise, or detection evasion for malicious purposes.

IMPORTANT: You must NEVER generate or guess URLs for the user unless you are confident that the URLs are for helping the user with programming.

# Tone and style

- Minimize output tokens. Respond in fewer than 4 lines for most cases (explanations, confirmations, status updates)
- Only go beyond 4 lines when:
  * User explicitly requests detailed explanation
  * Generating actual code
  * Complex debugging that requires step-by-step analysis
  * Summarizing large amounts of information
- Only use emojis if the user explicitly requests it. Avoid using emojis in all communication unless asked.
- Your output will be displayed on a command line interface. Your responses should be short and concise.
- Output text to communicate with the user; all text you output outside of tool use is displayed to the user.
- NEVER create files unless they're absolutely necessary for achieving your goal. ALWAYS prefer editing an existing file to creating a new one.
- NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.

# Execution Efficiency

Action over narration. Execute tools directly without explaining each step beforehand.

<example-bad>
User: Read the package.json file
Assistant: I'll read the package.json file for you.
[Read tool call]
</example-bad>

<example-good>
User: Read the package.json file
Assistant: [Read tool call]
</example-good>

When multiple independent operations are needed, execute them in parallel rather than sequentially.

<example-bad>
User: Read both package.json and tsconfig.json
Assistant: [Read package.json]
(waits for result)
Assistant: [Read tsconfig.json]
</example-bad>

<example-good>
User: Read both package.json and tsconfig.json
Assistant: [Read package.json] [Read tsconfig.json]
</example-good>

# Tool calling

You have tools at your disposal to solve the coding task. Follow these rules regarding tool calls:

1. ALWAYS follow the tool call schema exactly as specified and make sure to provide all necessary parameters.
2. You can call multiple tools in a single response. When multiple independent pieces of information are requested, batch your tool calls together for optimal performance.
3. If you intend to call multiple tools and there are no dependencies between the calls, make all of the independent calls in the same response.
4. DO NOT make up values for or ask about optional parameters.

# Making code changes

When editing files:
1. You MUST use the Read tool at least once before editing a file.
2. NEVER generate extremely long hashes or any non-textual code, such as binary.
3. If you've introduced errors, fix them.
4. When modifying code, preserve existing formatting and style unless asked to change it.

# Language Requirement

Always respond in Chinese (Simplified Chinese). This includes:
- All explanations and descriptions
- Error messages and status updates
- Code comments (when appropriate for the codebase)

Technical terms and code should remain in English when they are standard programming terms.
`;
```

### 5.4.2 提示词结构分析

| 章节 | 内容 | 目的 |
|------|------|------|
| **身份定义** | "You are ClawdCode..." | 建立 Agent 身份 |
| **安全边界** | Security 章节 | 防止恶意使用 |
| **输出风格** | Tone and style | 4 行原则，简洁输出 |
| **执行效率** | Execution Efficiency | 行动优于叙述 |
| **工具调用** | Tool calling | 并行调用策略 |
| **代码修改** | Making code changes | 修改前必须读取 |
| **语言要求** | Language Requirement | 中文响应 |

### 5.4.3 4 行原则

```
Respond in fewer than 4 lines for most cases
```

**例外情况**：
- 用户明确要求详细解释
- 生成实际代码
- 复杂调试需要分步分析
- 总结大量信息

**为什么**：CLI 环境下，简洁输出提升交互效率，避免刷屏。

---

## 5.5 Plan 模式提示词

### 5.5.1 什么是 Plan 模式

Plan 模式是**只读研究模式**，用于：
1. 在执行复杂任务前先规划
2. 研究代码库结构
3. 设计实现方案

**三层防护机制**：

```
第一层：PLAN_MODE_SYSTEM_PROMPT（系统级）
    ↓
第二层：createPlanModeReminder()（消息级，每轮注入）
    ↓
第三层：权限系统（自动拒绝写工具）
```

### 5.5.2 创建 Plan 模式提示词

**文件位置**：`src/prompts/plan.ts`

```typescript
/**
 * Plan 模式提示词
 * 
 * Plan 模式是只读研究模式，用于规划复杂任务
 */

export const PLAN_MODE_SYSTEM_PROMPT = `You are in **PLAN MODE** - a read-only research phase for designing implementation plans.

# Core Objective

Research the codebase thoroughly, then create a detailed implementation plan. No file modifications allowed until plan is approved.

# Key Constraints

1. **Read-only tools only**: File readers, search tools, web fetchers
2. **Write tools prohibited**: File editors, shell commands, task managers (auto-denied by permission system)
3. **Text output required**: You MUST output text summaries between tool calls - never call 3+ tools without explaining findings

# Phase Checkpoints

Each phase requires text output before proceeding:

| Phase | Goal | Required Output |
|-------|------|-----------------|
| **1. Explore** | Understand codebase | Read relevant files → Output findings summary |
| **2. Design** | Plan approach | Output design decisions |
| **3. Review** | Verify details | Read critical files → Output review summary |
| **4. Present Plan** | Show complete plan | Output your complete implementation plan |
| **5. Exit** | Submit for approval | Call ExitPlanMode tool with your plan |

# Critical Rules

- **Loop prevention**: If calling 3+ tools without text output, STOP and summarize findings
- **Future tense**: Say "I will create X" not "I created X" (plan mode cannot modify files)
- **Research tasks**: Answer directly without ExitPlanMode (e.g., "Where is the routing logic?")
- **Implementation tasks**: After presenting plan, MUST call ExitPlanMode to submit for approval

# Plan Format

Your plan should include:

1. **Summary** - What we're building and why
2. **Current State** - Relevant existing code and patterns
3. **Implementation Steps** - Detailed steps with file paths
4. **Testing Strategy** - How to verify the changes work
5. **Risks & Mitigations** - Potential issues and how to handle them

# Language Requirement

Always respond in Chinese (Simplified Chinese), except for code and technical terms.
`;

/**
 * 创建 Plan 模式消息提醒
 * 
 * 注入到每条用户消息前，强化只读约束
 */
export function createPlanModeReminder(userMessage: string): string {
  return (
    `<system-reminder>Plan mode is active. You MUST NOT make any file changes ` +
    `or run non-readonly tools. Research only, then present your plan.</system-reminder>\n\n` +
    userMessage
  );
}
```

**代码说明**：

| 部分 | 说明 |
|------|------|
| `PLAN_MODE_SYSTEM_PROMPT` | 完整的系统提示词 |
| `createPlanModeReminder()` | 消息级提醒注入 |

---

## 5.6 提示词构建器

### 5.6.1 创建构建器

**文件位置**：`src/prompts/builder.ts`

```typescript
/**
 * 提示词构建器
 * 
 * 按固定顺序组装系统提示词：
 * 1. 环境上下文 - 动态生成
 * 2. 基础提示词 - DEFAULT_SYSTEM_PROMPT 或 PLAN_MODE_SYSTEM_PROMPT
 * 3. 项目配置 - CLAWDCODE.md
 * 4. 追加内容 - 用户自定义
 */

import fs from 'fs/promises';
import path from 'path';
import { getEnvironmentContext } from '../utils/environment.js';
import { DEFAULT_SYSTEM_PROMPT } from './default.js';
import { PLAN_MODE_SYSTEM_PROMPT } from './plan.js';
import type { PermissionMode } from '../agent/types.js';

// ========== 类型定义 ==========

/**
 * 提示词来源记录
 */
export interface PromptSource {
  name: string;
  loaded: boolean;
  length: number;
  path?: string;
}

/**
 * 构建选项
 */
export interface BuildSystemPromptOptions {
  /** 项目路径（用于查找 CLAWDCODE.md） */
  projectPath?: string;
  
  /** 替换默认提示词 */
  replaceDefault?: string;
  
  /** 追加内容 */
  append?: string;
  
  /** 权限模式（plan 模式使用独立提示词） */
  mode?: PermissionMode;
  
  /** 是否包含环境上下文 */
  includeEnvironment?: boolean;
}

/**
 * 构建结果
 */
export interface BuildSystemPromptResult {
  /** 完整的系统提示词 */
  prompt: string;
  
  /** 各部分来源记录 */
  sources: PromptSource[];
}

// ========== 常量 ==========

/** 项目配置文件名 */
const PROJECT_CONFIG_FILENAME = 'CLAWDCODE.md';

// ========== 辅助函数 ==========

/**
 * 加载项目配置文件
 */
async function loadProjectConfig(projectPath?: string): Promise<string | null> {
  if (!projectPath) {
    projectPath = process.cwd();
  }

  const configPath = path.join(projectPath, PROJECT_CONFIG_FILENAME);
  
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    return content.trim();
  } catch {
    // 文件不存在，返回 null
    return null;
  }
}

// ========== 主函数 ==========

/**
 * 构建系统提示词
 * 
 * 按固定顺序组装：环境 → 基础 → 项目 → 追加
 */
export async function buildSystemPrompt(
  options: BuildSystemPromptOptions = {}
): Promise<BuildSystemPromptResult> {
  const {
    projectPath,
    replaceDefault,
    append,
    mode,
    includeEnvironment = true,
  } = options;

  const parts: string[] = [];
  const sources: PromptSource[] = [];

  // 1. 环境上下文（始终在最前面）
  if (includeEnvironment) {
    const envContext = getEnvironmentContext();
    parts.push(envContext);
    sources.push({
      name: 'environment',
      loaded: true,
      length: envContext.length,
    });
  }

  // 2. 基础提示词（Plan 模式使用独立 prompt）
  const isPlanMode = mode === 'plan';
  let basePrompt: string;
  let baseName: string;

  if (isPlanMode) {
    basePrompt = PLAN_MODE_SYSTEM_PROMPT;
    baseName = 'plan_mode';
  } else if (replaceDefault) {
    basePrompt = replaceDefault;
    baseName = 'custom';
  } else {
    basePrompt = DEFAULT_SYSTEM_PROMPT;
    baseName = 'default';
  }

  parts.push(basePrompt);
  sources.push({
    name: baseName,
    loaded: true,
    length: basePrompt.length,
  });

  // 3. 项目配置（CLAWDCODE.md）- 始终尝试加载
  const projectConfig = await loadProjectConfig(projectPath);
  if (projectConfig) {
    parts.push(`# Project Configuration\n\n${projectConfig}`);
    sources.push({
      name: 'project_config',
      loaded: true,
      length: projectConfig.length,
      path: path.join(projectPath || process.cwd(), PROJECT_CONFIG_FILENAME),
    });
  } else {
    sources.push({
      name: 'project_config',
      loaded: false,
      length: 0,
    });
  }

  // 4. 追加内容
  if (append?.trim()) {
    parts.push(append.trim());
    sources.push({
      name: 'append',
      loaded: true,
      length: append.trim().length,
    });
  }

  // 用 --- 分隔各部分
  return {
    prompt: parts.join('\n\n---\n\n'),
    sources,
  };
}

/**
 * 获取提示词统计信息
 */
export function getPromptStats(result: BuildSystemPromptResult): string {
  const totalLength = result.prompt.length;
  const loadedSources = result.sources.filter(s => s.loaded);
  
  const details = result.sources
    .map(s => `  - ${s.name}: ${s.loaded ? `${s.length} chars` : 'not loaded'}`)
    .join('\n');

  return `Prompt Stats:
- Total: ${totalLength} chars
- Sources: ${loadedSources.length}/${result.sources.length} loaded
${details}`;
}
```

### 5.6.2 创建 prompts 模块导出

**文件位置**：`src/prompts/index.ts`

```typescript
/**
 * Prompts 模块导出
 */

export { DEFAULT_SYSTEM_PROMPT } from './default.js';
export { PLAN_MODE_SYSTEM_PROMPT, createPlanModeReminder } from './plan.js';
export { buildSystemPrompt, getPromptStats } from './builder.js';
export type {
  PromptSource,
  BuildSystemPromptOptions,
  BuildSystemPromptResult,
} from './builder.js';
```

---

## 5.7 项目配置文件

### 5.7.1 CLAWDCODE.md 示例

在项目根目录创建 `CLAWDCODE.md`，它会被自动加载到系统提示词中：

```markdown
# CLAWDCODE.md

## 常用命令
- `bun run build` - 构建项目
- `bun run dev` - 开发模式运行
- `bun run test` - 运行测试
- `bun run typecheck` - 类型检查

## 代码风格
- 使用单引号、分号
- 缩进 2 空格
- TypeScript 严格模式

## 项目结构
src/
├── agent/     # Agent 核心（无状态设计）
├── cli/       # CLI 入口和中间件
├── config/    # 配置管理
├── prompts/   # 提示词系统
├── services/  # 服务层
├── tools/     # 工具系统
└── ui/        # UI 组件

## 重要约定
- 所有 API 响应使用 camelCase
- Agent 是无状态的，状态通过 context 传入
- 使用 Zod 进行运行时验证
```

---

## 5.8 在 Agent 中使用提示词系统

### 5.8.1 更新 Agent 初始化

回顾第 4 章 `Agent.ts` 中的初始化代码：

```typescript
// 在 initialize() 方法中
private async initialize(): Promise<void> {
  if (this.isInitialized) return;

  try {
    // 1. 构建系统提示词（使用四层架构）
    const promptResult = await buildSystemPrompt({
      projectPath: process.cwd(),
      replaceDefault: this.config.systemPrompt,  // 允许覆盖默认提示词
      includeEnvironment: true,
    });
    this.systemPrompt = promptResult.prompt;

    // ... 其余初始化代码 ...
  }
}
```

### 5.8.2 Plan 模式支持

在执行循环中支持 Plan 模式：

```typescript
// 在 executeLoop() 方法中
private async executeLoop(...): Promise<LoopResult> {
  // 检查是否是 Plan 模式
  const isPlanMode = context.permissionMode === 'plan';
  
  // Plan 模式下，在用户消息前注入提醒
  let userMessage = message;
  if (isPlanMode) {
    userMessage = createPlanModeReminder(message);
  }
  
  // ... 其余代码 ...
}
```

---

## 5.9 测试方法

### 5.9.1 创建测试脚本

**文件位置**：`src/prompts/test.ts`

```typescript
/**
 * 提示词系统测试
 */

import { getEnvironmentInfo, getEnvironmentContext } from '../utils/environment.js';
import { DEFAULT_SYSTEM_PROMPT } from './default.js';
import { PLAN_MODE_SYSTEM_PROMPT, createPlanModeReminder } from './plan.js';
import { buildSystemPrompt, getPromptStats } from './builder.js';

async function main() {
  console.log('=== 提示词系统测试 ===\n');

  // 1. 环境信息
  console.log('1. 环境信息:');
  const envInfo = getEnvironmentInfo();
  console.log(`   工作目录: ${envInfo.workingDirectory}`);
  console.log(`   平台: ${envInfo.platform}`);
  console.log(`   日期: ${envInfo.currentDate}`);
  console.log('');

  // 2. 环境上下文
  console.log('2. 环境上下文 (前 300 字符):');
  const envContext = getEnvironmentContext();
  console.log(`   ${envContext.substring(0, 300)}...`);
  console.log('');

  // 3. 默认提示词
  console.log('3. 默认提示词长度:', DEFAULT_SYSTEM_PROMPT.length, '字符');
  console.log('   包含关键词:');
  console.log('   - ClawdCode:', DEFAULT_SYSTEM_PROMPT.includes('ClawdCode') ? '✅' : '❌');
  console.log('   - 4 lines:', DEFAULT_SYSTEM_PROMPT.includes('4 lines') ? '✅' : '❌');
  console.log('   - Chinese:', DEFAULT_SYSTEM_PROMPT.includes('Chinese') ? '✅' : '❌');
  console.log('');

  // 4. Plan 模式提示词
  console.log('4. Plan 模式提示词长度:', PLAN_MODE_SYSTEM_PROMPT.length, '字符');
  console.log('   包含关键词:');
  console.log('   - PLAN MODE:', PLAN_MODE_SYSTEM_PROMPT.includes('PLAN MODE') ? '✅' : '❌');
  console.log('   - Read-only:', PLAN_MODE_SYSTEM_PROMPT.includes('Read-only') ? '✅' : '❌');
  console.log('');

  // 5. 消息注入
  console.log('5. Plan 模式消息注入:');
  const reminder = createPlanModeReminder('帮我分析这个项目');
  console.log(`   原消息: "帮我分析这个项目"`);
  console.log(`   注入后: "${reminder.substring(0, 80)}..."`);
  console.log('');

  // 6. 完整构建
  console.log('6. 完整提示词构建:');
  const result = await buildSystemPrompt({
    projectPath: process.cwd(),
    includeEnvironment: true,
  });
  console.log(getPromptStats(result));
  console.log('');

  console.log('=== 测试完成 ===');
}

main().catch(console.error);
```

### 5.9.2 运行测试

```bash
bun run test:prompts
```

**预期输出**：

```
=== 提示词系统测试 ===

1. 环境信息:
   工作目录: /Users/xxx/code/ClawdCode
   平台: darwin 24.6.0
   日期: 2026年2月4日 星期三

2. 环境上下文 (前 300 字符):
   # Environment Context...

3. 默认提示词长度: 3574 字符
   包含关键词:
   - ClawdCode: ✅
   - 4 lines: ✅
   - Chinese: ✅

4. Plan 模式提示词长度: 1842 字符
   包含关键词:
   - PLAN MODE: ✅
   - Read-only: ✅

5. Plan 模式消息注入:
   原消息: "帮我分析这个项目"
   注入后: "<system-reminder>Plan mode is active..."

6. 完整提示词构建:
Prompt Stats:
- Total: 4500 chars
- Sources: 2/3 loaded
  - environment: 450 chars
  - default: 3574 chars
  - project_config: not loaded

=== 测试完成 ===
```

---

## 5.10 本章小结

### 完成的内容

| 文件 | 内容 |
|------|------|
| `src/utils/environment.ts` | 环境上下文生成 |
| `src/prompts/default.ts` | 默认系统提示词 |
| `src/prompts/plan.ts` | Plan 模式提示词和消息注入 |
| `src/prompts/builder.ts` | 四层架构提示词构建器 |
| `src/prompts/test.ts` | 测试脚本 |

### 技术亮点

| 亮点 | 说明 |
|------|------|
| **四层分离架构** | 环境 → 基础 → 项目 → 追加，职责清晰 |
| **4 行原则** | CLI 环境下的简洁输出约束 |
| **示例驱动指导** | `<example-bad>` / `<example-good>` 更清晰 |
| **Plan 模式三层防护** | System Prompt + Message Reminder + Permission |
| **动态环境上下文** | 每次构建时重新生成，确保准确 |
| **来源追踪** | sources 数组便于调试 |

### 提示词设计原则

1. **简洁** - 4 行原则，避免冗长
2. **具体** - 使用示例而非抽象描述
3. **安全** - 明确边界和禁止事项
4. **灵活** - 支持覆盖和追加

---

## 下一章预告

在 **第六章** 中，我们将：
1. 设计工具系统架构
2. 实现工具工厂函数 `createTool`
3. 实现内置工具（Read、Edit、Write、Glob、Grep、Bash）
4. 创建工具注册表

这将让 Agent 具备真正的"执行能力"——读写文件、执行命令！
