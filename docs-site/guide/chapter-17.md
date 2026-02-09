# 第 17 章：Hooks 系统

> 本章实现 Hooks 系统，允许用户在 Agent 生命周期的关键节点注入自定义 Shell 命令。

## 17.1 什么是 Hooks？

Hooks 是一种强大的扩展机制，允许用户在特定事件点注入自定义 Shell 命令。通过 Hooks，你可以：

- **拦截工具调用**：在执行前检查、修改或阻止
- **后处理工具输出**：添加额外上下文或转换结果
- **注入动态上下文**：在用户提问前注入项目特定信息
- **自动化工作流**：代码格式化、安全检查、日志记录
- **控制 Agent 行为**：决定权限、停止条件等

## 17.2 Hook 事件类型

Hooks 支持 11 种事件，分为四大类：

```typescript
export enum HookEvent {
  // ========== 工具执行类 ==========
  PreToolUse = 'PreToolUse',           // 工具执行前
  PostToolUse = 'PostToolUse',         // 工具执行后
  PostToolUseFailure = 'PostToolUseFailure', // 工具失败后
  PermissionRequest = 'PermissionRequest',   // 权限请求时

  // ========== 会话生命周期类 ==========
  UserPromptSubmit = 'UserPromptSubmit', // 用户提交消息时
  SessionStart = 'SessionStart',         // 会话开始时
  SessionEnd = 'SessionEnd',             // 会话结束时

  // ========== 控制流类 ==========
  Stop = 'Stop',                         // Agent 停止时
  SubagentStop = 'SubagentStop',         // 子 Agent 停止时

  // ========== 其他 ==========
  Notification = 'Notification',         // 通知事件
  Compaction = 'Compaction',             // 上下文压缩时
}
```

**事件用途**：

| 事件 | 触发时机 | 典型用途 |
|------|----------|----------|
| **PreToolUse** | 工具执行前 | 阻止危险操作、修改参数 |
| **PostToolUse** | 工具执行后 | 添加 lint 结果、日志记录 |
| **PermissionRequest** | 需要权限时 | 自动批准/拒绝特定操作 |
| **UserPromptSubmit** | 用户发消息 | 注入项目上下文 |
| **Stop** | Agent 停止时 | 强制继续执行 |
| **Compaction** | 压缩上下文时 | 阻止压缩 |

## 17.3 配置结构

```typescript
export interface HookConfig {
  enabled?: boolean;              // 是否启用
  defaultTimeout?: number;        // 默认超时（秒）
  timeoutBehavior?: 'ignore' | 'deny' | 'ask';
  failureBehavior?: 'ignore' | 'deny' | 'ask';
  maxConcurrentHooks?: number;    // 最大并发数

  // 各事件类型的 Hook 列表
  PreToolUse?: HookMatcher[];
  PostToolUse?: HookMatcher[];
  // ... 其他事件
}

export interface HookMatcher {
  name?: string;            // 可选名称
  matcher?: MatcherConfig;  // 匹配条件
  hooks: Hook[];            // Hook 列表
}

export interface MatcherConfig {
  tools?: string;     // 工具名匹配（正则/管道）
  paths?: string;     // 文件路径匹配（glob）
  commands?: string;  // 命令匹配（正则）
}

export interface CommandHook {
  type: 'command';
  command: string;        // Shell 命令
  timeout?: number;       // 超时（秒）
  statusMessage?: string; // 状态消息
}
```

## 17.4 输入输出协议

Hook 通过 **stdin 接收 JSON 输入**，通过 **stdout 返回 JSON 输出**。

### PreToolUse 输入输出

```typescript
// 输入
interface PreToolUseInput {
  hook_event_name: 'PreToolUse';
  hook_execution_id: string;
  timestamp: string;
  tool_name: string;
  tool_use_id: string;
  tool_input: Record<string, unknown>;
  project_dir: string;
  session_id: string;
  permission_mode: PermissionMode;
}

// 输出
interface PreToolUseOutput {
  permissionDecision?: 'allow' | 'deny' | 'ask';
  permissionDecisionReason?: string;
  updatedInput?: Record<string, unknown>;
}
```

### 退出码语义

| 退出码 | 含义 | 行为 |
|--------|------|------|
| 0 | 成功 | 继续执行 |
| 1 | 非阻塞错误 | 记录警告，继续 |
| 2 | 阻塞错误 | 停止执行 |
| 124 | 超时 | 根据 timeoutBehavior 处理 |

## 17.5 核心实现

### Matcher

匹配器根据 tools、paths、commands 判断是否执行 Hook：

```typescript
export class Matcher {
  matches(config: MatcherConfig | undefined, context: MatchContext): boolean {
    if (!config) return true;  // 无配置 = 匹配所有

    // 检查工具名（支持正则/管道）
    if (config.tools && context.toolName) {
      if (!this.matchesPattern(context.toolName, config.tools)) {
        return false;
      }
    }

    // 检查文件路径（glob）
    if (config.paths && context.filePath) {
      if (!minimatch(context.filePath, config.paths)) {
        return false;
      }
    }

    return true;
  }
}
```

### HookExecutor

执行器负责运行 Shell 命令并解析结果：

```typescript
export class HookExecutor {
  // PreToolUse: 串行执行（需要累积 updatedInput）
  async executePreToolHooks(hooks, input, context): Promise<PreToolHookResult> {
    let cumulativeInput = input.tool_input;
    
    for (const hook of hooks) {
      const result = await this.executeHook(hook, { ...input, tool_input: cumulativeInput });
      
      if (result.output?.permissionDecision === 'deny') {
        return { decision: 'deny', reason: result.output.permissionDecisionReason };
      }
      
      if (result.output?.updatedInput) {
        cumulativeInput = { ...cumulativeInput, ...result.output.updatedInput };
      }
    }
    
    return { decision: 'allow', modifiedInput: cumulativeInput };
  }

  // PostToolUse: 并行执行（结果可合并）
  async executePostToolHooks(hooks, input, context): Promise<PostToolHookResult> {
    const results = await Promise.all(
      hooks.map(hook => this.executeHook(hook, input))
    );
    
    const additionalContexts = results
      .map(r => r.stdout?.trim())
      .filter(Boolean);
    
    return { additionalContext: additionalContexts.join('\n\n') };
  }
}
```

### HookManager

单例管理器，协调匹配和执行：

```typescript
export class HookManager {
  private static instance: HookManager | null = null;
  private config: HookConfig;
  private executor = new HookExecutor();
  private matcher = new Matcher();
  private guard = new HookExecutionGuard();  // 防止重复执行

  async executePreToolHooks(
    toolName: string,
    toolUseId: string,
    toolInput: Record<string, unknown>,
    context: HookContext
  ): Promise<PreToolHookResult> {
    if (!this.isEnabled()) return { decision: 'allow' };
    
    // 防止重复执行
    if (!this.guard.canExecute(toolUseId, HookEvent.PreToolUse)) {
      return { decision: 'allow' };
    }

    // 获取匹配的 hooks
    const hooks = this.getMatchingHooks(HookEvent.PreToolUse, {
      toolName,
      filePath: extractFilePath(toolInput),
      command: extractCommand(toolName, toolInput),
    });

    if (hooks.length === 0) return { decision: 'allow' };

    // 执行
    const result = await this.executor.executePreToolHooks(hooks, input, context);
    
    this.guard.markExecuted(toolUseId, HookEvent.PreToolUse);
    
    return result;
  }
}
```

## 17.6 执行策略

| 事件类型 | 执行策略 | 原因 |
|----------|----------|------|
| PreToolUse | **串行** | 需要累积 updatedInput，第一个 deny 立即中断 |
| PostToolUse | **并行** | 结果可合并，提高性能 |
| PermissionRequest | **串行** | 第一个明确决策即返回 |
| UserPromptSubmit | **并行** | stdout 合并注入 |
| Stop | **串行** | 第一个 continue:true 即返回 |

## 17.7 配置示例

### 阻止读取敏感文件

```json
{
  "hooks": {
    "PreToolUse": [{
      "name": "block-env-read",
      "matcher": {
        "tools": "Read",
        "paths": "**/.env*"
      },
      "hooks": [{
        "type": "command",
        "command": "echo '{\"permissionDecision\":\"deny\",\"permissionDecisionReason\":\"Reading .env files is not allowed\"}'",
        "timeout": 5
      }]
    }]
  }
}
```

### 代码写入后运行 Lint

```json
{
  "hooks": {
    "PostToolUse": [{
      "name": "lint-on-write",
      "matcher": {
        "tools": "Write|Edit",
        "paths": "**/*.{ts,tsx}"
      },
      "hooks": [{
        "type": "command",
        "command": "eslint --format compact \"$FILE_PATH\" 2>/dev/null | head -5",
        "statusMessage": "Running ESLint..."
      }]
    }]
  }
}
```

### 注入 Git 上下文

```json
{
  "hooks": {
    "UserPromptSubmit": [{
      "name": "inject-git-context",
      "hooks": [{
        "type": "command",
        "command": "echo \"当前分支: $(git branch --show-current)\n最近提交: $(git log -1 --oneline)\""
      }]
    }]
  }
}
```

## 17.8 `/hooks` 命令

```
/hooks           # 显示 Hooks 状态
/hooks status    # 显示状态和统计
/hooks list      # 列出所有配置
```

**输出示例**：

```
## 🪝 Hooks 状态

| 属性 | 值 |
|------|-----|
| 状态 | ✅ 启用 |
| 已配置 Hooks | 5 个 |
| 事件类型 | 3 种 |

### 📊 按事件统计

- **PreToolUse**: 2 个
- **PostToolUse**: 2 个
- **UserPromptSubmit**: 1 个
```

## 17.9 测试方法

### 1. 创建测试配置

```bash
mkdir -p ~/.clawdcode
cat > ~/.clawdcode/settings.json << 'EOF'
{
  "hooks": {
    "enabled": true,
    "UserPromptSubmit": [{
      "name": "test-hook",
      "hooks": [{
        "type": "command",
        "command": "echo '[Hook] User submitted a prompt'"
      }]
    }]
  }
}
EOF
```

### 2. 启动并验证

```bash
node dist/main.js --debug
```

### 3. 测试命令

```
/hooks           # 应显示 1 个 Hook
/hooks list      # 应显示 test-hook 配置
```

### 4. 清理

```bash
rm ~/.clawdcode/settings.json
```

## 17.10 ExecutionPipeline 集成

HookStage 和 PostHookStage 通过 **HookService** 调用对应的 Hooks，保持架构统一。

### HookStage（PreToolUse）

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

    // 处理 Hook 决策
    if (result.decision === 'deny') {
      execution.abort(result.reason || 'Hook blocked execution');
      return;
    }

    if (result.decision === 'ask') {
      execution._internal.needsConfirmation = true;
      return;
    }

    // 应用修改后的参数
    if (result.modifiedInput) {
      execution.params = { ...execution.params, ...result.modifiedInput };
    }
  }
}
```

### PostHookStage（PostToolUse）

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

## 17.11 HookService - 简洁 API 层

为避免在各处散落的 HookManager 调用，我们提供了 `HookService` 作为统一的 facade 层。**所有 Hook 调用都通过 HookService 管理**：

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

### 使用对比

**之前（繁琐）**：
```typescript
const hookManager = getHookManager();
if (hookManager.isInitialized() && hookManager.isEnabled()) {
  try {
    const result = await hookManager.executeUserPromptHooks(value, {
      sessionId,
      projectDir: process.cwd(),
      permissionMode: 'default',
    });
    if (result.injectedContext) {
      // 处理注入的上下文
    }
  } catch (e) {
    console.warn('Hook error:', e);
  }
}
```

**现在（简洁）**：
```typescript
const { onUserPromptSubmit } = await import('../../hooks/index.js');
const injectedContext = await onUserPromptSubmit(value, sessionId);
```

### Stage 使用示例

```typescript
// HookStage.ts - 工具执行前
import { onPreToolUse } from '../../../hooks/index.js';

const result = await onPreToolUse(tool.name, toolUseId, params, sessionId, projectDir);

// PostHookStage.ts - 工具执行后
import { onPostToolUse, onPostToolUseFailure } from '../../../hooks/index.js';

const hookResult = await onPostToolUse(tool.name, toolUseId, params, result, sessionId);
```

## 17.12 集成点总览

**所有 Hook 调用都统一通过 HookService**：

| Hook 类型 | 集成位置 | HookService 函数 | 说明 |
|-----------|----------|-----------------|------|
| **PreToolUse** | HookStage | `onPreToolUse` | 工具执行前，可阻止/修改参数 |
| **PostToolUse** | PostHookStage | `onPostToolUse` | 工具执行后，可注入上下文 |
| **PostToolUseFailure** | PostHookStage | `onPostToolUseFailure` | 工具失败后 |
| **PermissionRequest** | PermissionStage | `onPermissionRequest` | 权限请求时，可自动批准/拒绝 |
| **UserPromptSubmit** | ClawdInterface | `onUserPromptSubmit` | 用户发消息时，可注入上下文 |
| **SessionStart** | ClawdInterface | `onSessionStart` | 会话初始化后 |
| **SessionEnd** | ClawdInterface | `onSessionEnd` | 会话清理时 |
| **Compaction** | CompactionService | `onCompaction` | 压缩前，可阻止压缩 |
| **Stop** | Agent.executeLoop | `onStop` | Agent 停止时，可强制继续执行 |

## 17.13 新增/修改文件

| 文件 | 说明 |
|------|------|
| `src/hooks/types.ts` | 类型定义 |
| `src/hooks/Matcher.ts` | 匹配器 |
| `src/hooks/HookExecutor.ts` | 执行器 |
| `src/hooks/HookManager.ts` | 管理器 |
| `src/hooks/HookService.ts` | **简洁 API 层（新增）** |
| `src/hooks/index.ts` | 模块导出 |
| `src/tools/execution/stages/HookStage.ts` | PreToolUse 阶段 |
| `src/tools/execution/stages/PostHookStage.ts` | PostToolUse 阶段 |
| `src/tools/execution/stages/PermissionStage.ts` | PermissionRequest 集成 |
| `src/context/CompactionService.ts` | Compaction 集成 |
| `src/config/types.ts` | HookConfigSchema |

## 17.14 TODO

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
