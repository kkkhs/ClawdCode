/**
 * 上下文管理器
 * 
 * 统一管理会话上下文的创建、加载、保存和压缩
 */

import { nanoid } from 'nanoid';
import * as os from 'node:os';
import type {
  ContextData,
  ContextMessage,
  ContextManagerOptions,
  SystemContext,
  WorkspaceContext,
  CompactionResult,
} from './types.js';
import { MemoryStore, PersistentStore, CacheStore, getStorageRoot, detectGitBranch, detectGitRemote } from './storage/index.js';
import { TokenCounter } from './TokenCounter.js';
import { CompactionService } from './CompactionService.js';

export class ContextManager {
  private readonly memory: MemoryStore;
  private readonly persistent: PersistentStore;
  private readonly cache: CacheStore;
  private readonly options: ContextManagerOptions;

  private currentSessionId: string | null = null;

  constructor(options: Partial<ContextManagerOptions> = {}) {
    // 默认配置
    this.options = {
      storage: {
        maxMemorySize: 1000,
        persistentPath: getStorageRoot(),
        cacheSize: 100,
        compressionEnabled: true,
        ...options.storage,
      },
      defaultFilter: {
        maxTokens: 32000,
        maxMessages: 50,
        timeWindow: 24 * 60 * 60 * 1000, // 24小时
        ...options.defaultFilter,
      },
      compressionThreshold: options.compressionThreshold || 100000, // 100k tokens
    };

    // 初始化存储层
    this.memory = new MemoryStore(this.options.storage.maxMemorySize);
    this.persistent = new PersistentStore(process.cwd(), 100);
    this.cache = new CacheStore(this.options.storage.cacheSize, 5 * 60 * 1000);
  }

  /**
   * 创建新会话
   */
  async createSession(
    userId?: string,
    preferences: Record<string, unknown> = {},
    configuration: Record<string, unknown> = {}
  ): Promise<string> {
    // 使用 nanoid 生成会话 ID，或使用提供的 sessionId
    const sessionId = (configuration.sessionId as string) || nanoid();
    const now = Date.now();

    // 创建初始上下文
    const contextData: ContextData = {
      layers: {
        system: await this.createSystemContext(),
        session: {
          sessionId,
          userId,
          preferences,
          configuration,
          startTime: now,
        },
        conversation: {
          messages: [],
          topics: [],
          lastActivity: now,
        },
        tool: {
          recentCalls: [],
          toolStates: {},
          dependencies: {},
        },
        workspace: await this.createWorkspaceContext(),
      },
      metadata: {
        totalTokens: 0,
        priority: 1,
        lastUpdated: now,
      },
    };

    // 存储到内存
    this.memory.setContext(contextData);

    this.currentSessionId = sessionId;
    return sessionId;
  }

  /**
   * 创建系统上下文
   */
  private async createSystemContext(): Promise<SystemContext> {
    return {
      osType: os.type(),
      osVersion: os.release(),
      shell: process.env.SHELL || 'unknown',
      nodeVersion: process.version,
      cwd: process.cwd(),
    };
  }

  /**
   * 创建工作空间上下文
   */
  private async createWorkspaceContext(): Promise<WorkspaceContext> {
    const projectPath = process.cwd();

    // 尝试读取 package.json
    let packageJson: WorkspaceContext['packageJson'];
    try {
      const { readFile } = await import('node:fs/promises');
      const { join } = await import('node:path');
      const content = await readFile(join(projectPath, 'package.json'), 'utf-8');
      const pkg = JSON.parse(content);
      packageJson = {
        name: pkg.name,
        version: pkg.version,
        dependencies: pkg.dependencies,
      };
    } catch {
      // 忽略错误
    }

    return {
      projectPath,
      gitBranch: detectGitBranch(projectPath),
      gitRemote: detectGitRemote(projectPath),
      packageJson,
    };
  }

  /**
   * 添加消息到当前会话
   */
  async addMessage(
    role: ContextMessage['role'],
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    if (!this.currentSessionId) {
      throw new Error('没有活动会话');
    }

    const message: ContextMessage = {
      id: nanoid(),
      role,
      content,
      timestamp: Date.now(),
      metadata,
    };

    // 添加到内存
    this.memory.addMessage(message);

    // 检查是否需要压缩
    const contextData = this.memory.getContext();
    if (contextData && this.shouldCompress(contextData)) {
      await this.compressCurrentContext();
    }

    // 异步保存到持久化存储（不阻塞主流程）
    this.saveMessageAsync(message);
  }

  /**
   * 判断是否需要压缩
   */
  private shouldCompress(contextData: ContextData): boolean {
    return contextData.metadata.totalTokens > this.options.compressionThreshold;
  }

  /**
   * 异步保存消息
   */
  private saveMessageAsync(message: ContextMessage): void {
    if (!this.currentSessionId) return;

    // 使用 setImmediate 避免阻塞
    setImmediate(async () => {
      try {
        await this.persistent.saveMessage(
          this.currentSessionId!,
          message.role as 'user' | 'assistant' | 'system',
          message.content,
          null,
          message.metadata as any
        );
      } catch (error) {
        console.error('[ContextManager] 保存消息失败:', error);
      }
    });
  }

  /**
   * 压缩当前上下文
   */
  async compressCurrentContext(): Promise<CompactionResult | null> {
    const contextData = this.memory.getContext();
    if (!contextData) {
      return null;
    }

    const messages = contextData.layers.conversation.messages.map(m => ({
      role: m.role as 'user' | 'assistant' | 'system' | 'tool',
      content: m.content,
    }));

    const result = await CompactionService.compact(messages, {
      trigger: 'auto',
      modelName: 'gpt-4', // TODO: 从配置获取
      maxContextTokens: this.options.compressionThreshold,
    });

    if (result.success) {
      // 更新内存中的消息
      const newMessages: ContextMessage[] = result.compactedMessages.map(m => ({
        id: nanoid(),
        role: m.role as ContextMessage['role'],
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        timestamp: Date.now(),
      }));

      this.memory.setMessages(newMessages);
      this.memory.updateTokenCount(result.postTokens);

      // 保存压缩记录
      if (this.currentSessionId) {
        await this.persistent.saveCompaction(
          this.currentSessionId,
          result.summary,
          {
            trigger: 'auto',
            preTokens: result.preTokens,
            postTokens: result.postTokens,
            filesIncluded: result.filesIncluded,
          }
        );
      }
    }

    return result;
  }

  /**
   * 手动压缩
   */
  async manualCompact(): Promise<CompactionResult | null> {
    const contextData = this.memory.getContext();
    if (!contextData) {
      return null;
    }

    const messages = contextData.layers.conversation.messages.map(m => ({
      role: m.role as 'user' | 'assistant' | 'system' | 'tool',
      content: m.content,
    }));

    const result = await CompactionService.compact(messages, {
      trigger: 'manual',
      modelName: 'gpt-4',
      maxContextTokens: this.options.compressionThreshold,
    });

    if (result.success) {
      const newMessages: ContextMessage[] = result.compactedMessages.map(m => ({
        id: nanoid(),
        role: m.role as ContextMessage['role'],
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        timestamp: Date.now(),
      }));

      this.memory.setMessages(newMessages);
      this.memory.updateTokenCount(result.postTokens);

      if (this.currentSessionId) {
        await this.persistent.saveCompaction(
          this.currentSessionId,
          result.summary,
          {
            trigger: 'manual',
            preTokens: result.preTokens,
            postTokens: result.postTokens,
            filesIncluded: result.filesIncluded,
          }
        );
      }
    }

    return result;
  }

  /**
   * 加载现有会话
   */
  async loadSession(sessionId: string): Promise<boolean> {
    try {
      // 先尝试从内存加载
      let contextData = this.memory.getContext();

      if (!contextData || contextData.layers.session.sessionId !== sessionId) {
        // 从持久化存储加载
        const [session, conversation] = await Promise.all([
          this.persistent.loadSession(sessionId),
          this.persistent.loadConversation(sessionId),
        ]);

        if (!session || !conversation) {
          return false;
        }

        // 重建完整的上下文数据
        contextData = {
          layers: {
            system: await this.createSystemContext(),
            session,
            conversation,
            tool: { recentCalls: [], toolStates: {}, dependencies: {} },
            workspace: await this.createWorkspaceContext(),
          },
          metadata: {
            totalTokens: 0,
            priority: 1,
            lastUpdated: Date.now(),
          },
        };

        this.memory.setContext(contextData);
      }

      this.currentSessionId = sessionId;
      return true;
    } catch (error) {
      console.error('[ContextManager] 加载会话失败:', error);
      return false;
    }
  }

  /**
   * 获取当前会话 ID
   */
  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * 获取当前上下文数据
   */
  getContext(): ContextData | null {
    return this.memory.getContext();
  }

  /**
   * 获取消息列表
   */
  getMessages(): ContextMessage[] {
    return this.memory.getMessages();
  }

  /**
   * 获取 Token 计数
   */
  getTokenCount(): number {
    return this.memory.getTokenCount();
  }

  /**
   * 更新 Token 计数
   */
  updateTokenCount(tokens: number): void {
    this.memory.updateTokenCount(tokens);
  }

  /**
   * 获取缓存项
   */
  getCache<T>(key: string): T | undefined {
    return this.cache.get<T>(key);
  }

  /**
   * 设置缓存项
   */
  setCache<T>(key: string, value: T, ttl?: number): void {
    this.cache.set(key, value, ttl);
  }

  /**
   * 列出所有会话
   */
  async listSessions(): Promise<string[]> {
    return this.persistent.listSessions();
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId: string): Promise<void> {
    await this.persistent.deleteSession(sessionId);
    
    if (this.currentSessionId === sessionId) {
      this.memory.clear();
      this.currentSessionId = null;
    }
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    this.memory.clear();
    this.cache.clear();
    TokenCounter.clearCache();
  }
}
