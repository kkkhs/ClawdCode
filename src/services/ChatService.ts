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
  ToolCall,
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
      // 转换消息格式
      const openaiMessages = messages.map(msg => this.convertMessage(msg));

      // 构建请求参数
      const requestParams: OpenAI.ChatCompletionCreateParams = {
        model: this.model,
        messages: openaiMessages,
      };

      // 添加工具定义
      if (tools && tools.length > 0) {
        requestParams.tools = tools.map(tool => ({
          type: 'function' as const,
          function: tool.function,
        }));
      }

      // 发送请求
      const response = await this.client.chat.completions.create(
        requestParams,
        { signal }
      );

      // 解析响应
      const choice = response.choices[0];
      if (!choice) {
        throw new Error('No response from LLM');
      }

      const assistantMessage = choice.message;

      // 构建返回结果
      const result: ChatResponse = {
        content: assistantMessage.content || '',
        usage: response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        } : undefined,
      };

      // 处理工具调用
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
