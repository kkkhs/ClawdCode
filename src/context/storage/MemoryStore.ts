/**
 * 内存存储
 * 
 * 提供当前会话的快速读写能力
 */

import type { ContextData, ContextMessage, MemoryInfo, ToolCallRecord } from '../types.js';

export class MemoryStore {
  private contextData: ContextData | null = null;
  private readonly maxSize: number;
  private readonly accessLog: Map<string, number> = new Map();

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  /**
   * 设置上下文数据
   */
  setContext(data: ContextData): void {
    this.contextData = data;
    this.recordAccess('context');
  }

  /**
   * 获取上下文数据
   */
  getContext(): ContextData | null {
    this.recordAccess('context');
    return this.contextData;
  }

  /**
   * 检查是否有数据
   */
  hasData(): boolean {
    return this.contextData !== null;
  }

  /**
   * 添加消息到对话上下文
   */
  addMessage(message: ContextMessage): void {
    if (!this.contextData) {
      throw new Error('上下文数据未初始化');
    }

    this.contextData.layers.conversation.messages.push(message);
    this.contextData.layers.conversation.lastActivity = Date.now();
    this.contextData.metadata.lastUpdated = Date.now();

    // 检查是否超过大小限制
    this.enforceMemoryLimit();
    this.recordAccess('messages');
  }

  /**
   * 获取所有消息
   */
  getMessages(): ContextMessage[] {
    if (!this.contextData) {
      return [];
    }
    this.recordAccess('messages');
    return this.contextData.layers.conversation.messages;
  }

  /**
   * 设置消息列表（用于压缩后更新）
   */
  setMessages(messages: ContextMessage[]): void {
    if (!this.contextData) {
      throw new Error('上下文数据未初始化');
    }
    this.contextData.layers.conversation.messages = messages;
    this.contextData.metadata.lastUpdated = Date.now();
  }

  /**
   * 添加工具调用记录
   */
  addToolCall(toolCall: ToolCallRecord): void {
    if (!this.contextData) {
      throw new Error('上下文数据未初始化');
    }

    this.contextData.layers.tool.recentCalls.push(toolCall);
    this.contextData.metadata.lastUpdated = Date.now();

    // 限制工具调用记录数量
    const maxToolCalls = 100;
    if (this.contextData.layers.tool.recentCalls.length > maxToolCalls) {
      this.contextData.layers.tool.recentCalls = 
        this.contextData.layers.tool.recentCalls.slice(-maxToolCalls);
    }

    this.recordAccess('toolCalls');
  }

  /**
   * 更新工具调用结果
   */
  updateToolCallResult(toolCallId: string, output: unknown, error?: string): void {
    if (!this.contextData) return;

    const toolCall = this.contextData.layers.tool.recentCalls.find(
      tc => tc.id === toolCallId
    );

    if (toolCall) {
      toolCall.output = output;
      toolCall.status = error ? 'error' : 'success';
      if (error) {
        toolCall.error = error;
      }
      this.contextData.metadata.lastUpdated = Date.now();
    }
  }

  /**
   * 获取最近的工具调用
   */
  getRecentToolCalls(count: number = 10): ToolCallRecord[] {
    if (!this.contextData) {
      return [];
    }
    return this.contextData.layers.tool.recentCalls.slice(-count);
  }

  /**
   * 更新 Token 计数
   */
  updateTokenCount(tokens: number): void {
    if (!this.contextData) return;
    this.contextData.metadata.totalTokens = tokens;
    this.contextData.metadata.lastUpdated = Date.now();
  }

  /**
   * 获取当前 Token 计数
   */
  getTokenCount(): number {
    return this.contextData?.metadata.totalTokens ?? 0;
  }

  /**
   * 强制执行内存限制
   */
  private enforceMemoryLimit(): void {
    if (!this.contextData) return;

    const messages = this.contextData.layers.conversation.messages;
    if (messages.length > this.maxSize) {
      // 保留最近的消息，删除较旧的
      const keepCount = Math.floor(this.maxSize * 0.8); // 保留80%
      this.contextData.layers.conversation.messages = messages.slice(-keepCount);
    }
  }

  /**
   * 记录访问时间
   */
  private recordAccess(key: string): void {
    this.accessLog.set(key, Date.now());
  }

  /**
   * 获取最后访问时间
   */
  getLastAccess(key: string): number | undefined {
    return this.accessLog.get(key);
  }

  /**
   * 获取内存使用情况
   */
  getMemoryInfo(): MemoryInfo {
    if (!this.contextData) {
      return { hasData: false, messageCount: 0, toolCallCount: 0, lastUpdated: null };
    }

    return {
      hasData: true,
      messageCount: this.contextData.layers.conversation.messages.length,
      toolCallCount: this.contextData.layers.tool.recentCalls.length,
      lastUpdated: this.contextData.metadata.lastUpdated,
    };
  }

  /**
   * 获取会话 ID
   */
  getSessionId(): string | null {
    return this.contextData?.layers.session.sessionId ?? null;
  }

  /**
   * 清空内存
   */
  clear(): void {
    this.contextData = null;
    this.accessLog.clear();
  }
}
