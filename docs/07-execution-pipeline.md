# 第七章：执行管道与权限控制

> 如果说工具是 Agent 的"手脚"，那么执行管道就是它的"中枢神经系统"。它确保了 Agent 的每一次行动都是有组织、有纪律、可预测的过程。

## 7.1 执行管道概述

### 7.1.1 为什么需要执行管道

工具的执行至少要处理三个彼此独立但又至关重要的问题：

| 关注点 | 问题 | 解决方案 |
|--------|------|----------|
| **安全与信任** | Agent 能否被信任？如何确保不会执行危险操作？ | Permission（权限检查）、Confirmation（用户确认） |
| **灵活性与扩展性** | 如何方便地增加新工具？ | Discovery（工具发现）、Hook（钩子） |
| **一致性与健壮性** | 如何确保所有工具的输入输出都符合预期？ | Validation（参数验证）、Formatting（结果格式化） |

### 7.1.2 七阶段管道

```
工具调用请求 → Discovery → Permission → Hook/Pre → Confirmation → Execution → Hook/Post → Formatting → 返回结果
```

| 阶段 | 职责 |
|------|------|
| 1. Discovery | 从注册表查找工具 |
| 2. Permission | 参数验证 + 权限规则检查 + 敏感文件检测 |
| 3. Hook (Pre) | 执行 PreToolUse Hooks |
| 4. Confirmation | 危险操作请求用户确认 |
| 5. Execution | 实际执行工具 |
| 6. Hook (Post) | 执行 PostToolUse Hooks |
| 7. Formatting | 统一结果格式、添加元数据 |

### 7.1.3 目录结构

```
src/tools/
├── execution/                # 执行管道
│   ├── types.ts              # 类型定义
│   ├── ExecutionPipeline.ts  # 主管道类
│   ├── stages/               # 七个执行阶段
│   │   ├── DiscoveryStage.ts
│   │   ├── PermissionStage.ts
│   │   ├── HookStage.ts
│   │   ├── ConfirmationStage.ts
│   │   ├── ExecutionStage.ts
│   │   ├── PostHookStage.ts
│   │   ├── FormattingStage.ts
│   │   └── index.ts
│   └── index.ts
├── validation/               # 验证工具
│   ├── PermissionChecker.ts
│   └── SensitiveFileDetector.ts
└── ...
```

## 7.2 核心类型定义

### 7.2.1 执行上下文

```typescript
// src/tools/execution/types.ts

export interface ExecutionContext {
  sessionId: string;
  workspaceRoot: string;
  permissionMode: PermissionMode;
  signal?: AbortSignal;
  onProgress?: (progress: ToolProgress) => void;
  confirmationHandler?: ConfirmationHandler;
  messageId?: string;
}
```

### 7.2.2 工具执行实例

```typescript
export interface ToolExecution {
  toolName: string;
  params: Record<string, unknown>;
  context: ExecutionContext;
  
  // 内部状态
  _internal: {
    tool?: Tool;
    invocation?: ToolInvocation;
    needsConfirmation?: boolean;
    confirmationReason?: string;
    permissionSignature?: string;
    hookToolUseId?: string;
  };
  
  // 方法
  abort(reason: string): void;
  setResult(result: ToolResult): void;
  getResult(): ToolResult | undefined;
}
```

### 7.2.3 管道阶段接口

```typescript
export interface PipelineStage {
  readonly name: string;
  process(execution: ToolExecution): Promise<void>;
}
```

### 7.2.4 权限模式

```typescript
export enum PermissionMode {
  DEFAULT = 'default',      // 默认模式：写操作需确认
  AUTO_EDIT = 'autoEdit',   // 自动批准编辑
  YOLO = 'yolo',            // 自动批准所有
  PLAN = 'plan',            // 只读调研模式
}
```

**模式行为对比**：

| 模式 | ReadOnly 工具 | Write 工具 | Execute 工具 |
|------|---------------|------------|--------------|
| DEFAULT | ✅ 自动批准 | ❓ 需确认 | ❓ 需确认 |
| AUTO_EDIT | ✅ 自动批准 | ✅ 自动批准 | ❓ 需确认 |
| YOLO | ✅ 自动批准 | ✅ 自动批准 | ✅ 自动批准 |
| PLAN | ✅ 自动批准 | ❌ 拒绝 | ❌ 拒绝 |

### 7.2.5 权限检查结果

```typescript
export enum PermissionResult {
  ALLOW = 'allow',
  ASK = 'ask',
  DENY = 'deny',
}

export interface PermissionCheckResult {
  result: PermissionResult;
  matchedRule?: string;
  reason?: string;
}
```

## 7.3 七阶段详解

### 7.3.1 Stage 1: Discovery（工具发现）

从注册表中查找工具：

```typescript
// src/tools/execution/stages/DiscoveryStage.ts

export class DiscoveryStage implements PipelineStage {
  readonly name = 'discovery';

  constructor(private registry: ToolRegistry) {}

  async process(execution: ToolExecution): Promise<void> {
    const tool = this.registry.get(execution.toolName);

    if (!tool) {
      execution.abort(`Tool "${execution.toolName}" not found`);
      return;
    }

    execution._internal.tool = tool;
  }
}
```

### 7.3.2 Stage 2: Permission（权限检查）

最复杂的阶段，包含：

1. **参数验证**：Zod Schema 验证
2. **权限规则检查**：allow/ask/deny 规则
3. **权限模式覆盖**：根据模式调整行为
4. **敏感文件检测**：检查危险路径

```typescript
// src/tools/execution/stages/PermissionStage.ts

export class PermissionStage implements PipelineStage {
  readonly name = 'permission';

  async process(execution: ToolExecution): Promise<void> {
    const tool = execution._internal.tool!;

    // 1. 创建工具调用实例（含 Zod 验证）
    const invocation = tool.build(execution.params);
    execution._internal.invocation = invocation;

    // 2. 构建权限签名
    const signature = this.buildSignature(tool.name, execution.params);
    execution._internal.permissionSignature = signature;

    // 3. 执行权限检查
    let checkResult = this.permissionChecker.check({
      toolName: tool.name,
      params: execution.params,
      tool,
    });

    // 4. 应用权限模式覆盖
    checkResult = this.applyModeOverrides(tool.kind, checkResult, execution.context.permissionMode);

    // 5. 根据结果采取行动
    switch (checkResult.result) {
      case PermissionResult.DENY:
        execution.abort(checkResult.reason || 'Permission denied');
        return;

      case PermissionResult.ASK:
        execution._internal.needsConfirmation = true;
        execution._internal.confirmationReason = checkResult.reason;
        break;
    }

    // 6. 额外安全检查：敏感文件
    this.checkSensitiveFiles(execution);
  }
}
```

### 7.3.3 Stage 3: Hook (Pre)

执行 PreToolUse Hooks，支持三种决策：

```typescript
// src/tools/execution/stages/HookStage.ts

export class HookStage implements PipelineStage {
  readonly name = 'hook';

  async process(execution: ToolExecution): Promise<void> {
    const hookManager = HookManager.getInstance();
    
    if (!hookManager.isEnabled()) {
      return;
    }

    const result = await hookManager.executePreToolHooks(
      execution.toolName,
      execution._internal.hookToolUseId!,
      execution.params,
      { ... }
    );

    switch (result.decision) {
      case 'deny':
        execution.abort(result.reason || 'Hook blocked execution');
        return;
      case 'ask':
        execution._internal.needsConfirmation = true;
        execution._internal.confirmationReason = result.reason;
        break;
      case 'allow':
        // 应用修改后的参数
        if (result.modifiedInput) {
          execution.params = { ...execution.params, ...result.modifiedInput };
        }
        break;
    }
  }
}
```

**Hook 决策流转**：

| 决策 | 行为 | 后续阶段影响 |
|------|------|--------------|
| `allow` | 继续执行，可修改参数 | 正常进入 Confirmation 阶段 |
| `ask` | 标记需要确认 | Confirmation 阶段强制弹出确认 |
| `deny` | 立即中止 | 不进入后续阶段 |

### 7.3.4 Stage 4: Confirmation（用户确认）

请求用户确认危险操作。确认对话框**内联渲染**在输入框上方，不中断消息列表的浏览。

```typescript
// src/tools/execution/stages/ConfirmationStage.ts

export class ConfirmationStage implements PipelineStage {
  readonly name = 'confirmation';

  async process(execution: ToolExecution): Promise<void> {
    if (!execution._internal.needsConfirmation) {
      return;
    }

    const handler = execution.context.confirmationHandler;
    if (!handler) {
      // 无确认处理器，默认拒绝
      execution.abort('No confirmation handler available');
      return;
    }

    const response = await handler.requestConfirmation({
      title: `权限确认: ${execution.toolName}`,
      message: execution._internal.confirmationReason!,
      details: this.generatePreview(execution),
      affectedFiles: this.getAffectedPaths(execution),
    });

    if (!response.approved) {
      execution.abort(`User rejected: ${response.reason}`);
      return;
    }

    // 记住此决定
    if (response.scope === 'session') {
      this.sessionApprovals.add(execution._internal.permissionSignature!);
    }
  }
}
```

#### 用户拒绝后的行为

当用户在确认对话框中选择 **deny** 时，Agent 循环会**立即终止**，不再继续思考或执行后续工具调用：

```typescript
// Agent.ts executeLoop 中
const result = await this.executeToolCall(toolCall, context);

// 用户拒绝 → 立即退出循环
if (!result.success && result.error?.includes('User rejected')) {
  return { success: true, metadata: { turnsCount, toolCallsCount } };
}
```

#### 连续失败检测

Agent 还内置了连续工具失败检测（`MAX_CONSECUTIVE_FAILURES = 3`）。当同一工具连续失败 3 次后，会注入系统消息提醒 LLM 停止重试：

```typescript
if (consecutiveToolFailures >= MAX_CONSECUTIVE_FAILURES) {
  messages.push({
    role: 'system',
    content: 'Multiple tool calls have failed. Stop retrying and inform the user.',
  });
}
```

### 7.3.5 Stage 5: Execution（实际执行）

执行工具：

```typescript
// src/tools/execution/stages/ExecutionStage.ts

export class ExecutionStage implements PipelineStage {
  readonly name = 'execution';

  async process(execution: ToolExecution): Promise<void> {
    const tool = execution._internal.tool!;

    try {
      const result = await tool.execute(execution.params, execution.context);
      execution.setResult(result);
    } catch (error) {
      execution.abort(`Tool execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
```

### 7.3.6 Stage 6: Hook (Post)

执行 PostToolUse Hooks：

```typescript
// src/tools/execution/stages/PostHookStage.ts

export class PostHookStage implements PipelineStage {
  readonly name = 'postHook';

  async process(execution: ToolExecution): Promise<void> {
    const hookManager = HookManager.getInstance();
    
    await hookManager.executePostToolUseHooks({
      toolName: execution.toolName,
      params: execution.params,
      result: execution.getResult(),
      context: execution.context,
    });
  }
}
```

### 7.3.7 Stage 7: Formatting（结果格式化）

统一结果格式：

```typescript
// src/tools/execution/stages/FormattingStage.ts

export class FormattingStage implements PipelineStage {
  readonly name = 'formatting';

  async process(execution: ToolExecution): Promise<void> {
    const result = execution.getResult();
    if (!result) return;

    // 确保格式正确
    if (!result.llmContent) {
      result.llmContent = 'Execution completed';
    }
    if (!result.displayContent) {
      result.displayContent = result.success ? '执行成功' : '执行失败';
    }

    // 添加元数据
    result.metadata = {
      ...result.metadata,
      executionId: execution.context.sessionId,
      toolName: execution.toolName,
      timestamp: Date.now(),
    };

    execution.setResult(result);
  }
}
```

## 7.4 权限规则配置

### 7.4.1 规则格式

在 `settings.json` 中配置权限规则：

```json
{
  "permissions": {
    "allow": [
      "Read(**/*.ts)",
      "Glob(**/*)",
      "Bash(npm:*)",
      "Bash(git status)"
    ],
    "deny": [
      "Bash(rm -rf:*)",
      "Write(/etc/*)"
    ],
    "ask": []
  }
}
```

### 7.4.2 规则匹配模式

```typescript
// 1. 精确匹配
"Bash(npm test)"              // 只匹配 "npm test"

// 2. 前缀通配符
"Bash(npm:*)"                 // 匹配所有 "npm ..." 命令

// 3. Glob 模式
"Read(**/*.ts)"               // 匹配所有 .ts 文件
"Write(src/**/*)"             // 匹配 src 目录下所有文件

// 4. 工具级别
"Read"                        // 匹配所有 Read 调用
```

### 7.4.3 PermissionChecker

```typescript
// src/tools/validation/PermissionChecker.ts

export class PermissionChecker {
  private config: PermissionConfig;

  check(descriptor: ToolInvocationDescriptor): PermissionCheckResult {
    const signature = PermissionChecker.buildSignature(descriptor);

    // 1. 检查 deny 规则（优先级最高）
    for (const rule of this.config.deny) {
      if (this.matchesRule(signature, rule)) {
        return { result: PermissionResult.DENY, matchedRule: rule };
      }
    }

    // 2. 检查 allow 规则
    for (const rule of this.config.allow) {
      if (this.matchesRule(signature, rule)) {
        return { result: PermissionResult.ALLOW, matchedRule: rule };
      }
    }

    // 3. 检查 ask 规则
    for (const rule of this.config.ask) {
      if (this.matchesRule(signature, rule)) {
        return { result: PermissionResult.ASK, matchedRule: rule };
      }
    }

    // 4. 默认 ASK
    return { result: PermissionResult.ASK, matchedRule: 'default' };
  }

  static buildSignature(descriptor: ToolInvocationDescriptor): string {
    const { toolName, params, tool } = descriptor;
    
    // 使用工具的 extractSignatureContent 方法（如果存在）
    if (tool?.extractSignatureContent) {
      return `${toolName}(${tool.extractSignatureContent(params)})`;
    }
    
    return toolName;
  }
}
```

**什么是权限签名？**

权限签名是将结构化的工具调用转换成可匹配的字符串，用于和配置的权限规则进行匹配：

```
工具调用 → 签名 → 匹配规则

{ toolName: "Bash", params: { command: "npm install" } }
       ↓
  "Bash(npm install)"
       ↓
  匹配规则 "Bash(npm:*)" → ✅ ALLOW
```

**签名格式**：`工具名(关键参数内容)`

| 工具 | 参数 | 签名 |
|------|------|------|
| Bash | `{ command: "npm test" }` | `Bash(npm test)` |
| Read | `{ file_path: "/src/main.ts" }` | `Read(/src/main.ts)` |
| Write | `{ file_path: "/etc/passwd" }` | `Write(/etc/passwd)` |

**为什么只提取"关键参数"？** 不是所有参数都影响安全性。比如 Bash 的 `timeout` 参数不重要，但 `command` 决定了是否危险。

### 7.4.4 优先级说明

```
优先级从高到低：
1. YOLO 模式（无条件批准）
2. PLAN 模式拒绝规则
3. 配置的 DENY 规则
4. 配置的 ALLOW 规则
5. 权限模式规则（DEFAULT/AUTO_EDIT）
6. 默认 ASK
```

## 7.5 敏感文件检测

### 7.5.1 敏感级别

```typescript
// src/tools/validation/SensitiveFileDetector.ts

export enum SensitivityLevel {
  LOW = 'low',       // 低敏感：配置文件
  MEDIUM = 'medium', // 中敏感：数据库、日志
  HIGH = 'high',     // 高敏感：密钥、凭证
}
```

### 7.5.2 检测规则

```typescript
export class SensitiveFileDetector {
  private static readonly SENSITIVE_PATTERNS = [
    // 高敏感
    { pattern: /\.env$/, level: SensitivityLevel.HIGH, reason: '环境变量文件可能包含密钥' },
    { pattern: /credentials?\.json$/, level: SensitivityLevel.HIGH, reason: '凭证文件' },
    { pattern: /\.pem$/, level: SensitivityLevel.HIGH, reason: '私钥文件' },
    { pattern: /id_rsa/, level: SensitivityLevel.HIGH, reason: 'SSH 私钥' },

    // 中敏感
    { pattern: /\.sqlite$/, level: SensitivityLevel.MEDIUM, reason: '数据库文件' },
    { pattern: /\.log$/, level: SensitivityLevel.MEDIUM, reason: '日志文件可能包含敏感信息' },

    // 低敏感
    { pattern: /config\.json$/, level: SensitivityLevel.LOW, reason: '配置文件' },
  ];

  static check(filePath: string): SensitivityResult {
    for (const rule of this.SENSITIVE_PATTERNS) {
      if (rule.pattern.test(filePath)) {
        return { sensitive: true, level: rule.level, reason: rule.reason };
      }
    }
    return { sensitive: false };
  }
}
```

### 7.5.3 敏感文件处理策略

| 敏感级别 | 处理策略 |
|----------|----------|
| HIGH | 直接拒绝（除非显式 allow） |
| MEDIUM | 强制用户确认 |
| LOW | 正常流程（根据权限模式） |

## 7.6 确认机制

### 7.6.1 确认处理器接口

```typescript
// src/tools/execution/types.ts

export interface ConfirmationHandler {
  requestConfirmation(details: ConfirmationDetails): Promise<ConfirmationResponse>;
}

export interface ConfirmationDetails {
  title: string;
  message: string;
  details?: string;          // 操作预览
  risks?: string[];          // 风险列表
  affectedFiles?: string[];  // 受影响的文件
}

export interface ConfirmationResponse {
  approved: boolean;
  reason?: string;
  scope?: 'once' | 'session';  // 批准范围
}
```

### 7.6.2 UI 确认组件

确认对话框采用极简风格，**内联在输入框上方**显示，不弹出模态框：

```
? Bash · No matching rule, requires confirmation
  Command: npm install --save-dev typescript
  This operation will execute system commands

  > allow  (y)
    always  (a)
    deny  (n)
```

**核心设计**：
- 标题行显示工具名 + 确认原因
- 高亮展示命令/文件路径（使用 accent color）
- 上下箭头选择 + `y`/`a`/`n` 快捷键
- 焦点管理使用同步切换，避免与输入框键盘冲突

```typescript
// ConfirmationPrompt 选项布局
options.map((opt, i) => (
  <Box key={opt.value}>
    <Text color={i === selected ? theme.colors.success : theme.colors.text.muted}>
      {i === selected ? '> ' : '  '}{opt.label}
    </Text>
    <Text dimColor>  ({opt.hotkey})</Text>
  </Box>
))
```

**焦点同步**：`useConfirmation` hook 在 `showConfirmation()` 和 `handleResponse()` 中**同步调用** `focusActions.setFocus()`，在 React 调度渲染之前生效，避免 `useInput` 竞态。

## 7.7 ExecutionPipeline 主类

```typescript
// src/tools/execution/ExecutionPipeline.ts

export class ExecutionPipeline extends EventEmitter {
  private stages: PipelineStage[];
  private executionHistory: ExecutionHistoryEntry[] = [];
  private readonly sessionApprovals = new Set<string>();

  constructor(
    private registry: ToolRegistry,
    config: ExecutionPipelineConfig = {}
  ) {
    super();

    this.stages = [
      new DiscoveryStage(this.registry),
      new PermissionStage(config.permissions, this.sessionApprovals),
      new HookStage(),
      new ConfirmationStage(this.sessionApprovals),
      new ExecutionStage(),
      new PostHookStage(),
      new FormattingStage(),
    ];
  }

  async execute(
    toolName: string,
    params: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ToolResult> {
    // 创建执行实例
    const execution = this.createExecution(toolName, params, context);

    // 依次执行各阶段
    for (const stage of this.stages) {
      if (execution.isAborted()) {
        break;
      }

      this.emit('stageStart', { stage: stage.name, execution });
      await stage.process(execution);
      this.emit('stageComplete', { stage: stage.name, execution });
    }

    // 记录执行历史
    this.recordExecution(execution);

    // 返回结果
    return execution.getResult() || this.createErrorResult(execution);
  }

  getRegistry(): ToolRegistry {
    return this.registry;
  }
}
```

## 7.8 集成到 Agent

### 7.8.1 Agent 使用 ExecutionPipeline

```typescript
// src/agent/Agent.ts

export class Agent {
  private executionPipeline: ExecutionPipeline;

  constructor(config: AgentConfig, pipeline?: ExecutionPipeline) {
    this.executionPipeline = pipeline || this.createDefaultPipeline();
  }

  private async executeToolCall(
    toolCall: ToolCall,
    context: ChatContext
  ): Promise<ToolResult> {
    return this.executionPipeline.execute(
      toolCall.name,
      toolCall.arguments,
      {
        sessionId: context.sessionId,
        workspaceRoot: context.workspaceRoot,
        permissionMode: context.permissionMode,
        signal: context.signal,
        confirmationHandler: context.confirmationHandler,
      }
    );
  }
}
```

## 7.9 执行流程图

```
┌─────────────────────────────────────────────────────────────────┐
│                        工具调用请求                              │
└─────────────────────────┬───────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. Discovery                                                    │
│  ├─ 查找工具                                                     │
│  └─ 找不到 → 中止                                                │
└─────────────────────────┬───────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. Permission                                                   │
│  ├─ Zod 参数验证                                                 │
│  ├─ 构建权限签名                                                 │
│  ├─ 检查 deny 规则 → 匹配则中止                                   │
│  ├─ 检查 allow 规则                                              │
│  ├─ 应用模式覆盖                                                 │
│  └─ 检查敏感文件                                                 │
└─────────────────────────┬───────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. Hook (Pre)                                                   │
│  ├─ 执行 PreToolUse Hooks                                        │
│  ├─ deny → 中止                                                  │
│  └─ ask → 标记需确认                                             │
└─────────────────────────┬───────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. Confirmation                                                 │
│  ├─ 不需要确认 → 跳过                                            │
│  ├─ 请求用户确认                                                 │
│  ├─ 用户拒绝 → 中止                                              │
│  └─ 用户批准 → 继续（可记住决定）                                 │
└─────────────────────────┬───────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. Execution                                                    │
│  ├─ 执行工具                                                     │
│  └─ 捕获错误                                                     │
└─────────────────────────┬───────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  6. Hook (Post)                                                  │
│  └─ 执行 PostToolUse Hooks                                       │
└─────────────────────────┬───────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  7. Formatting                                                   │
│  ├─ 格式化结果                                                   │
│  └─ 添加元数据                                                   │
└─────────────────────────┬───────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                        返回结果                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7.10 测试方法

### 运行测试

```bash
bun run test:pipeline
```

### 预期输出

```
=== 执行管道测试 ===

1. 基础工具执行
   Read 工具: ✅ 成功
   Glob 工具: ✅ 成功

2. 权限检查
   只读工具（DEFAULT 模式）: ✅ 自动批准
   写入工具（DEFAULT 模式）: ✅ 需要确认
   写入工具（AUTO_EDIT 模式）: ✅ 自动批准
   写入工具（PLAN 模式）: ✅ 被拒绝

3. 敏感文件检测
   .env 文件: ✅ 高敏感，拒绝
   .log 文件: ✅ 中敏感，需确认

4. 权限规则
   allow 规则匹配: ✅
   deny 规则匹配: ✅

5. 会话记忆
   批准并记住: ✅ 后续自动批准

=== 测试完成 ===
```

---

## 技术亮点

### 1. 七阶段管道分离关注点

```
Discovery → Permission → Hook → Confirmation → Execution → PostHook → Formatting
```

**为什么**：每个阶段只关注一件事，易于测试、维护和扩展。

### 2. 权限模式覆盖机制

```typescript
// 优先级：YOLO > PLAN > DENY 规则 > ALLOW 规则 > 模式规则 > 默认 ASK
checkResult = this.applyModeOverrides(tool.kind, checkResult, permissionMode);
```

**为什么**：既保留规则灵活性，又提供便捷的模式切换。

### 3. 敏感文件分级检测

```typescript
enum SensitivityLevel { LOW, MEDIUM, HIGH }
// HIGH → 拒绝, MEDIUM → 确认, LOW → 正常流程
```

**为什么**：不同敏感级别需要不同处理策略，避免"一刀切"。

### 4. Hook 三决策模式

```typescript
result.decision: 'allow' | 'ask' | 'deny'
```

**为什么**：Hook 可以放行、要求确认或直接拒绝，覆盖所有安全场景。

### 5. 会话级批准记忆

```typescript
if (response.scope === 'session') {
  this.sessionApprovals.add(signature);
}
```

**为什么**：避免重复确认相同操作，提升用户体验。

---

## 常见问题

### Q1: 为什么需要七个阶段而不是更少？

每个阶段有独立职责，便于：
- **测试**：可以单独测试每个阶段
- **扩展**：可以轻松添加新阶段
- **调试**：可以追踪问题发生在哪个阶段
- **复用**：阶段可以被不同管道复用

### Q2: YOLO 模式是否安全？

YOLO 模式设计用于：
- 受信任的开发环境
- 自动化脚本执行
- 快速原型开发

**不建议**在生产环境或处理敏感数据时使用。

### Q3: 如何自定义权限规则？

在 `~/.clawdcode/settings.json` 中配置：

```json
{
  "permissions": {
    "allow": ["Bash(npm:*)"],
    "deny": ["Bash(rm -rf:*)"]
  }
}
```

### Q4: Hook 和 Permission 有什么区别？

| 特性 | Permission | Hook |
|------|------------|------|
| 配置方式 | 规则字符串 | 可执行代码 |
| 灵活性 | 模式匹配 | 完全可编程 |
| 用途 | 静态权限控制 | 动态逻辑注入 |
