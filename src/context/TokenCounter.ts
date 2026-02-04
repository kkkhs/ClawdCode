/**
 * Token 计算器
 * 
 * 使用 js-tiktoken 精确计算消息的 Token 数量
 */

import { encodingForModel, type Tiktoken } from 'js-tiktoken';
import type { Message } from '../agent/types.js';

export class TokenCounter {
  private static encodingCache = new Map<string, Tiktoken>();

  /**
   * 计算消息列表的 token 数量
   */
  static countTokens(messages: Message[], modelName: string): number {
    const encoding = this.getEncoding(modelName);
    let totalTokens = 0;

    for (const msg of messages) {
      // 每条消息的固定开销
      totalTokens += 4;

      // Role 字段
      if (msg.role) {
        totalTokens += encoding.encode(msg.role).length;
      }

      // Content 字段
      if (msg.content) {
        if (typeof msg.content === 'string') {
          totalTokens += encoding.encode(msg.content).length;
        } else {
          totalTokens += encoding.encode(JSON.stringify(msg.content)).length;
        }
      }

      // 工具调用
      if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
        totalTokens += this.countToolCallTokens(msg.tool_calls, encoding);
      }
    }

    return totalTokens;
  }

  /**
   * 计算单条消息的 token 数量
   */
  static countMessageTokens(message: Message, modelName: string): number {
    return this.countTokens([message], modelName);
  }

  /**
   * 计算文本的 token 数量
   */
  static countTextTokens(text: string, modelName: string): number {
    const encoding = this.getEncoding(modelName);
    return encoding.encode(text).length;
  }

  /**
   * 计算工具调用的 token 数量
   */
  private static countToolCallTokens(
    toolCalls: Array<{ id?: string; function?: { name?: string; arguments?: string } }>,
    encoding: Tiktoken
  ): number {
    let tokens = 0;

    for (const call of toolCalls) {
      // 工具调用的固定开销
      tokens += 4;

      if (call.id) {
        tokens += encoding.encode(call.id).length;
      }

      if (call.function) {
        if (call.function.name) {
          tokens += encoding.encode(call.function.name).length;
        }
        if (call.function.arguments) {
          tokens += encoding.encode(call.function.arguments).length;
        }
      }
    }

    return tokens;
  }

  /**
   * 检查是否需要压缩
   */
  static shouldCompact(
    messages: Message[],
    modelName: string,
    maxTokens: number,
    thresholdPercent: number = 0.8
  ): boolean {
    const currentTokens = this.countTokens(messages, modelName);
    const threshold = Math.floor(maxTokens * thresholdPercent);
    return currentTokens >= threshold;
  }

  /**
   * 获取或创建 encoding
   */
  private static getEncoding(modelName: string): Tiktoken {
    // 规范化模型名称
    const normalizedName = this.normalizeModelName(modelName);

    if (!this.encodingCache.has(normalizedName)) {
      try {
        const encoding = encodingForModel(normalizedName as Parameters<typeof encodingForModel>[0]);
        this.encodingCache.set(normalizedName, encoding);
      } catch {
        // 模型不支持时，使用 GPT-4 的 encoding
        try {
          const encoding = encodingForModel('gpt-4');
          this.encodingCache.set(normalizedName, encoding);
        } catch {
          // 最后的降级方案：创建一个简单的估算器
          console.warn(`无法为模型 ${modelName} 获取 encoding，使用粗略估算`);
          const fallbackEncoding = {
            encode: (text: string) => new Array(Math.ceil(text.length / 4)),
            decode: () => '',
            free: () => {},
          } as unknown as Tiktoken;
          this.encodingCache.set(normalizedName, fallbackEncoding);
        }
      }
    }
    return this.encodingCache.get(normalizedName)!;
  }

  /**
   * 规范化模型名称
   */
  private static normalizeModelName(modelName: string): string {
    // 处理常见的模型名称变体
    const lower = modelName.toLowerCase();

    if (lower.includes('gpt-4') || lower.includes('gpt4')) {
      return 'gpt-4';
    }
    if (lower.includes('gpt-3.5') || lower.includes('gpt35')) {
      return 'gpt-3.5-turbo';
    }
    if (lower.includes('claude')) {
      // Claude 使用类似 GPT-4 的 tokenizer
      return 'gpt-4';
    }
    if (lower.includes('glm')) {
      // GLM 使用类似 GPT-4 的 tokenizer
      return 'gpt-4';
    }

    return modelName;
  }

  /**
   * 快速粗略估算（不需要 encoding）
   * 
   * 用于不需要精确计算的场景
   */
  static estimateTokens(text: string): number {
    // 中文：1 token ≈ 1.5 字符
    // 英文：1 token ≈ 4 字符
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
  }

  /**
   * 估算消息列表的 token 数量（快速但不精确）
   */
  static estimateMessagesTokens(messages: Message[]): number {
    let total = 0;

    for (const msg of messages) {
      // 固定开销
      total += 4;

      if (msg.content) {
        const content = typeof msg.content === 'string' 
          ? msg.content 
          : JSON.stringify(msg.content);
        total += this.estimateTokens(content);
      }

      if (msg.tool_calls) {
        total += this.estimateTokens(JSON.stringify(msg.tool_calls));
      }
    }

    return total;
  }

  /**
   * 计算剩余可用 token 数量
   */
  static getRemainingTokens(
    messages: Message[],
    modelName: string,
    maxContextTokens: number,
    maxOutputTokens: number = 4096
  ): number {
    const currentTokens = this.countTokens(messages, modelName);
    const availableForInput = maxContextTokens - maxOutputTokens;
    return Math.max(0, availableForInput - currentTokens);
  }

  /**
   * 截断消息列表以适应 token 限制
   */
  static truncateMessages(
    messages: Message[],
    modelName: string,
    maxTokens: number
  ): Message[] {
    const result: Message[] = [];
    let currentTokens = 0;

    // 从最新的消息开始，向前添加
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const msgTokens = this.countMessageTokens(msg, modelName);

      if (currentTokens + msgTokens > maxTokens) {
        break;
      }

      result.unshift(msg);
      currentTokens += msgTokens;
    }

    return result;
  }

  /**
   * 清理编码缓存
   */
  static clearCache(): void {
    // js-tiktoken 的 Tiktoken 对象不需要手动释放
    this.encodingCache.clear();
  }
}
