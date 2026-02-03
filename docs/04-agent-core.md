# 第四章：Agent 核心架构与 Agentic Loop

> 本章实现 Agent 的核心架构，包括无状态设计、Agentic Loop 执行循环、消息管理等。

## 4.1 Agent 设计理念

### 4.1.1 无状态设计原则

ClawdCode 的 Agent 采用**无状态设计**（Stateless Design）：

```typescript
/**
 * Agent 核心类 - 无状态设计
 *
 * 设计原则：
 * 1. Agent 本身不保存任何会话状态（sessionId, messages 等）
 * 2. 所有状态通过 context 参数传入
 * 3. Agent 实例可以每次命令创建，用完即弃
 * 4. 历史连续性由外部 SessionContext 保证
 */
export class Agent {
  private config: AgentConfig;
  private isInitialized = false;
  // sessionId 已移除 - 改为从 context 参数传入
}
```

### 4.1.2 为什么选择无状态设计

| 方面 | 有状态 | 无状态 |
|------|--------|--------|
| 内存管理 | Agent 持有大量消息 | 消息由 Context 管理 |
| 并发安全 | 需要复杂锁机制 | 天然并发安全 |
| 测试难度 | 需要模拟状态 | 注入 Context 即可 |
| 生命周期 | 需要手动管理 | 用完即弃 |

### 4.1.3 状态流转模式

```
UI 组件 → 获取 sessionId, messages → Agent.create()
                                          ↓
                                  agent.chat(message, context)
                                          ↓
                                  context 包含 sessionId, messages
                                          ↓
                                  调用 LLM → 返回响应
                                          ↓
UI 组件 ← 返回结果 ← 更新 messages
```

## 4.2 Agent 类结构

### 4.2.1 类定义

```typescript
export class Agent {
  // 配置（只读）
  private config: AgentConfig;
  
  // 初始化状态
  private isInitialized = false;
  
  // 核心组件
  private chatService: IChatService;

  constructor(config: AgentConfig) {
    this.config = config;
  }
}
```

### 4.2.2 核心组件关系

```
Agent
  ├── ChatService (LLM 通信)
  ├── ExecutionPipeline (工具执行) [第 7 章]
  ├── ToolRegistry (工具注册表) [第 6 章]
  └── CompactionService (上下文压缩) [第 8 章]
```

### 4.2.3 静态工厂方法

```typescript
static async create(options: AgentOptions = {}): Promise<Agent> {
  // 1. 获取配置
  const config = getConfig();
  if (!config) {
    throw new Error('❌ 配置未初始化');
  }

  // 2. 创建并初始化 Agent
  const agent = new Agent(config, options);
  await agent.initialize();

  return agent;
}
```

### 4.2.4 初始化流程

```typescript
public async initialize(): Promise<void> {
  if (this.isInitialized) return;

  // 1. 初始化系统提示
  await this.initializeSystemPrompt();

  // 2. 注册内置工具 [第 6 章]
  // await this.registerBuiltinTools();

  // 3. 创建 ChatService
  this.chatService = createChatService(this.config);

  this.isInitialized = true;
}
```

## 4.3 Agentic Loop 详解

### 4.3.1 执行循环入口

`chat` 方法是 Agent 的主要入口点：

```typescript
public async chat(
  message: string,
  context?: ChatContext,
  options?: LoopOptions
): Promise<string> {
  if (!this.isInitialized) {
    throw new Error('Agent 未初始化');
  }

  // 根据模式选择执行路径
  const result = await this.executeLoop(message, context, options);

  if (!result.success) {
    throw new Error(result.error?.message || '执行失败');
  }

  return result.finalMessage || '';
}
```

### 4.3.2 核心执行循环

```typescript
private async executeLoop(
  message: string,
  context: ChatContext,
  options?: LoopOptions
): Promise<LoopResult> {
  // === 1. 准备阶段 ===
  const messages: Message[] = [];
  if (this.systemPrompt) {
    messages.push({ role: 'system', content: this.systemPrompt });
  }
  messages.push(...context.messages);
  messages.push({ role: 'user', content: message });

  // === 2. 循环配置 ===
  const TURN_LIMIT = 100;
  const maxTurns = options?.maxTurns ?? TURN_LIMIT;
  let turnsCount = 0;

  // === 3. 核心循环 ===
  while (true) {
    // 3.1 检查中断信号
    if (options?.signal?.aborted) {
      return { success: false, error: { type: 'aborted' } };
    }

    // 3.2 轮次计数
    turnsCount++;

    // 3.3 调用 LLM
    const response = await this.chatService.chat(messages, tools);

    // 3.4 检查是否完成（无工具调用）
    if (!response.toolCalls || response.toolCalls.length === 0) {
      return {
        success: true,
        finalMessage: response.content,
      };
    }

    // 3.5 执行工具调用
    for (const toolCall of response.toolCalls) {
      const result = await this.executeToolCall(toolCall);
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: result.content,
      });
    }

    // 3.6 检查轮次上限
    if (turnsCount >= maxTurns) {
      return {
        success: false,
        error: { type: 'max_turns_exceeded' },
      };
    }
  }
}
```

### 4.3.3 执行循环流程图

```
开始 → 准备工具列表、消息历史
         ↓
    ┌─→ 检查中断？ ─是→ 返回中止
    │        ↓否
    │   轮次 +1
    │        ↓
    │   调用 LLM
    │        ↓
    │   有工具调用？ ─否→ 返回最终响应
    │        ↓是
    │   执行工具
    │        ↓
    │   添加 tool 结果到消息历史
    │        ↓
    │   达到轮次上限？ ─是→ 返回错误
    │        ↓否
    └────────┘
```

## 4.4 消息格式与工具调用

### 4.4.1 消息类型

```typescript
export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];      // assistant 消息专用
  tool_call_id?: string;        // tool 消息专用
  name?: string;                // tool 消息专用
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;  // JSON 字符串
  };
}
```

### 4.4.2 消息序列示例

```json
[
  { "role": "system", "content": "You are a helpful coding assistant..." },
  { "role": "user", "content": "读取 package.json 文件" },
  {
    "role": "assistant",
    "content": "让我读取 package.json 文件的内容。",
    "tool_calls": [{
      "id": "call_abc123",
      "type": "function",
      "function": { "name": "Read", "arguments": "{\"file_path\": \"package.json\"}" }
    }]
  },
  {
    "role": "tool",
    "tool_call_id": "call_abc123",
    "name": "Read",
    "content": "{ \"name\": \"my-project\", \"version\": \"1.0.0\" }"
  },
  { "role": "assistant", "content": "package.json 的内容如上所示..." }
]
```

## 4.5 循环控制机制

### 4.5.1 轮次限制

```typescript
// 配置优先级
const configuredMaxTurns =
  options?.maxTurns ??        // 1. 调用参数
  this.config.maxTurns ??     // 2. 配置文件
  -1;                         // 3. 默认值（无限）

// 硬性安全上限
const TURN_LIMIT = 100;

// 实际生效限制
const maxTurns = configuredMaxTurns === -1
  ? TURN_LIMIT
  : Math.min(configuredMaxTurns, TURN_LIMIT);
```

| maxTurns 值 | 行为 |
|-------------|------|
| -1 | 无限循环，但在 100 轮时暂停询问 |
| 0 | 禁用对话功能 |
| N > 0 | 最多 N 轮 |

### 4.5.2 中断信号处理

```typescript
// 检查点 1：循环开始前
if (options?.signal?.aborted) {
  return { success: false, error: { type: 'aborted' } };
}

// 检查点 2：LLM 调用后
if (options?.signal?.aborted) { ... }

// 检查点 3：工具执行后
if (options?.signal?.aborted) { ... }
```

### 4.5.3 意图未完成检测

```typescript
const INCOMPLETE_INTENT_PATTERNS = [
  /：\s*$/,                      // 中文冒号结尾
  /:\s*$/,                       // 英文冒号结尾
  /让我(先|来|开始|查看|检查)/,   // 中文意图词
  /Let me (first|start|check)/i, // 英文意图词
];

// 检测到未完成意图时，添加重试提示
if (isIncompleteIntent && retries < 2) {
  messages.push({
    role: 'user',
    content: '请执行你提到的操作，不要只是描述。'
  });
  continue;
}
```

## 4.6 本章实现

本章实现了以下功能：

1. **Agent 类型定义** (`src/agent/types.ts`)
   - `Message`, `ToolCall` 消息类型
   - `ChatContext`, `LoopResult` 上下文类型
   - `AgentConfig`, `AgentOptions` 配置类型

2. **Agent 核心类** (`src/agent/Agent.ts`)
   - 无状态设计
   - 静态工厂方法 `create()`
   - `chat()` 入口方法
   - `executeLoop()` 核心循环

3. **ChatService 接口** (`src/services/ChatService.ts`)
   - `IChatService` 接口定义
   - `OpenAIChatService` 实现

---

## TODO（待后续章节实现）

| 功能 | 依赖 | 计划章节 |
|------|------|----------|
| `registerBuiltinTools` | ToolRegistry | 第 6 章 |
| `ExecutionPipeline` | 工具执行管道 | 第 7 章 |
| `checkAndCompact` | CompactionService | 第 8 章 |
| Plan 模式 | PLAN_MODE_SYSTEM_PROMPT | 第 5 章 |
| @ 文件提及 | AttachmentCollector | 第 6 章 |

---

## 技术亮点

### 1. 无状态 Agent 设计

```typescript
// Agent 不持有状态，所有状态通过 context 传入
agent.chat(message, { sessionId, messages });
```

**为什么**：简单可靠、天然并发安全、便于测试、用完即弃。

### 2. 静态工厂方法

```typescript
// 使用工厂方法而非直接 new
const agent = await Agent.create(options);
```

**为什么**：
- 确保异步初始化完成
- 集中配置验证逻辑
- 未来可扩展为单例或对象池

### 3. 消息历史注入模式

```typescript
// UI 负责维护消息历史，Agent 只负责处理
const result = await agent.chat(message, {
  messages: sessionState.messages,  // 外部维护的历史
  sessionId: sessionState.id,
});
// 处理完成后，UI 更新 sessionState.messages
```

**为什么**：职责分离，Agent 专注于 LLM 交互，状态管理由外部负责。

### 4. 轮次限制 + 硬性上限

```typescript
const TURN_LIMIT = 100;  // 硬性上限，防止无限循环
const maxTurns = Math.min(configuredMaxTurns, TURN_LIMIT);
```

**为什么**：双保险机制，即使配置错误也不会无限循环。

### 5. 意图未完成检测

```typescript
// 检测 "让我来..." 但没有实际工具调用的情况
if (isIncompleteIntent && !hasToolCalls) {
  messages.push({ role: 'user', content: '请执行操作' });
}
```

**为什么**：某些模型会"说要做"但不实际调用工具，自动重试提高成功率。

### 6. AbortSignal 多点检查

```typescript
// 在每个关键节点检查中断信号
if (signal?.aborted) return;
```

**为什么**：用户按 Ctrl+C 时能立即响应，不会继续执行不必要的操作。
