/**
 * 持久化存储
 * 
 * 使用 JSONL 格式按项目隔离存储会话
 */

import { nanoid } from 'nanoid';
import type { JSONLEntry, CompactMetadata, SessionContext, ConversationContext, ContextMessage } from '../types.js';
import { JSONLStore } from './JSONLStore.js';
import { getSessionFilePath, detectGitBranch } from './pathUtils.js';

// 获取版本号
let packageVersion = '0.1.0';
try {
  const packageJson = await import('../../../package.json', { assert: { type: 'json' } });
  packageVersion = packageJson.default.version || '0.1.0';
} catch {
  // 忽略错误
}

export class PersistentStore {
  private readonly projectPath: string;
  private readonly maxSessions: number;
  private readonly version: string;

  constructor(projectPath: string = process.cwd(), maxSessions: number = 100) {
    this.projectPath = projectPath;
    this.maxSessions = maxSessions;
    this.version = packageVersion;
  }

  /**
   * 获取会话的 JSONL 存储
   */
  private getStore(sessionId: string): JSONLStore {
    const filePath = getSessionFilePath(this.projectPath, sessionId);
    return new JSONLStore(filePath);
  }

  /**
   * 保存消息到 JSONL 文件（追加模式）
   */
  async saveMessage(
    sessionId: string,
    messageRole: 'user' | 'assistant' | 'system',
    content: string,
    parentUuid: string | null = null,
    metadata?: { model?: string; usage?: { input_tokens: number; output_tokens: number } }
  ): Promise<string> {
    const store = this.getStore(sessionId);

    const entry: JSONLEntry = {
      uuid: nanoid(),
      parentUuid,
      sessionId,
      timestamp: new Date().toISOString(),
      type: messageRole,
      cwd: this.projectPath,
      gitBranch: detectGitBranch(this.projectPath),
      version: this.version,
      message: {
        role: messageRole,
        content,
        ...(metadata || {}),
      },
    };

    await store.append(entry);
    return entry.uuid;
  }

  /**
   * 保存工具调用
   */
  async saveToolUse(
    sessionId: string,
    toolId: string,
    toolName: string,
    input: unknown,
    parentUuid: string | null = null
  ): Promise<string> {
    const store = this.getStore(sessionId);

    const entry: JSONLEntry = {
      uuid: nanoid(),
      parentUuid,
      sessionId,
      timestamp: new Date().toISOString(),
      type: 'tool_use',
      cwd: this.projectPath,
      gitBranch: detectGitBranch(this.projectPath),
      version: this.version,
      message: {
        role: 'assistant',
        content: '',
      },
      tool: {
        id: toolId,
        name: toolName,
        input,
      },
    };

    await store.append(entry);
    return entry.uuid;
  }

  /**
   * 保存工具结果
   */
  async saveToolResult(
    sessionId: string,
    toolId: string,
    output: unknown,
    error?: string,
    parentUuid: string | null = null
  ): Promise<string> {
    const store = this.getStore(sessionId);

    const entry: JSONLEntry = {
      uuid: nanoid(),
      parentUuid,
      sessionId,
      timestamp: new Date().toISOString(),
      type: 'tool_result',
      cwd: this.projectPath,
      gitBranch: detectGitBranch(this.projectPath),
      version: this.version,
      message: {
        role: 'assistant',
        content: '',
      },
      toolResult: {
        id: toolId,
        output,
        error,
      },
    };

    await store.append(entry);
    return entry.uuid;
  }

  /**
   * 保存压缩边界和总结
   */
  async saveCompaction(
    sessionId: string,
    summary: string,
    metadata: CompactMetadata,
    parentUuid: string | null = null
  ): Promise<string> {
    const store = this.getStore(sessionId);

    // 1. 保存压缩边界标记
    const boundaryEntry: JSONLEntry = {
      uuid: nanoid(),
      parentUuid,
      sessionId,
      timestamp: new Date().toISOString(),
      type: 'system',
      subtype: 'compact_boundary',
      cwd: this.projectPath,
      gitBranch: detectGitBranch(this.projectPath),
      version: this.version,
      message: {
        role: 'system',
        content: '=== 上下文压缩边界 ===',
      },
      compactMetadata: metadata,
    };
    await store.append(boundaryEntry);

    // 2. 保存压缩总结
    const summaryEntry: JSONLEntry = {
      uuid: nanoid(),
      parentUuid: boundaryEntry.uuid,
      sessionId,
      timestamp: new Date().toISOString(),
      type: 'user',
      isCompactSummary: true,
      cwd: this.projectPath,
      version: this.version,
      message: {
        role: 'user',
        content: summary,
      },
      compactMetadata: metadata,
    };
    await store.append(summaryEntry);

    return summaryEntry.uuid;
  }

  /**
   * 加载会话
   */
  async loadSession(sessionId: string): Promise<SessionContext | null> {
    const store = this.getStore(sessionId);
    
    if (!store.exists()) {
      return null;
    }

    const entries = await store.readAll();
    if (entries.length === 0) {
      return null;
    }

    const firstEntry = entries[0];
    return {
      sessionId,
      preferences: {},
      startTime: new Date(firstEntry.timestamp).getTime(),
    };
  }

  /**
   * 加载对话历史
   */
  async loadConversation(sessionId: string): Promise<ConversationContext | null> {
    const store = this.getStore(sessionId);
    
    if (!store.exists()) {
      return null;
    }

    // 只加载压缩边界后的消息
    const entries = await store.readAfterCompaction();
    
    const messages: ContextMessage[] = [];
    let lastActivity = 0;

    for (const entry of entries) {
      const timestamp = new Date(entry.timestamp).getTime();
      if (timestamp > lastActivity) {
        lastActivity = timestamp;
      }

      // 跳过压缩边界
      if (entry.subtype === 'compact_boundary') {
        continue;
      }

      // 转换为 ContextMessage
      if (entry.type === 'user' || entry.type === 'assistant' || entry.type === 'system') {
        messages.push({
          id: entry.uuid,
          role: entry.message.role as ContextMessage['role'],
          content: typeof entry.message.content === 'string' 
            ? entry.message.content 
            : JSON.stringify(entry.message.content),
          timestamp,
          metadata: entry.isCompactSummary ? { isCompactSummary: true } : undefined,
        });
      }
    }

    return {
      messages,
      topics: [],
      lastActivity,
    };
  }

  /**
   * 获取所有会话 ID
   */
  async listSessions(): Promise<string[]> {
    const { readdir } = await import('node:fs/promises');
    const { getProjectStoragePath } = await import('./pathUtils.js');
    
    const storagePath = getProjectStoragePath(this.projectPath);
    
    try {
      const files = await readdir(storagePath);
      return files
        .filter(f => f.endsWith('.jsonl'))
        .map(f => f.replace('.jsonl', ''));
    } catch {
      return [];
    }
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId: string): Promise<void> {
    const store = this.getStore(sessionId);
    await store.delete();
  }

  /**
   * 获取会话统计
   */
  async getSessionStats(sessionId: string): Promise<{
    messageCount: number;
    fileSize: number;
    createdAt: Date | null;
    lastUpdatedAt: Date | null;
  } | null> {
    const store = this.getStore(sessionId);
    
    if (!store.exists()) {
      return null;
    }

    const entries = await store.readAll();
    const fileSize = await store.getFileSize();

    if (entries.length === 0) {
      return {
        messageCount: 0,
        fileSize,
        createdAt: null,
        lastUpdatedAt: null,
      };
    }

    return {
      messageCount: entries.length,
      fileSize,
      createdAt: new Date(entries[0].timestamp),
      lastUpdatedAt: new Date(entries[entries.length - 1].timestamp),
    };
  }
}
