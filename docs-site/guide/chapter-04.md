# 第四章：Agent 核心与 Agentic Loop

> **学习目标**：实现 Agent 核心类和 Agentic Loop 执行循环
> 
> **预计阅读时间**：45 分钟
> 
> **实践时间**：60 分钟
> 
> **前置要求**：已完成第三章的代码实现

---

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
  // 注意：没有 sessionId 或 messages 成员变量
}
```

### 4.1.2 为什么选择无状态设计

| 方面 | 有状态 Agent | 无状态 Agent |
|------|-------------|-------------|
| **内存管理** | Agent 持有大量消息历史 | 消息由外部 Context 管理 |
| **并发安全** | 需要复杂的锁机制 | 天然并发安全 |
| **测试难度** | 需要模拟和清理状态 | 注入 Context 即可测试 |
| **生命周期** | 需要手动管理 | 用完即弃 |
| **代码复杂度** | 高（状态同步问题） | 低（纯函数式风格） |

### 4.1.3 状态流转模式

```
UI 组件
    │
    ├─ 维护 sessionId, messages
    │
    ▼
Agent.create(config)
    │
    ▼
agent.chat(message, context)
    │                    │
    │ context = {        │
    │   sessionId,       │
    │   messages,        │
    │   permissionMode,  │
    │   signal,          │
    │ }                  │
    │                    │
    ▼                    │
调用 LLM → 返回响应 ────────┘
    │
    ▼
UI 组件 ← 更新 messages
```

**关键点**：Agent 只负责处理，不负责存储。状态的维护责任在调用方（UI 组件）。

---

## 4.2 核心类型定义

### 4.2.1 扩展 Agent 类型

**文件位置**：`src/agent/types.ts`

在第二章的基础上，添加以下类型定义：

```typescript
// ========== 【第 4 章新增】循环选项与结果 ==========

/**
 * 循环选项
 * 
 * 控制 Agentic Loop 的行为和回调
 */
export interface LoopOptions {
  /** 最大轮次（-1 表示无限，但有硬性安全上限） */
  maxTurns?: number;
  
  /** 中断信号（用于取消执行） */
  signal?: AbortSignal;
  
  /** 轮次开始回调 */
  onTurnStart?: (info: { turn: number; maxTurns: number }) => void;
  
  /** 内容回调（流式或完整） */
  onContent?: (content: string) => void;
  
  /** 思考内容回调（推理模型如 DeepSeek R1） */
  onThinking?: (content: string) => void;
  
  /** 工具结果回调 */
  onToolResult?: (toolCall: ToolCall, result: ToolResult) => void;
  
  /** 轮次上限回调（询问是否继续） */
  onTurnLimitReached?: (info: { turnsCount: number }) => Promise<{ continue: boolean }>;
}

/**
 * 循环错误类型
 */
export type LoopErrorType = 
  | 'aborted'              // 用户中止
  | 'max_turns_exceeded'   // 超过轮次上限
  | 'chat_disabled'        // 对话功能禁用 (maxTurns = 0)
  | 'initialization_failed' // 初始化失败
  | 'llm_error'            // LLM 调用错误
  | 'tool_error';          // 工具执行错误

/**
 * 循环错误
 */
export interface LoopError {
  type: LoopErrorType;
  message?: string;
  cause?: Error;
}

/**
 * 循环结果
 */
export interface LoopResult {
  /** 是否成功完成 */
  success: boolean;
  
  /** 最终消息（成功时） */
  finalMessage?: string;
  
  /** 错误信息（失败时） */
  error?: LoopError;
  
  /** 元数据 */
  metadata?: {
    turnsCount: number;
    toolCallsCount: number;
    totalTokens?: number;
  };
}

// ========== 【第 4 章新增】工具类型 ==========

/**
 * 工具结果
 */
export interface ToolResult {
  success: boolean;
  displayContent?: string;  // 显示给用户的内容
  llmContent?: string;      // 发送给 LLM 的内容
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 工具定义（OpenAI 格式）
 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

// ========== 【第 4 章新增】ChatService 类型 ==========

/**
 * ChatService 响应
 */
export interface ChatResponse {
  content: string;
  reasoningContent?: string;  // 推理模型的思考过程
  toolCalls?: ToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * ChatService 接口
 */
export interface IChatService {
  chat(
    messages: Message[],
    tools?: ToolDefinition[],
    signal?: AbortSignal
  ): Promise<ChatResponse>;
}
```

**代码说明**：

| 类型 | 用途 |
|------|------|
| `LoopOptions` | 控制循环行为，提供回调钩子 |
| `LoopResult` | 循环执行结果，包含成功/失败状态和元数据 |
| `IChatService` | LLM 通信抽象接口，方便替换实现 |

---

## 4.3 ChatService 实现

### 4.3.1 创建 ChatService

**文件位置**：`src/services/ChatService.ts`

```typescript
/**
 * ChatService - LLM 通信服务
 * 
 * 封装与 LLM API 的通信，支持 OpenAI 兼容的所有服务
 */

import OpenAI from 'openai';
import type {
  Message,
  ToolDefinition,
  ChatResponse,
  IChatService,
} from '../agent/types.js';

// ========== 配置类型 ==========

export interface ChatServiceConfig {
  apiKey: string;
  baseURL?: string;
  model?: string;
  maxRetries?: number;
  timeout?: number;
}

// ========== OpenAI ChatService 实现 ==========

/**
 * OpenAI 兼容的 ChatService 实现
 * 
 * 支持所有 OpenAI 格式兼容的服务：
 * - OpenAI
 * - Azure OpenAI
 * - 火山引擎 Ark
 * - Deepseek
 * - 本地 Ollama
 */
export class OpenAIChatService implements IChatService {
  private client: OpenAI;
  private model: string;

  constructor(config: ChatServiceConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      maxRetries: config.maxRetries ?? 2,
      timeout: config.timeout ?? 60000,
    });
    this.model = config.model || 'gpt-4';
  }

  /**
   * 发送聊天请求
   */
  async chat(
    messages: Message[],
    tools?: ToolDefinition[],
    signal?: AbortSignal
  ): Promise<ChatResponse> {
    try {
      // 1. 转换消息格式
      const openaiMessages = messages.map(msg => this.convertMessage(msg));

      // 2. 构建请求参数
      const requestParams: OpenAI.ChatCompletionCreateParams = {
        model: this.model,
        messages: openaiMessages,
      };

      // 3. 添加工具定义（如果有）
      if (tools && tools.length > 0) {
        requestParams.tools = tools.map(tool => ({
          type: 'function' as const,
          function: tool.function,
        }));
      }

      // 4. 发送请求
      const response = await this.client.chat.completions.create(
        requestParams,
        { signal }
      );

      // 5. 解析响应
      const choice = response.choices[0];
      if (!choice) {
        throw new Error('No response from LLM');
      }

      const assistantMessage = choice.message;

      // 6. 构建返回结果
      const result: ChatResponse = {
        content: assistantMessage.content || '',
        usage: response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        } : undefined,
      };

      // 7. 处理工具调用
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        result.toolCalls = assistantMessage.tool_calls.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        }));
      }

      return result;
    } catch (error) {
      // 处理中断
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }

      // 处理 API 错误
      if (error instanceof OpenAI.APIError) {
        throw new Error(`LLM API Error: ${error.message}`);
      }

      throw error;
    }
  }

  /**
   * 转换消息格式为 OpenAI 格式
   */
  private convertMessage(msg: Message): OpenAI.ChatCompletionMessageParam {
    switch (msg.role) {
      case 'system':
        return { role: 'system', content: msg.content };
      
      case 'user':
        return { role: 'user', content: msg.content };
      
      case 'assistant':
        const assistantMsg: OpenAI.ChatCompletionAssistantMessageParam = {
          role: 'assistant',
          content: msg.content,
        };
        // 附加工具调用信息
        if (msg.tool_calls) {
          assistantMsg.tool_calls = msg.tool_calls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          }));
        }
        return assistantMsg;
      
      case 'tool':
        return {
          role: 'tool',
          tool_call_id: msg.tool_call_id || '',
          content: msg.content,
        };
      
      default:
        throw new Error(`Unknown message role: ${msg.role}`);
    }
  }
}

// ========== 工厂函数 ==========

/**
 * 创建 ChatService 实例
 */
export function createChatService(config: ChatServiceConfig): IChatService {
  return new OpenAIChatService(config);
}
```

**代码说明**：

| 方法 | 说明 |
|------|------|
| `constructor` | 初始化 OpenAI 客户端 |
| `chat` | 发送聊天请求，处理工具调用 |
| `convertMessage` | 转换内部消息格式为 OpenAI 格式 |

### 4.3.2 更新服务导出

**文件位置**：`src/services/index.ts`

```typescript
/**
 * Services 模块导出
 * 
 * 【第 4 章修改】添加 ChatService 导出
 */

// 版本检查（第 3 章）
export {
  checkVersion,
  checkVersionOnStartup,
  setSkipUntilVersion,
  getUpgradeCommand,
  performUpgrade,
  restartApp,
  getCurrentVersion,
} from './VersionChecker.js';
export type { VersionCheckResult } from './VersionChecker.js';

// 【新增】ChatService
export { OpenAIChatService, createChatService } from './ChatService.js';
export type { ChatServiceConfig } from './ChatService.js';
```

---

## 4.4 Agent 核心类实现

### 4.4.1 创建 Agent 类

**文件位置**：`src/agent/Agent.ts`

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

import type {
  AgentConfig,
  ChatContext,
  LoopOptions,
  LoopResult,
  Message,
  IChatService,
  ToolCall,
  ToolResult,
  ToolDefinition,
} from './types.js';
import { createChatService } from '../services/ChatService.js';
import { buildSystemPrompt } from '../prompts/builder.js';

// ========== 常量 ==========

/** 硬性轮次上限，防止无限循环 */
const TURN_LIMIT = 100;

/** 意图未完成检测模式 */
const INCOMPLETE_INTENT_PATTERNS = [
  /：\s*$/,                           // 中文冒号结尾
  /:\s*$/,                            // 英文冒号结尾
  /\.\.\.\s*$/,                       // 省略号结尾
  /让我(先|来|开始|查看|检查|修复)/,    // 中文意图词
  /Let me (first|start|check|look|fix)/i,  // 英文意图词
];

// ========== Agent 类 ==========

export class Agent {
  // 配置（只读）
  private config: AgentConfig;

  // 初始化状态
  private isInitialized = false;

  // 核心组件
  private chatService!: IChatService;
  private systemPrompt: string = '';

  /**
   * 私有构造函数，使用 Agent.create() 创建实例
   */
  private constructor(config: AgentConfig) {
    this.config = config;
  }

  // ========== 静态工厂方法 ==========

  /**
   * 创建 Agent 实例
   * 
   * 使用工厂方法而非直接 new 的原因：
   * 1. 确保异步初始化完成后才返回实例
   * 2. 集中配置验证逻辑
   * 3. 未来可扩展为单例或对象池
   */
  static async create(config: AgentConfig): Promise<Agent> {
    // 验证配置
    if (!config.apiKey) {
      throw new Error('❌ API Key 未配置');
    }

    // 创建并初始化 Agent
    const agent = new Agent(config);
    await agent.initialize();

    return agent;
  }

  // ========== 初始化 ==========

  /**
   * 初始化 Agent
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // 1. 构建系统提示词（使用四层架构）
      const promptResult = await buildSystemPrompt({
        projectPath: process.cwd(),
        replaceDefault: this.config.systemPrompt,
        includeEnvironment: true,
      });
      this.systemPrompt = promptResult.prompt;

      // 2. 创建 ChatService
      this.chatService = createChatService({
        apiKey: this.config.apiKey,
        baseURL: this.config.baseURL,
        model: this.config.model,
      });

      // 3. 【TODO: 第 6 章】初始化工具系统
      // this.toolRegistry = createToolRegistry();
      // this.executionPipeline = new ExecutionPipeline(this.toolRegistry);

      this.isInitialized = true;
    } catch (error) {
      throw new Error(
        `Agent 初始化失败: ${error instanceof Error ? error.message : '未知错误'}`
      );
    }
  }

  // ========== 公共方法 ==========

  /**
   * 发送消息并获取响应
   * 
   * 这是 Agent 的主要入口点
   */
  async chat(
    message: string,
    context?: ChatContext,
    options?: LoopOptions
  ): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('Agent 未初始化，请使用 Agent.create() 创建实例');
    }

    // 创建默认上下文
    const ctx: ChatContext = context || {
      sessionId: `session-${Date.now()}`,
      messages: [],
    };

    // 执行循环
    const result = await this.executeLoop(message, ctx, options);

    if (!result.success) {
      if (result.error?.type === 'aborted') {
        return ''; // 用户中止
      }
      throw new Error(result.error?.message || '执行失败');
    }

    return result.finalMessage || '';
  }

  /**
   * 获取当前配置
   */
  getConfig(): AgentConfig {
    return { ...this.config };
  }

  // ========== 核心执行循环 ==========

  /**
   * 执行 Agentic Loop
   * 
   * 这是 Agent 最核心的方法，实现了完整的 ReAct 循环：
   * Reasoning (推理) + Acting (行动)
   */
  private async executeLoop(
    message: string,
    context: ChatContext,
    options?: LoopOptions
  ): Promise<LoopResult> {
    // === 1. 准备阶段 ===

    // 构建消息历史
    const messages: Message[] = [];
    
    // 添加系统提示词
    messages.push({ role: 'system', content: this.systemPrompt });
    
    // 添加历史消息
    messages.push(...context.messages);
    
    // 添加当前用户消息
    messages.push({ role: 'user', content: message });

    // === 2. 循环配置 ===

    // 计算最大轮次
    const configuredMaxTurns =
      options?.maxTurns ??
      this.config.maxTurns ??
      -1;

    // 特殊值处理：0 = 禁用对话
    if (configuredMaxTurns === 0) {
      return {
        success: false,
        error: { type: 'chat_disabled', message: '对话功能已禁用' },
      };
    }

    // 应用安全上限
    const maxTurns = configuredMaxTurns === -1
      ? TURN_LIMIT
      : Math.min(configuredMaxTurns, TURN_LIMIT);

    let turnsCount = 0;
    let recentRetries = 0;
    const allToolResults: ToolResult[] = [];

    // 获取工具定义（【TODO: 第 6 章实现】）
    const tools: ToolDefinition[] = [];

    // === 3. 核心循环 ===
    while (true) {
      // 3.1 检查中断信号
      if (options?.signal?.aborted) {
        return { success: false, error: { type: 'aborted' } };
      }

      // 3.2 轮次计数
      turnsCount++;
      options?.onTurnStart?.({ turn: turnsCount, maxTurns });

      // 3.3 调用 LLM
      let turnResult;
      try {
        turnResult = await this.chatService.chat(
          messages,
          tools.length > 0 ? tools : undefined,
          options?.signal
        );
      } catch (error) {
        // 处理中断
        if (error instanceof Error && error.name === 'AbortError') {
          return { success: false, error: { type: 'aborted' } };
        }
        return {
          success: false,
          error: {
            type: 'llm_error',
            message: error instanceof Error ? error.message : 'LLM 调用失败',
            cause: error instanceof Error ? error : undefined,
          },
        };
      }

      // 3.4 通知 UI 显示内容
      if (turnResult.content && options?.onContent) {
        options.onContent(turnResult.content);
      }
      if (turnResult.reasoningContent && options?.onThinking) {
        options.onThinking(turnResult.reasoningContent);
      }

      // 3.5 检查是否完成（无工具调用）
      if (!turnResult.toolCalls || turnResult.toolCalls.length === 0) {
        // 意图未完成检测
        if (this.detectIncompleteIntent(turnResult.content) && recentRetries < 2) {
          recentRetries++;
          messages.push({
            role: 'user',
            content: '请执行你提到的操作，不要只是描述。',
          });
          continue;
        }

        return {
          success: true,
          finalMessage: turnResult.content,
          metadata: {
            turnsCount,
            toolCallsCount: allToolResults.length,
            totalTokens: turnResult.usage?.totalTokens,
          },
        };
      }

      // 重置重试计数
      recentRetries = 0;

      // 3.6 添加 assistant 消息到历史
      messages.push({
        role: 'assistant',
        content: turnResult.content || '',
        tool_calls: turnResult.toolCalls,
      });

      // 3.7 执行每个工具调用
      for (const toolCall of turnResult.toolCalls) {
        if (toolCall.type !== 'function') continue;

        // 检查中断
        if (options?.signal?.aborted) {
          return { success: false, error: { type: 'aborted' } };
        }

        // 执行工具【TODO: 第 6-7 章实现】
        const result = await this.executeToolCall(toolCall, context);
        allToolResults.push(result);

        // 通知 UI 更新状态
        options?.onToolResult?.(toolCall, result);

        // 添加工具结果到消息历史
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
          content: result.llmContent || result.displayContent || '',
        });
      }

      // === 4. 轮次上限处理 ===
      if (turnsCount >= maxTurns) {
        // 询问用户是否继续
        if (options?.onTurnLimitReached) {
          const response = await options.onTurnLimitReached({ turnsCount });
          if (response.continue) {
            turnsCount = 0; // 重置计数器
            continue;
          }
        }

        return {
          success: false,
          error: {
            type: 'max_turns_exceeded',
            message: `达到最大轮次限制 (${maxTurns})`,
          },
          metadata: {
            turnsCount,
            toolCallsCount: allToolResults.length,
          },
        };
      }
    }
  }

  // ========== 私有方法 ==========

  /**
   * 检测意图未完成
   * 
   * 某些模型会说"让我来..."但不实际调用工具
   * 检测这种情况并自动重试
   */
  private detectIncompleteIntent(content: string | undefined): boolean {
    if (!content) return false;
    return INCOMPLETE_INTENT_PATTERNS.some(pattern => pattern.test(content));
  }

  /**
   * 执行工具调用
   * 
   * 【TODO: 第 6-7 章完整实现】
   * 目前返回模拟结果
   */
  private async executeToolCall(
    toolCall: ToolCall,
    context: ChatContext
  ): Promise<ToolResult> {
    // 占位实现 - 第 6-7 章会替换为真正的执行管道
    return {
      success: false,
      error: `Tool '${toolCall.function.name}' not implemented yet`,
      displayContent: `❌ 工具 '${toolCall.function.name}' 尚未实现`,
      llmContent: `Error: Tool execution not implemented in Chapter 4. Will be implemented in Chapter 6-7.`,
    };
  }
}

// ========== 导出 ==========

export default Agent;
```

### 4.4.2 更新 Agent 模块导出

**文件位置**：`src/agent/index.ts`

```typescript
/**
 * Agent 模块导出
 * 
 * 【第 4 章修改】添加完整 Agent 导出
 */

// Agent 实现
export { SimpleAgent } from './SimpleAgent.js';
export { Agent } from './Agent.js';

// 类型导出
export type {
  AgentConfig,
  Message,
  MessageRole,
  ToolCall,
  ChatContext,
  LoopOptions,
  LoopResult,
  LoopError,
  LoopErrorType,
  ToolResult,
  ToolDefinition,
  ChatResponse,
  IChatService,
  PermissionMode,
  ConfirmationDetails,
  ConfirmationResponse,
  ConfirmationHandler,
} from './types.js';
```

---

## 4.5 Agentic Loop 流程详解

### 4.5.1 执行流程图

```
开始
  │
  ▼
准备工具列表、消息历史
  │
  ▼
┌─────────────────────────────┐
│       核心循环开始           │
└─────────────────────────────┘
  │
  ▼
检查中断信号？ ──是──▶ 返回 { success: false, error: 'aborted' }
  │ 否
  ▼
轮次 +1，触发 onTurnStart 回调
  │
  ▼
调用 LLM (ChatService.chat)
  │
  ▼
有工具调用？ ──否──▶ 检测意图未完成？ ──否──▶ 返回最终响应
  │                        │ 是
  │                        ▼
  │                   添加重试提示
  │                   继续循环
  │ 是
  ▼
添加 assistant 消息到历史
  │
  ▼
遍历执行每个工具调用
  │
  ├──▶ 检查中断？ ──是──▶ 返回 { success: false, error: 'aborted' }
  │
  ├──▶ 执行工具 (ExecutionPipeline)
  │
  ├──▶ 触发 onToolResult 回调
  │
  └──▶ 添加 tool 消息到历史
  │
  ▼
达到轮次上限？ ──否──▶ 继续循环
  │ 是
  ▼
触发 onTurnLimitReached 回调
  │
  ▼
用户选择继续？ ──是──▶ 重置计数器，继续循环
  │ 否
  ▼
返回 { success: false, error: 'max_turns_exceeded' }
```

### 4.5.2 消息序列示例

一个完整的工具调用循环的消息序列：

```json
[
  // 1. 系统提示词
  { "role": "system", "content": "You are ClawdCode..." },
  
  // 2. 用户消息
  { "role": "user", "content": "读取 package.json 文件" },
  
  // 3. LLM 响应（包含工具调用）
  {
    "role": "assistant",
    "content": "",
    "tool_calls": [{
      "id": "call_abc123",
      "type": "function",
      "function": {
        "name": "Read",
        "arguments": "{\"file_path\": \"/path/to/package.json\"}"
      }
    }]
  },
  
  // 4. 工具执行结果
  {
    "role": "tool",
    "tool_call_id": "call_abc123",
    "name": "Read",
    "content": "{ \"name\": \"my-project\", \"version\": \"1.0.0\" }"
  },
  
  // 5. LLM 最终响应（无工具调用，循环结束）
  {
    "role": "assistant",
    "content": "package.json 的内容显示这是一个名为 my-project 的项目，版本为 1.0.0。"
  }
]
```

---

## 4.6 循环控制机制

### 4.6.1 轮次限制

```typescript
// 配置优先级（从高到低）
const configuredMaxTurns =
  options?.maxTurns ??      // 1. 调用参数
  this.config.maxTurns ??   // 2. Agent 配置
  -1;                       // 3. 默认值（无限）

// 硬性安全上限
const TURN_LIMIT = 100;

// 实际生效限制
const maxTurns = configuredMaxTurns === -1
  ? TURN_LIMIT
  : Math.min(configuredMaxTurns, TURN_LIMIT);
```

**轮次限制行为**：

| maxTurns 值 | 行为 |
|-------------|------|
| `-1` | 无限循环，但在 100 轮时暂停询问 |
| `0` | 禁用对话功能 |
| `N > 0` | 最多 N 轮，到达时询问是否继续 |

### 4.6.2 中断信号处理

在每个关键节点检查 `AbortSignal`：

```typescript
// 检查点 1：循环开始前
if (options?.signal?.aborted) {
  return { success: false, error: { type: 'aborted' } };
}

// 检查点 2：LLM 调用时传递 signal
const turnResult = await this.chatService.chat(messages, tools, options?.signal);

// 检查点 3：工具执行前
if (options?.signal?.aborted) {
  return { success: false, error: { type: 'aborted' } };
}
```

### 4.6.3 意图未完成检测

某些模型（特别是较弱的模型）会说"让我来..."但不实际调用工具：

```typescript
const INCOMPLETE_INTENT_PATTERNS = [
  /：\s*$/,                           // 中文冒号结尾
  /:\s*$/,                            // 英文冒号结尾
  /让我(先|来|开始|查看|检查|修复)/,    // 中文意图词
  /Let me (first|start|check|look|fix)/i,  // 英文意图词
];

// 检测到未完成意图时，自动添加重试提示
if (isIncompleteIntent && recentRetries < 2) {
  messages.push({
    role: 'user',
    content: '请执行你提到的操作，不要只是描述。'
  });
  continue;
}
```

---

## 4.7 更新 App.tsx 使用新 Agent

**文件位置**：`src/ui/App.tsx`

在 `MainInterface` 组件中，将 `SimpleAgent` 替换为 `Agent`：

```tsx
// 【第 4 章修改】导入 Agent 而不是 SimpleAgent
import { Agent } from '../agent/Agent.js';
import type { Message, ChatContext } from '../agent/types.js';

// 在 MainInterface 组件中：

const MainInterface: React.FC<MainInterfaceProps> = ({ 
  apiKey, 
  baseURL, 
  model,
  debug,
}) => {
  // ...状态定义...
  
  // Agent 实例引用
  const agentRef = useRef<Agent | null>(null);
  
  // 上下文引用（维护消息历史）
  const contextRef = useRef<ChatContext>({
    sessionId: `session-${Date.now()}`,
    messages: [],
  });

  // 初始化 Agent
  useEffect(() => {
    const initAgent = async () => {
      try {
        if (debug) {
          console.log('[DEBUG] Initializing Agent...');
        }
        
        // 【修改】使用 Agent.create() 工厂方法
        agentRef.current = await Agent.create({
          apiKey,
          baseURL,
          model,
        });
        
        setIsInitializing(false);
        
        if (debug) {
          console.log('[DEBUG] Agent initialized successfully');
        }
      } catch (error) {
        setInitError(error instanceof Error ? error.message : '初始化失败');
        setIsInitializing(false);
      }
    };
    
    initAgent();
  }, [apiKey, baseURL, model, debug]);

  // 处理用户提交
  const handleSubmit = useCallback(async (value: string) => {
    if (!value.trim() || !agentRef.current) return;

    // 添加用户消息到 UI
    const userUIMessage: UIMessage = { role: 'user', content: value };
    setUIMessages(prev => [...prev, userUIMessage]);
    setInput('');
    setIsLoading(true);

    // 【修改】添加用户消息到上下文
    const userMessage: Message = { role: 'user', content: value };
    contextRef.current.messages.push(userMessage);

    try {
      // 【修改】使用无状态 Agent，传入上下文
      const result = await agentRef.current.chat(value, contextRef.current);
      
      // 添加助手消息到 UI
      const assistantUIMessage: UIMessage = { role: 'assistant', content: result };
      setUIMessages(prev => [...prev, assistantUIMessage]);
      
      // 【修改】添加助手消息到上下文（保持历史连续性）
      const assistantMessage: Message = { role: 'assistant', content: result };
      contextRef.current.messages.push(assistantMessage);
      
    } catch (error) {
      // ...错误处理...
    } finally {
      setIsLoading(false);
    }
  }, [debug]);

  // ...其余代码不变...
};
```

---

## 4.8 本章小结

### 完成的内容

| 文件 | 内容 |
|------|------|
| `src/agent/types.ts` | 新增 LoopOptions, LoopResult, ChatResponse 等类型 |
| `src/services/ChatService.ts` | 实现 OpenAI 兼容的 ChatService |
| `src/agent/Agent.ts` | 实现无状态 Agent 和 Agentic Loop |
| `src/ui/App.tsx` | 更新为使用新 Agent |

### 技术亮点

| 亮点 | 说明 |
|------|------|
| **无状态设计** | Agent 不持有状态，所有状态通过 context 传入 |
| **静态工厂方法** | 确保异步初始化完成后才返回实例 |
| **消息历史注入** | 职责分离，Agent 专注于 LLM 交互 |
| **双保险轮次控制** | 配置值 + 硬性上限，防止无限循环 |
| **意图未完成检测** | 自动重试提高成功率 |
| **多点中断检查** | 用户按 Ctrl+C 能立即响应 |

### TODO（后续章节）

| 功能 | 计划章节 |
|------|----------|
| System Prompt 构建 | 第 5 章 |
| 工具系统集成 | 第 6 章 |
| 执行管道和权限控制 | 第 7 章 |
| 上下文压缩 | 第 8 章 |

---

## 4.9 本章遗留项

::: info 以下功能将在后续章节实现
本章实现了 Agent 核心和 Agentic Loop，部分高级功能需要其他模块支持。
:::

| 功能 | 说明 | 计划章节 |
|------|------|----------|
| **System Prompt 构建** | 四层架构提示词 | 第 5 章 |
| **工具系统集成** | ToolRegistry + 内置工具 | 第 6 章 |
| **执行管道** | ExecutionPipeline 七阶段 | 第 7 章 |
| **上下文压缩** | CompactionService | 第 8 章 |
| **@ 文件提及处理** | `processAtMentions` | 第 9 章 |
| **工具白名单** | `applyToolWhitelist` | 第 9 章 |

### 当前状态

本章实现的 Agent 核心是**可运行**的（纯对话模式）：

- ✅ 无状态 Agent 设计
- ✅ Agentic Loop 核心循环
- ✅ ChatService LLM 通信
- ✅ 轮次控制和中断处理
- ✅ 意图未完成检测
- ⏳ 工具调用返回占位结果（第 6 章实现）

---

## 下一章预告

在 **第五章** 中，我们将：
1. 设计系统提示词的四层架构
2. 实现默认系统提示词
3. 实现 Plan 模式提示词
4. 创建提示词构建器

这将赋予 Agent "灵魂"——定义它的身份、能力边界和行为准则！
