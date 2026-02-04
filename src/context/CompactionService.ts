/**
 * 对话压缩服务
 * 
 * 当上下文 Token 数达到阈值时，自动生成总结并压缩对话
 */

import { nanoid } from 'nanoid';
import type { Message } from '../agent/types.js';
import type { CompactionOptions, CompactionResult, FileContent } from './types.js';
import { TokenCounter } from './TokenCounter.js';
import { FileAnalyzer } from './FileAnalyzer.js';

export class CompactionService {
  /** 压缩阈值百分比（80%） */
  private static readonly THRESHOLD_PERCENT = 0.8;
  /** 保留比例（20%） */
  private static readonly RETAIN_PERCENT = 0.2;
  /** 降级时保留比例（30%） */
  private static readonly FALLBACK_RETAIN_PERCENT = 0.3;

  /**
   * 检查是否需要压缩
   */
  static shouldCompact(
    messages: Message[],
    modelName: string,
    maxContextTokens: number
  ): boolean {
    return TokenCounter.shouldCompact(
      messages,
      modelName,
      maxContextTokens,
      this.THRESHOLD_PERCENT
    );
  }

  /**
   * 执行压缩
   */
  static async compact(
    messages: Message[],
    options: CompactionOptions
  ): Promise<CompactionResult> {
    const preTokens = options.actualPreTokens
      ?? TokenCounter.countTokens(messages, options.modelName);

    try {
      console.log('[CompactionService] 开始压缩，消息数:', messages.length);

      // 1. 分析并读取重点文件
      const fileRefs = FileAnalyzer.analyzeFiles(messages);
      const filePaths = fileRefs.map(f => f.path);
      const fileContents = await FileAnalyzer.readFilesContent(filePaths);

      // 2. 调用 LLM 生成总结
      const summary = await this.generateSummary(messages, fileContents, options);

      // 3. 计算保留范围并过滤孤儿 tool 消息
      const retainCount = Math.ceil(messages.length * this.RETAIN_PERCENT);
      const candidateMessages = messages.slice(-retainCount);
      const retainedMessages = this.filterOrphanToolMessages(candidateMessages);

      // 4. 创建压缩消息
      const summaryMessage = this.createSummaryMessage(nanoid(), summary);
      const compactedMessages = [summaryMessage, ...retainedMessages];

      const postTokens = TokenCounter.countTokens(compactedMessages, options.modelName);

      console.log(`[CompactionService] Token 变化: ${preTokens} → ${postTokens}`);

      return {
        success: true,
        summary,
        preTokens,
        postTokens,
        filesIncluded: filePaths,
        compactedMessages,
      };
    } catch (error) {
      // 降级策略：简单截断
      return this.fallbackCompact(messages, options, preTokens, error);
    }
  }

  /**
   * 生成压缩总结
   */
  private static async generateSummary(
    messages: Message[],
    fileContents: FileContent[],
    options: CompactionOptions
  ): Promise<string> {
    const prompt = this.buildCompactionPrompt(messages, fileContents);

    // 如果提供了 chatService，使用它来生成总结
    if (options.chatService && typeof (options.chatService as any).chat === 'function') {
      try {
        const response = await (options.chatService as any).chat([
          { role: 'system', content: 'You are a helpful assistant that creates concise summaries.' },
          { role: 'user', content: prompt },
        ]);
        return response.content || this.createFallbackSummary(messages);
      } catch (error) {
        console.warn('[CompactionService] LLM 调用失败，使用回退总结', error);
        return this.createFallbackSummary(messages);
      }
    }

    // 没有 chatService，使用简单的摘要
    return this.createFallbackSummary(messages);
  }

  /**
   * 构建压缩提示词
   */
  private static buildCompactionPrompt(
    messages: Message[],
    fileContents: FileContent[]
  ): string {
    // 格式化消息历史
    const messagesText = messages.map((msg, i) => {
      const role = msg.role || 'unknown';
      const content = typeof msg.content === 'string'
        ? msg.content
        : JSON.stringify(msg.content);

      // 截断过长消息
      const maxLength = 5000;
      const truncated = content.length > maxLength
        ? content.substring(0, maxLength) + '...'
        : content;

      return `[${i + 1}] ${role}: ${truncated}`;
    }).join('\n\n');

    // 格式化文件内容
    const filesText = fileContents.map(file =>
      `### ${file.path}\n\`\`\`\n${file.content}\n\`\`\``
    ).join('\n\n');

    return `Your task is to create a detailed summary of the conversation so far. This summary will be used as context for continuing the conversation, so it's important to preserve key information.

## Conversation History
${messagesText}

${fileContents.length > 0 ? `## Important Files\n\n${filesText}` : ''}

Please provide your summary following this structure:

1. **Primary Request and Intent** - What is the user trying to accomplish?
2. **Key Technical Concepts** - Important technical details, patterns, or decisions
3. **Files and Code Sections** - Key files mentioned or modified
4. **Errors and Fixes** - Any issues encountered and how they were resolved
5. **Problem Solving** - Approach taken to solve problems
6. **All User Messages** - Brief summary of what the user asked
7. **Pending Tasks** - Any incomplete work or next steps
8. **Current Work** - What was being worked on most recently
9. **Optional Next Step** - Suggested next action

Keep the summary concise but comprehensive. Focus on information that would be needed to continue the work.`;
  }

  /**
   * 创建回退总结（不使用 LLM）
   */
  private static createFallbackSummary(messages: Message[]): string {
    const userMessages = messages.filter(m => m.role === 'user');
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    const toolCalls = messages.filter(m => m.role === 'tool' || (m.tool_calls && m.tool_calls.length > 0));

    const userSummary = userMessages.slice(-5).map(m => {
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      return `- ${content.substring(0, 200)}${content.length > 200 ? '...' : ''}`;
    }).join('\n');

    return `## Conversation Summary (Auto-generated)

### Statistics
- Total messages: ${messages.length}
- User messages: ${userMessages.length}
- Assistant messages: ${assistantMessages.length}
- Tool interactions: ${toolCalls.length}

### Recent User Requests
${userSummary || '(No user messages)'}

### Note
This is an automatically generated summary. Some context may have been lost.
The conversation can continue normally.`;
  }

  /**
   * 过滤孤儿 tool 消息
   */
  private static filterOrphanToolMessages(messages: Message[]): Message[] {
    // 收集保留消息中所有 tool_call 的 ID
    const availableToolCallIds = new Set<string>();
    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          if (tc.id) {
            availableToolCallIds.add(tc.id);
          }
        }
      }
    }

    // 过滤孤儿 tool 消息
    return messages.filter(msg => {
      if (msg.role === 'tool' && msg.tool_call_id) {
        return availableToolCallIds.has(msg.tool_call_id);
      }
      return true;
    });
  }

  /**
   * 创建总结消息
   */
  private static createSummaryMessage(id: string, summary: string): Message {
    return {
      role: 'user',
      content: `[Previous conversation summary]\n\n${summary}\n\n[End of summary - conversation continues below]`,
    };
  }

  /**
   * 降级策略：简单截断
   */
  private static fallbackCompact(
    messages: Message[],
    options: CompactionOptions,
    preTokens: number,
    error: unknown
  ): CompactionResult {
    console.warn('[CompactionService] 使用降级策略', error);

    // 保留 30% 的最近消息
    const retainCount = Math.ceil(messages.length * this.FALLBACK_RETAIN_PERCENT);
    const candidateMessages = messages.slice(-retainCount);
    const retainedMessages = this.filterOrphanToolMessages(candidateMessages);

    const errorMsg = error instanceof Error ? error.message : String(error);
    const summaryMessage = this.createSummaryMessage(
      nanoid(),
      `[Automatic compaction failed; using fallback]

An error occurred during compaction. Retained the latest ${retainCount} messages (~30%).

Error: ${errorMsg}

The conversation can continue, but consider retrying compaction later with /compact.`
    );

    const compactedMessages = [summaryMessage, ...retainedMessages];
    const postTokens = TokenCounter.countTokens(compactedMessages, options.modelName);

    return {
      success: false,
      summary: typeof summaryMessage.content === 'string' ? summaryMessage.content : '',
      preTokens,
      postTokens,
      filesIncluded: [],
      compactedMessages,
      error: errorMsg,
    };
  }

  /**
   * 强制压缩（用于 Agent 循环中检测到需要压缩时）
   */
  static async forceCompact(
    messages: Message[],
    options: Omit<CompactionOptions, 'trigger'>
  ): Promise<CompactionResult> {
    return this.compact(messages, { ...options, trigger: 'auto' });
  }
}
