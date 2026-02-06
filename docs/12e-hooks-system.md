# 12e Hooks 系统技术文档

## 12e.1 概述

Hooks 系统允许用户在 Agent 生命周期的关键节点注入自定义 Shell 命令。支持 11 种事件类型，覆盖工具执行、会话生命周期、控制流等场景。

## 12e.2 核心类型

```typescript
// src/hooks/types.ts

export enum HookEvent {
  PreToolUse = 'PreToolUse',
  PostToolUse = 'PostToolUse',
  PostToolUseFailure = 'PostToolUseFailure',
  PermissionRequest = 'PermissionRequest',
  UserPromptSubmit = 'UserPromptSubmit',
  SessionStart = 'SessionStart',
  SessionEnd = 'SessionEnd',
  Stop = 'Stop',
  SubagentStop = 'SubagentStop',
  Notification = 'Notification',
  Compaction = 'Compaction',
}

export enum HookExitCode {
  SUCCESS = 0,
  NON_BLOCKING_ERROR = 1,
  BLOCKING_ERROR = 2,
  TIMEOUT = 124,
}

export interface HookConfig {
  enabled?: boolean;
  defaultTimeout?: number;
  timeoutBehavior?: 'ignore' | 'deny' | 'ask';
  failureBehavior?: 'ignore' | 'deny' | 'ask';
  maxConcurrentHooks?: number;
  PreToolUse?: HookMatcher[];
  PostToolUse?: HookMatcher[];
  // ... 其他事件
}

export interface HookMatcher {
  name?: string;
  matcher?: MatcherConfig;
  hooks: Hook[];
}

export interface MatcherConfig {
  tools?: string;     // 正则/管道
  paths?: string;     // glob
  commands?: string;  // 正则
}

export interface CommandHook {
  type: 'command';
  command: string;
  timeout?: number;
  statusMessage?: string;
}
```

## 12e.3 Matcher 实现

```typescript
// src/hooks/Matcher.ts

export class Matcher {
  matches(config: MatcherConfig | undefined, context: MatchContext): boolean {
    if (!config) return true;

    if (config.tools && context.toolName) {
      if (!this.matchesPattern(context.toolName, config.tools)) {
        return false;
      }
    }

    if (config.paths && context.filePath) {
      if (!minimatch(context.filePath, config.paths, { matchBase: true })) {
        return false;
      }
    }

    return true;
  }

  private matchesPattern(value: string, pattern: string): boolean {
    // 支持管道分隔: "Read|Write|Edit"
    const parts = pattern.split('|');
    for (const part of parts) {
      if (value === part.trim()) return true;
    }
    
    // 支持正则: "Bash\\(.*\\)"
    try {
      return new RegExp(`^(${pattern})$`).test(value);
    } catch {
      return value === pattern;
    }
  }
}
```

## 12e.4 HookExecutor 实现

```typescript
// src/hooks/HookExecutor.ts

export class HookExecutor {
  // PreToolUse: 串行，累积 updatedInput
  async executePreToolHooks(hooks, input, context): Promise<PreToolHookResult> {
    let cumulativeInput = input.tool_input;

    for (const hook of hooks) {
      const result = await this.executeCommandHook(hook, { ...input, tool_input: cumulativeInput }, context);

      if (result.output?.permissionDecision === 'deny') {
        return { decision: 'deny', reason: result.output.permissionDecisionReason };
      }

      if (result.output?.updatedInput) {
        cumulativeInput = { ...cumulativeInput, ...result.output.updatedInput };
      }
    }

    return { decision: 'allow', modifiedInput: cumulativeInput };
  }

  // PostToolUse: 并行，合并结果
  async executePostToolHooks(hooks, input, context): Promise<PostToolHookResult> {
    const results = await this.executeHooksConcurrently(hooks, input, context, 5);
    const contexts = results.map(r => r.stdout?.trim()).filter(Boolean);
    return { additionalContext: contexts.join('\n\n') };
  }

  private async executeCommandHook(hook, input, context): Promise<HookExecutionResult> {
    return new Promise((resolve) => {
      const child = spawn('sh', ['-c', hook.command], {
        cwd: context.projectDir,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      child.stdin.write(JSON.stringify(input));
      child.stdin.end();

      // ... 收集 stdout/stderr，处理超时
    });
  }
}
```

## 12e.5 HookManager 实现

```typescript
// src/hooks/HookManager.ts

export class HookManager {
  private static instance: HookManager | null = null;
  private config: HookConfig = DEFAULT_HOOK_CONFIG;
  private executor = new HookExecutor();
  private matcher = new Matcher();
  private guard = new HookExecutionGuard();

  async executePreToolHooks(
    toolName: string,
    toolUseId: string,
    toolInput: Record<string, unknown>,
    context: HookContext
  ): Promise<PreToolHookResult> {
    if (!this.isEnabled()) return { decision: 'allow' };
    if (!this.guard.canExecute(toolUseId, HookEvent.PreToolUse)) {
      return { decision: 'allow' };
    }

    const hooks = this.getMatchingHooks(HookEvent.PreToolUse, {
      toolName,
      filePath: extractFilePath(toolInput),
      command: extractCommand(toolName, toolInput),
    });

    if (hooks.length === 0) return { decision: 'allow' };

    const result = await this.executor.executePreToolHooks(hooks, input, context);
    this.guard.markExecuted(toolUseId, HookEvent.PreToolUse);
    return result;
  }
}
```

## 12e.6 /hooks 命令

```typescript
// src/slash-commands/builtinCommands.ts

export const hooksCommand: SlashCommand = {
  name: 'hooks',
  description: '查看和管理 Hooks',
  category: 'hooks',
  usage: '/hooks [status|list]',

  async handler(args: string): Promise<SlashCommandResult> {
    const { getHookManager } = await import('../hooks/index.js');
    const manager = getHookManager();

    if (args === 'status' || args === '') {
      const counts = manager.getHookCounts();
      // 显示状态和统计
    }

    if (args === 'list') {
      const config = manager.getConfig();
      // 列出所有配置
    }
  },
};
```

## 12e.7 执行策略

| 事件 | 策略 | 原因 |
|------|------|------|
| PreToolUse | 串行 | 累积 updatedInput，deny 立即中断 |
| PostToolUse | 并行 | 结果可合并 |
| PermissionRequest | 串行 | 第一个决策即返回 |
| UserPromptSubmit | 并行 | stdout 合并注入 |
| Stop | 串行 | 第一个 continue:true 即返回 |

## 12e.8 ExecutionPipeline 集成

HookStage 和 PostHookStage 通过 **HookService** 实现工具执行前后的 Hook 调用，保持架构统一。

```typescript
// src/tools/execution/stages/HookStage.ts

import { onPreToolUse } from '../../../hooks/index.js';

export class HookStage implements PipelineStage {
  readonly name = 'hook';

  async process(execution: ToolExecution): Promise<void> {
    const tool = execution._internal.tool;
    if (!tool) return;

    const toolUseId = execution.context.messageId || `tool_${nanoid()}`;
    execution._internal.hookToolUseId = toolUseId;

    // 通过 HookService 调用
    const result = await onPreToolUse(
      tool.name,
      toolUseId,
      execution.params as Record<string, unknown>,
      execution.context.sessionId || 'unknown',
      execution.context.workspaceRoot || process.cwd(),
      execution.context.permissionMode
    );

    if (result.decision === 'deny') {
      execution.abort(result.reason || 'Hook blocked execution');
      return;
    }
    
    if (result.decision === 'ask') {
      execution._internal.needsConfirmation = true;
      return;
    }

    if (result.modifiedInput) {
      execution.params = { ...execution.params, ...result.modifiedInput };
    }
  }
}
```

```typescript
// src/tools/execution/stages/PostHookStage.ts

import { onPostToolUse, onPostToolUseFailure } from '../../../hooks/index.js';

export class PostHookStage implements PipelineStage {
  readonly name = 'postHook';

  async process(execution: ToolExecution): Promise<void> {
    const result = execution.getResult();
    const tool = execution._internal.tool;
    if (!result || !tool) return;

    const toolUseId = execution._internal.hookToolUseId || `tool_post_${Date.now()}`;

    if (result.success) {
      // 通过 HookService 调用 PostToolUse
      const hookResult = await onPostToolUse(
        tool.name, toolUseId, execution.params, result,
        execution.context.sessionId, execution.context.workspaceRoot
      );

      if (hookResult.additionalContext) {
        result.llmContent += `\n\n[Hook Context]\n${hookResult.additionalContext}`;
      }
      if (hookResult.modifiedOutput !== undefined) {
        result.llmContent = String(hookResult.modifiedOutput);
      }
    } else {
      // 通过 HookService 调用 PostToolUseFailure
      await onPostToolUseFailure(
        tool.name, toolUseId, execution.params,
        result.error?.message || 'Unknown error',
        execution.context.sessionId, execution.context.workspaceRoot
      );
    }
  }
}
```

## 12e.9 HookService - 简洁 API 层

为避免在各处散落的 HookManager 调用，提供 HookService 作为统一 facade。**所有 Hook 调用都通过 HookService 管理**：

```typescript
// src/hooks/HookService.ts

// 检查 Hooks 是否可用
export function isHooksAvailable(): boolean;

// ==================== 生命周期 Hooks ====================
export async function onSessionStart(sessionId: string, projectDir?: string): Promise<void>;
export async function onSessionEnd(sessionId: string, projectDir?: string): Promise<void>;
export async function onUserPromptSubmit(
  promptContent: string, 
  sessionId: string, 
  projectDir?: string
): Promise<string | undefined>;

// ==================== 控制流 Hooks ====================
export async function onStop(stopReason: string | undefined, sessionId: string): Promise<boolean>;
export async function onCompaction(preTokens: number, messageCount: number, sessionId: string): Promise<boolean>;

// ==================== 工具执行 Hooks ====================
export async function onPreToolUse(
  toolName: string,
  toolUseId: string,
  toolInput: Record<string, unknown>,
  sessionId: string,
  projectDir?: string,
  permissionMode?: string
): Promise<PreToolHookResult>;

export async function onPostToolUse(
  toolName: string,
  toolUseId: string,
  toolInput: Record<string, unknown>,
  toolResult: { success: boolean; llmContent?: string },
  sessionId: string,
  projectDir?: string,
  permissionMode?: string
): Promise<PostToolHookResult>;

export async function onPostToolUseFailure(
  toolName: string,
  toolUseId: string,
  toolInput: Record<string, unknown>,
  errorMessage: string,
  sessionId: string,
  projectDir?: string,
  permissionMode?: string
): Promise<void>;

export async function onPermissionRequest(
  toolName: string, 
  toolInput: Record<string, unknown>, 
  sessionId: string
): Promise<'approve' | 'deny' | 'ask'>;
```

**使用示例**：

```typescript
// ClawdInterface.tsx - 用户提交消息
const { onUserPromptSubmit } = await import('../../hooks/index.js');
const injectedContext = await onUserPromptSubmit(value, sessionId, process.cwd());

// HookStage.ts - 工具执行前
const result = await onPreToolUse(tool.name, toolUseId, params, sessionId, projectDir);

// PostHookStage.ts - 工具执行后
const hookResult = await onPostToolUse(tool.name, toolUseId, params, result, sessionId);

// PermissionStage.ts - 权限请求
return onPermissionRequest(toolName, execution.params, sessionId, projectDir);

// CompactionService.ts - 压缩前检查
const shouldPrevent = await onCompaction(preTokens, messages.length, sessionId);
```

## 12e.9.1 Stop Hook 集成

Stop Hook 在 Agent 的 agentic loop 结束时调用，允许 Hook 强制 Agent 继续执行：

```typescript
// src/agent/Agent.ts

import { onStop } from '../hooks/index.js';

// 在 executeLoop 中，当无工具调用时：
if (!turnResult.toolCalls || turnResult.toolCalls.length === 0) {
  // ... 意图未完成检测 ...

  // 执行 Stop Hook - 允许 Hook 强制继续执行
  const shouldContinue = await onStop(
    'end_turn',
    context.sessionId || 'unknown',
    process.cwd()
  );

  if (shouldContinue) {
    agentDebug.log('Stop hook requested to continue');
    messages.push({
      role: 'user',
      content: '[System] Hook requested continuation. Please continue.',
    });
    continue;  // 继续循环
  }

  return { success: true, finalMessage: turnResult.content, ... };
}
```

**Stop Hook 配置示例**（强制完成所有 TODO）：

```json
{
  "hooks": {
    "Stop": [{
      "name": "ensure-todos-complete",
      "hooks": [{
        "type": "command",
        "command": "if grep -q '\\[ \\]' TODO.md 2>/dev/null; then echo '{\"continue\":true,\"reason\":\"Incomplete TODOs found\"}'; fi"
      }]
    }]
  }
}
```

## 12e.10 集成点总览

**所有 Hook 调用都统一通过 HookService**：

| Hook 类型 | 集成位置 | HookService 函数 | 说明 |
|-----------|----------|-----------------|------|
| PreToolUse | HookStage | `onPreToolUse` | 工具执行前 |
| PostToolUse | PostHookStage | `onPostToolUse` | 工具执行后 |
| PostToolUseFailure | PostHookStage | `onPostToolUseFailure` | 工具失败后 |
| PermissionRequest | PermissionStage | `onPermissionRequest` | 权限请求时 |
| UserPromptSubmit | ClawdInterface | `onUserPromptSubmit` | 用户发消息时 |
| SessionStart | ClawdInterface | `onSessionStart` | 会话初始化后 |
| SessionEnd | ClawdInterface | `onSessionEnd` | 会话清理时 |
| Compaction | CompactionService | `onCompaction` | 压缩前 |
| Stop | Agent.executeLoop | `onStop` | Agent 停止时（可强制继续） |

## 12e.11 新增/修改文件

| 文件 | 说明 |
|------|------|
| `src/hooks/types.ts` | 类型定义 |
| `src/hooks/Matcher.ts` | 匹配器 |
| `src/hooks/HookExecutor.ts` | 执行器 |
| `src/hooks/HookManager.ts` | 管理器 |
| `src/hooks/HookService.ts` | **简洁 API 层** |
| `src/hooks/index.ts` | 模块导出 |
| `src/tools/execution/stages/HookStage.ts` | PreToolUse 阶段 |
| `src/tools/execution/stages/PostHookStage.ts` | PostToolUse 阶段 |
| `src/tools/execution/stages/PermissionStage.ts` | PermissionRequest 集成 |
| `src/context/CompactionService.ts` | Compaction 集成 |
| `src/config/types.ts` | HookConfigSchema |

## 12e.12 TODO

- [x] 集成到 ExecutionPipeline
- [x] 从 settings.json 加载配置
- [x] HookService 简洁 API 层
- [x] HookService 统一管理所有 Hook 调用（包括工具执行 Hooks）
- [x] SessionStart / SessionEnd hooks
- [x] UserPromptSubmit hooks
- [x] PermissionRequest hooks
- [x] Compaction hooks
- [x] PreToolUse / PostToolUse / PostToolUseFailure 通过 HookService
- [x] Stop hooks（Agent 停止时，可强制继续执行）
- [ ] 环境变量覆盖支持
