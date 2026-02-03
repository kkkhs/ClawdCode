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
  AgentOptions,
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
import { createPlanModeReminder } from '../prompts/plan.js';

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
  private runtimeOptions: AgentOptions;

  // 初始化状态
  private isInitialized = false;

  // 核心组件
  private chatService!: IChatService;
  private systemPrompt: string;

  /**
   * 私有构造函数，使用 Agent.create() 创建实例
   */
  private constructor(config: AgentConfig, options: AgentOptions = {}) {
    this.config = config;
    this.runtimeOptions = options;
    this.systemPrompt = ''; // 在 initialize() 中构建
  }

  // ========== 静态工厂方法 ==========

  /**
   * 创建 Agent 实例
   * 
   * @param config Agent 配置
   * @param options 运行时选项
   */
  static async create(
    config: AgentConfig,
    options: AgentOptions = {}
  ): Promise<Agent> {
    // 验证配置
    if (!config.apiKey) {
      throw new Error('❌ API Key 未配置');
    }

    // 创建并初始化 Agent
    const agent = new Agent(config, options);
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

      // 3. 注册内置工具 [TODO: 第 6 章实现]
      // await this.registerBuiltinTools();

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
   * @param message 用户消息
   * @param context 聊天上下文（包含历史消息、sessionId 等）
   * @param options 循环选项
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
   * 这是 Agent 最核心的方法，实现了完整的 ReAct (Reasoning + Acting) 循环
   */
  private async executeLoop(
    message: string,
    context: ChatContext,
    options?: LoopOptions
  ): Promise<LoopResult> {
    // === 1. 准备阶段 ===

    // 构建消息历史
    const messages: Message[] = [];
    
    // 添加系统提示
    messages.push({ role: 'system', content: this.systemPrompt });
    
    // 添加历史消息
    messages.push(...context.messages);
    
    // 添加当前用户消息
    messages.push({ role: 'user', content: message });

    // === 2. 循环配置 ===

    // 计算最大轮次
    const configuredMaxTurns =
      this.runtimeOptions.maxTurns ??
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

    // 获取工具定义 [TODO: 第 6 章实现完整工具系统]
    const tools: ToolDefinition[] = [];

    // === 3. 核心循环 ===
    while (true) {
      // 3.1 检查中断信号
      if (options?.signal?.aborted) {
        return { success: false, error: { type: 'aborted' } };
      }

      // 3.2 检查并压缩上下文 [TODO: 第 8 章实现]
      // await this.checkAndCompact(context, turnsCount);

      // 3.3 轮次计数
      turnsCount++;
      options?.onTurnStart?.({ turn: turnsCount, maxTurns });

      // 3.4 调用 LLM
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

      // 3.5 通知 UI 显示内容
      if (turnResult.content && options?.onContent) {
        options.onContent(turnResult.content);
      }
      if (turnResult.reasoningContent && options?.onThinking) {
        options.onThinking(turnResult.reasoningContent);
      }

      // 3.6 检查是否完成（无工具调用）
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

      // 3.7 添加 assistant 消息到历史
      messages.push({
        role: 'assistant',
        content: turnResult.content || '',
        tool_calls: turnResult.toolCalls,
      });

      // 3.8 执行每个工具调用
      for (const toolCall of turnResult.toolCalls) {
        if (toolCall.type !== 'function') continue;

        // 检查中断
        if (options?.signal?.aborted) {
          return { success: false, error: { type: 'aborted' } };
        }

        // 执行工具 [TODO: 第 6-7 章实现完整工具执行]
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
            // 用户选择继续：重置计数器
            turnsCount = 0;
            continue;
          }
        }

        // 用户选择停止或非交互模式
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
   */
  private detectIncompleteIntent(content: string | undefined): boolean {
    if (!content) return false;
    return INCOMPLETE_INTENT_PATTERNS.some(pattern => pattern.test(content));
  }

  /**
   * 执行工具调用
   * 
   * TODO: 第 6-7 章实现完整的工具执行管道
   */
  private async executeToolCall(
    toolCall: ToolCall,
    _context: ChatContext
  ): Promise<ToolResult> {
    // 目前返回占位结果，完整实现在第 6-7 章
    return {
      success: false,
      error: `工具 "${toolCall.function.name}" 尚未实现`,
      displayContent: `[工具 ${toolCall.function.name} 待实现]`,
      llmContent: `Error: Tool "${toolCall.function.name}" is not implemented yet.`,
    };
  }
}

// ========== 导出 ==========

export default Agent;
