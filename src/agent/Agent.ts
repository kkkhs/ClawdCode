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
import {
  ExecutionPipeline,
  ToolRegistry,
  createToolRegistry,
  getBuiltinTools,
  PermissionMode,
  type PipelineExecutionContext,
} from '../tools/index.js';
import { configManager } from '../config/ConfigManager.js';
import { McpRegistry } from '../mcp/index.js';
import { agentDebug } from '../utils/debug.js';

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
  
  // 工具系统
  private toolRegistry!: ToolRegistry;
  private executionPipeline!: ExecutionPipeline;

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

      // 3. 初始化工具系统
      this.toolRegistry = createToolRegistry();
      
      // 注册内置工具
      const builtinTools = getBuiltinTools();
      for (const tool of builtinTools) {
        this.toolRegistry.register(tool);
      }

      // 4. 注册 MCP 工具（如果启用）
      if (configManager.isMcpEnabled()) {
        await this.registerMcpTools();
      }

      // 5. 创建执行管道（使用 settings.json 中的权限配置）
      const permissionConfig = configManager.getPermissionConfig();
      const defaultMode = configManager.getDefaultPermissionMode() as 'default' | 'autoEdit' | 'yolo' | 'plan';
      
      this.executionPipeline = new ExecutionPipeline(this.toolRegistry, {
        permissions: permissionConfig,
        defaultMode: this.mapPermissionMode(defaultMode),
      });

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

    // 获取工具定义
    const mode = context.permissionMode === 'plan' ? 'plan' : undefined;
    const functionDeclarations = this.toolRegistry.getFunctionDeclarationsByMode(mode);
    const tools: ToolDefinition[] = functionDeclarations.map(fn => ({
      type: 'function' as const,
      function: {
        name: fn.name,
        description: fn.description,
        parameters: fn.parameters as ToolDefinition['function']['parameters'],
      },
    }));

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
   * 使用 ExecutionPipeline 的七阶段管道执行工具
   */
  private async executeToolCall(
    toolCall: ToolCall,
    context: ChatContext
  ): Promise<ToolResult> {
    // 解析工具参数
    let params: Record<string, unknown>;
    try {
      params = JSON.parse(toolCall.function.arguments);
    } catch {
      return {
        success: false,
        error: `Invalid tool arguments: ${toolCall.function.arguments}`,
        displayContent: `❌ Invalid arguments for ${toolCall.function.name}`,
        llmContent: `Error: Failed to parse tool arguments as JSON.`,
      };
    }

    // 构建执行上下文
    const pipelineContext: PipelineExecutionContext = {
      sessionId: context.sessionId,
      workspaceRoot: process.cwd(),
      permissionMode: this.mapPermissionMode(context.permissionMode),
      signal: context.signal,
      confirmationHandler: context.confirmationHandler,
      messageId: toolCall.id,
    };

    // 通过执行管道执行工具
    const result = await this.executionPipeline.execute(
      toolCall.function.name,
      params,
      pipelineContext
    );

    // 转换为 Agent 的 ToolResult 格式
    return {
      success: result.success,
      displayContent: result.displayContent,
      llmContent: result.llmContent,
      error: result.error?.message,
      metadata: result.metadata,
    };
  }

  /**
   * 映射权限模式
   */
  private mapPermissionMode(mode?: string): PermissionMode {
    switch (mode) {
      case 'autoEdit':
        return PermissionMode.AUTO_EDIT;
      case 'yolo':
        return PermissionMode.YOLO;
      case 'plan':
        return PermissionMode.PLAN;
      default:
        return PermissionMode.DEFAULT;
    }
  }

  /**
   * 获取工具注册表
   */
  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  /**
   * 获取执行管道
   */
  getExecutionPipeline(): ExecutionPipeline {
    return this.executionPipeline;
  }

  /**
   * 注册 MCP 工具
   * 
   * 从配置中加载 MCP 服务器，连接并注册其工具
   */
  private async registerMcpTools(): Promise<void> {
    try {
      // 1. 获取 MCP 服务器配置
      const mcpServers = configManager.getMcpServers();
      
      if (Object.keys(mcpServers).length === 0) {
        return; // 没有配置任何 MCP 服务器
      }

      agentDebug.log(`正在加载 MCP 服务器 (${Object.keys(mcpServers).length} 个)...`);

      // 2. 注册并连接服务器
      const registry = McpRegistry.getInstance();
      await registry.registerServers(mcpServers);

      // 3. 获取工具并注册到 Agent 的工具注册表
      const mcpTools = await registry.getAvailableTools();
      
      if (mcpTools.length > 0) {
        for (const tool of mcpTools) {
          try {
            this.toolRegistry.register(tool);
          } catch (error) {
            agentDebug.warn(`注册 MCP 工具 "${tool.name}" 失败:`, (error as Error).message);
          }
        }
        agentDebug.log(`已加载 ${mcpTools.length} 个 MCP 工具`);
      }

      // 4. 监听工具更新事件
      registry.on('toolsUpdated', async () => {
        // 重新获取工具列表（TODO：增量更新）
        agentDebug.log('MCP 工具列表已更新');
      });

    } catch (error) {
      agentDebug.warn('MCP 工具加载失败:', (error as Error).message);
      // MCP 加载失败不应该阻止 Agent 启动
    }
  }
}

// ========== 导出 ==========

export default Agent;
