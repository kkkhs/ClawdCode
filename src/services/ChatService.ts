/**
 * ChatService - LLM 通信服务
 * 
 * 封装与 LLM API 的通信，支持 OpenAI 兼容的所有服务
 * 支持流式输出和思考过程（reasoning/thinking）
 */

import OpenAI from 'openai';
import type {
  Message,
  ToolDefinition,
  ChatResponse,
  IChatService,
  ToolCall,
  StreamCallbacks,
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
 * 支持流式输出和思考过程
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
   * 发送聊天请求（流式）
   */
  async chat(
    messages: Message[],
    tools?: ToolDefinition[],
    signal?: AbortSignal,
    streamCallbacks?: StreamCallbacks
  ): Promise<ChatResponse> {
    try {
      // 转换消息格式
      const openaiMessages = messages.map(msg => this.convertMessage(msg));

      // 构建请求参数
      const requestParams: OpenAI.ChatCompletionCreateParams = {
        model: this.model,
        messages: openaiMessages,
        stream: true,  // 启用流式输出
      };

      // 添加工具定义
      if (tools && tools.length > 0) {
        requestParams.tools = tools.map(tool => ({
          type: 'function' as const,
          function: tool.function,
        }));
      }

      // 发送流式请求
      const stream = await this.client.chat.completions.create(
        requestParams,
        { signal }
      );

      // 收集完整响应
      let content = '';
      let reasoningContent = '';
      const toolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();
      let usage: ChatResponse['usage'] | undefined;

      // 处理流式响应
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        // 处理内容增量
        if (delta.content) {
          content += delta.content;
          streamCallbacks?.onContentDelta?.(delta.content);
        }

        // 处理思考内容增量（DeepSeek R1 / Claude 等模型）
        // 注意：不同模型的字段可能不同
        const reasoning = (delta as Record<string, unknown>).reasoning_content 
          || (delta as Record<string, unknown>).thinking
          || (delta as Record<string, unknown>).reasoning;
        if (reasoning && typeof reasoning === 'string') {
          reasoningContent += reasoning;
          streamCallbacks?.onThinkingDelta?.(reasoning);
        }

        // 处理工具调用增量
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const index = tc.index;
            
            if (!toolCalls.has(index)) {
              // 新的工具调用
              toolCalls.set(index, {
                id: tc.id || '',
                name: tc.function?.name || '',
                arguments: tc.function?.arguments || '',
              });
              
              if (tc.id && tc.function?.name) {
                streamCallbacks?.onToolCallStart?.({
                  id: tc.id,
                  type: 'function',
                  function: {
                    name: tc.function.name,
                    arguments: '',
                  },
                });
              }
            } else {
              // 更新现有工具调用
              const existing = toolCalls.get(index)!;
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.name = tc.function.name;
              if (tc.function?.arguments) {
                existing.arguments += tc.function.arguments;
                streamCallbacks?.onToolCallDelta?.(existing.id, tc.function.arguments);
              }
            }
          }
        }

        // 处理 usage（通常在最后一个 chunk）
        if (chunk.usage) {
          usage = {
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens,
          };
        }
      }

      // 构建返回结果
      const result: ChatResponse = {
        content,
        reasoningContent: reasoningContent || undefined,
        usage,
      };

      // 处理工具调用
      if (toolCalls.size > 0) {
        result.toolCalls = Array.from(toolCalls.values()).map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: tc.arguments,
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
