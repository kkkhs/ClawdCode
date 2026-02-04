# 第八章：上下文管理

> **学习目标**：实现上下文管理器、Token 计数、对话压缩和会话持久化
> 
> **预计阅读时间**：50 分钟
> 
> **实践时间**：70 分钟
> 
> **前置要求**：已完成第七章的代码实现

---

## 8.1 上下文管理的挑战

### 8.1.1 为什么需要上下文管理

Coding Agent 与 LLM 的交互有几个特点：

| 挑战 | 说明 |
|------|------|
| **对话可能很长** | 一次代码重构可能涉及几十个文件操作 |
| **工具调用产生大量输出** | 读取文件、执行命令的结果都需要注入上下文 |
| **Token 有上限** | 超出限制会导致 API 调用失败 |
| **需要跨会话延续** | 用户可能希望"继续昨天的工作" |

### 8.1.2 核心设计目标

- **高效存储** - 快速读写当前会话
- **持久化** - 支持会话恢复
- **自动压缩** - Token 接近上限时自动压缩
- **优雅降级** - 压缩失败时有兜底策略

---

## 8.2 整体架构设计

### 8.2.1 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    ContextManager                            │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│  MemoryStore  │     │PersistentStore│     │  CacheStore   │
│  (内存存储)    │     │  (持久化存储)  │     │   (缓存层)    │
└───────────────┘     └───────────────┘     └───────────────┘
        │                     │                     │
        │                     ▼                     │
        │             ┌───────────────┐             │
        │             │  JSONL 文件   │             │
        │             └───────────────┘             │
        │                                           │
        └───────────────────┬───────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                       处理器                                 │
├─────────────────┬─────────────────┬─────────────────────────┤
│ TokenCounter    │ FileAnalyzer    │ CompactionService       │
│ (Token 计算)    │ (文件分析)      │ (对话压缩)              │
└─────────────────┴─────────────────┴─────────────────────────┘
```

### 8.2.2 分层设计

| 层级 | 组件 | 职责 | 特点 |
|------|------|------|------|
| 内存层 | `MemoryStore` | 当前会话的快速访问 | 最快、易失 |
| 持久层 | `PersistentStore` | 会话历史保存 | JSONL 格式、可恢复 |
| 缓存层 | `CacheStore` | 工具结果和压缩缓存 | TTL 过期、LRU 淘汰 |

### 8.2.3 目录结构

```
src/context/
├── types.ts              # 类型定义
├── ContextManager.ts     # 上下文管理器
├── TokenCounter.ts       # Token 计数器
├── FileAnalyzer.ts       # 文件分析器
├── CompactionService.ts  # 压缩服务
├── storage/              # 存储层
│   ├── MemoryStore.ts
│   ├── PersistentStore.ts
│   ├── CacheStore.ts
│   ├── JSONLStore.ts
│   ├── pathUtils.ts
│   └── index.ts
└── index.ts
```

---

## 8.3 类型定义

### 8.3.1 创建上下文类型

**文件位置**：`src/context/types.ts`

```typescript
/**
 * 上下文管理类型定义
 */

import type { Message } from '../agent/types.js';

// ========== 消息类型 ==========

/**
 * 上下文消息
 */
export interface ContextMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

// ========== 上下文层级 ==========

/**
 * 系统上下文
 */
export interface SystemContext {
  osType: string;
  osVersion: string;
  shell: string;
  nodeVersion: string;
  cwd: string;
}

/**
 * 会话上下文
 */
export interface SessionContext {
  sessionId: string;
  userId?: string;
  preferences: Record<string, unknown>;
  configuration?: Record<string, unknown>;
  startTime: number;
}

/**
 * 对话上下文
 */
export interface ConversationContext {
  messages: ContextMessage[];
  topics: string[];
  lastActivity: number;
}

/**
 * 工具上下文
 */
export interface ToolContext {
  recentCalls: Array<{
    toolName: string;
    timestamp: number;
    success: boolean;
  }>;
  toolStates: Record<string, unknown>;
  dependencies: Record<string, string[]>;
}

/**
 * 工作空间上下文
 */
export interface WorkspaceContext {
  projectPath: string;
  gitBranch?: string;
  gitRemote?: string;
  packageJson?: {
    name?: string;
    version?: string;
    dependencies?: Record<string, string>;
  };
}

/**
 * 上下文层级
 */
export interface ContextLayer {
  system: SystemContext;
  session: SessionContext;
  conversation: ConversationContext;
  tool: ToolContext;
  workspace: WorkspaceContext;
}

/**
 * 完整上下文数据
 */
export interface ContextData {
  layers: ContextLayer;
  metadata: {
    totalTokens: number;
    priority: number;
    relevanceScore?: number;
    lastUpdated: number;
  };
}

// ========== 配置类型 ==========

/**
 * 存储配置
 */
export interface StorageConfig {
  maxMemorySize: number;
  persistentPath: string;
  cacheSize: number;
  compressionEnabled: boolean;
}

/**
 * 过滤配置
 */
export interface FilterConfig {
  maxTokens: number;
  maxMessages: number;
  timeWindow: number;
}

/**
 * 上下文管理器选项
 */
export interface ContextManagerOptions {
  storage: StorageConfig;
  defaultFilter: FilterConfig;
  compressionThreshold: number;
}

// ========== 压缩相关 ==========

/**
 * 压缩选项
 */
export interface CompactionOptions {
  trigger: 'auto' | 'manual';
  modelName: string;
  maxContextTokens: number;
  actualPreTokens?: number;
  chatService?: unknown;
}

/**
 * 压缩结果
 */
export interface CompactionResult {
  success: boolean;
  summary: string;
  preTokens: number;
  postTokens: number;
  filesIncluded: string[];
  compactedMessages: Message[];
  error?: string;
}

/**
 * 文件内容
 */
export interface FileContent {
  path: string;
  content: string;
}

/**
 * 文件引用
 */
export interface FileReference {
  path: string;
  mentions: number;
  lastMentioned: number;
  wasModified: boolean;
}

// ========== JSONL 条目 ==========

/**
 * JSONL 条目格式
 */
export interface JSONLEntry {
  uuid: string;
  parentUuid: string | null;
  sessionId: string;
  timestamp: string;
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'system';
  subtype?: 'compact_boundary';
  cwd: string;
  gitBranch?: string;
  version: string;
  message: {
    role: 'user' | 'assistant' | 'system';
    content: string | unknown;
    model?: string;
    usage?: { input_tokens: number; output_tokens: number };
  };
  tool?: { id: string; name: string; input: unknown };
  toolResult?: { id: string; output: unknown; error?: string };
  isCompactSummary?: boolean;
  compactMetadata?: {
    trigger: 'auto' | 'manual';
    preTokens: number;
    postTokens?: number;
    filesIncluded?: string[];
  };
}
```

---

## 8.4 Token 计数器

### 8.4.1 创建 TokenCounter

**文件位置**：`src/context/TokenCounter.ts`

```typescript
/**
 * Token 计数器
 * 
 * 使用 js-tiktoken 计算消息的 token 数量
 */

import { encodingForModel, type Tiktoken } from 'js-tiktoken';
import type { Message } from '../agent/types.js';

export class TokenCounter {
  private static encodingCache = new Map<string, Tiktoken>();

  /**
   * 获取编码器（带缓存）
   */
  private static getEncoding(modelName: string): Tiktoken {
    // 规范化模型名称
    const normalizedModel = this.normalizeModelName(modelName);
    
    if (!this.encodingCache.has(normalizedModel)) {
      try {
        const encoding = encodingForModel(normalizedModel as any);
        this.encodingCache.set(normalizedModel, encoding);
      } catch {
        // 未知模型，使用 gpt-4 的编码
        const encoding = encodingForModel('gpt-4');
        this.encodingCache.set(normalizedModel, encoding);
      }
    }
    
    return this.encodingCache.get(normalizedModel)!;
  }

  /**
   * 规范化模型名称
   */
  private static normalizeModelName(modelName: string): string {
    if (modelName.includes('gpt-4')) return 'gpt-4';
    if (modelName.includes('gpt-3.5')) return 'gpt-3.5-turbo';
    return 'gpt-4'; // 默认
  }

  /**
   * 计算消息列表的 token 数量
   */
  static countTokens(messages: Message[], modelName: string): number {
    const encoding = this.getEncoding(modelName);
    let totalTokens = 0;

    for (const msg of messages) {
      // 每条消息的固定开销
      totalTokens += 4;

      // role
      if (msg.role) {
        totalTokens += encoding.encode(msg.role).length;
      }

      // content
      if (msg.content) {
        const content = typeof msg.content === 'string'
          ? msg.content
          : JSON.stringify(msg.content);
        totalTokens += encoding.encode(content).length;
      }

      // tool_calls
      if (msg.tool_calls) {
        totalTokens += this.countToolCallTokens(msg.tool_calls, encoding);
      }
    }

    // 最终的 assistant 回复开销
    totalTokens += 2;

    return totalTokens;
  }

  /**
   * 计算工具调用的 token 数
   */
  private static countToolCallTokens(
    toolCalls: Message['tool_calls'],
    encoding: Tiktoken
  ): number {
    if (!toolCalls) return 0;
    
    let tokens = 0;
    for (const tc of toolCalls) {
      tokens += encoding.encode(tc.function.name).length;
      tokens += encoding.encode(tc.function.arguments).length;
      tokens += 10; // 工具调用的固定开销
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
   * 快速粗略估算（不需要 encoding）
   * 
   * 适用于不需要精确值的场景
   */
  static estimateTokens(text: string): number {
    // 中文字符平均 1.5 个字符一个 token
    // 英文平均 4 个字符一个 token
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
  }

  /**
   * 清除编码器缓存
   */
  static clearCache(): void {
    this.encodingCache.clear();
  }
}
```

---

## 8.5 存储层实现

### 8.5.1 MemoryStore - 内存存储

**文件位置**：`src/context/storage/MemoryStore.ts`

```typescript
/**
 * 内存存储
 * 当前会话的快速访问层
 */

import type { ContextData, ContextMessage } from '../types.js';

export class MemoryStore {
  private contextData: ContextData | null = null;
  private readonly maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  /**
   * 设置上下文
   */
  setContext(context: ContextData): void {
    this.contextData = context;
  }

  /**
   * 获取上下文
   */
  getContext(): ContextData | null {
    return this.contextData;
  }

  /**
   * 添加消息
   */
  addMessage(message: ContextMessage): void {
    if (!this.contextData) {
      throw new Error('上下文数据未初始化');
    }

    this.contextData.layers.conversation.messages.push(message);
    this.contextData.layers.conversation.lastActivity = Date.now();
    this.contextData.metadata.lastUpdated = Date.now();

    this.enforceMemoryLimit();
  }

  /**
   * 获取消息列表
   */
  getMessages(): ContextMessage[] {
    return this.contextData?.layers.conversation.messages || [];
  }

  /**
   * 设置消息列表（用于压缩后更新）
   */
  setMessages(messages: ContextMessage[]): void {
    if (this.contextData) {
      this.contextData.layers.conversation.messages = messages;
    }
  }

  /**
   * 获取 Token 计数
   */
  getTokenCount(): number {
    return this.contextData?.metadata.totalTokens || 0;
  }

  /**
   * 更新 Token 计数
   */
  updateTokenCount(tokens: number): void {
    if (this.contextData) {
      this.contextData.metadata.totalTokens = tokens;
    }
  }

  /**
   * 清空存储
   */
  clear(): void {
    this.contextData = null;
  }

  /**
   * 强制内存限制
   */
  private enforceMemoryLimit(): void {
    if (!this.contextData) return;

    const messages = this.contextData.layers.conversation.messages;
    if (messages.length > this.maxSize) {
      // 保留最近 80% 的消息
      const keepCount = Math.floor(this.maxSize * 0.8);
      this.contextData.layers.conversation.messages = messages.slice(-keepCount);
    }
  }
}
```

### 8.5.2 JSONLStore - JSONL 文件操作

**文件位置**：`src/context/storage/JSONLStore.ts`

```typescript
/**
 * JSONL 文件存储
 * 支持追加写入和流式读取
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { JSONLEntry } from '../types.js';

export class JSONLStore {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  /**
   * 追加条目
   */
  async append(entry: JSONLEntry): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const line = JSON.stringify(entry) + '\n';
    await fs.appendFile(this.filePath, line, 'utf-8');
  }

  /**
   * 读取所有条目
   */
  async readAll(): Promise<JSONLEntry[]> {
    if (!existsSync(this.filePath)) {
      return [];
    }

    const content = await fs.readFile(this.filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim().length > 0);

    const entries: JSONLEntry[] = [];
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line) as JSONLEntry);
      } catch {
        console.warn(`[JSONLStore] 解析 JSON 行失败，跳过`);
      }
    }
    return entries;
  }

  /**
   * 获取文件路径
   */
  getFilePath(): string {
    return this.filePath;
  }

  /**
   * 检查文件是否存在
   */
  exists(): boolean {
    return existsSync(this.filePath);
  }

  /**
   * 删除文件
   */
  async delete(): Promise<void> {
    if (existsSync(this.filePath)) {
      await fs.unlink(this.filePath);
    }
  }
}
```

### 8.5.3 路径工具函数

**文件位置**：`src/context/storage/pathUtils.ts`

```typescript
/**
 * 存储路径工具函数
 */

import os from 'os';
import path from 'path';
import { execSync } from 'child_process';

/**
 * 获取存储根目录
 */
export function getStorageRoot(): string {
  return path.join(os.homedir(), '.clawdcode');
}

/**
 * 转义项目路径为目录名
 * /Users/foo/project → -Users-foo-project
 */
export function escapeProjectPath(absPath: string): string {
  const normalized = path.resolve(absPath);
  return normalized.replace(/\//g, '-').replace(/^-/, '');
}

/**
 * 获取项目的存储路径
 * @returns ~/.clawdcode/projects/{escaped-path}/
 */
export function getProjectStoragePath(projectPath: string): string {
  const escaped = escapeProjectPath(projectPath);
  return path.join(getStorageRoot(), 'projects', escaped);
}

/**
 * 获取会话文件路径
 */
export function getSessionFilePath(projectPath: string, sessionId: string): string {
  return path.join(getProjectStoragePath(projectPath), `${sessionId}.jsonl`);
}

/**
 * 检测 Git 分支
 */
export function detectGitBranch(projectPath: string): string | undefined {
  try {
    const result = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim();
  } catch {
    return undefined;
  }
}

/**
 * 检测 Git 远程
 */
export function detectGitRemote(projectPath: string): string | undefined {
  try {
    const result = execSync('git remote get-url origin', {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim();
  } catch {
    return undefined;
  }
}
```

### 8.5.4 PersistentStore - 持久化存储

**文件位置**：`src/context/storage/PersistentStore.ts`

```typescript
/**
 * 持久化存储
 * 管理会话的 JSONL 文件
 */

import fs from 'fs/promises';
import path from 'path';
import { nanoid } from 'nanoid';
import { JSONLStore } from './JSONLStore.js';
import { getProjectStoragePath, getSessionFilePath, detectGitBranch } from './pathUtils.js';
import type { JSONLEntry, ContextMessage, SessionContext, ConversationContext } from '../types.js';

export class PersistentStore {
  private readonly projectPath: string;
  private readonly maxSessions: number;
  private currentStore: JSONLStore | null = null;
  private currentSessionId: string | null = null;
  private lastParentUuid: string | null = null;

  constructor(projectPath: string, maxSessions: number = 100) {
    this.projectPath = projectPath;
    this.maxSessions = maxSessions;
  }

  /**
   * 保存消息
   */
  async saveMessage(
    sessionId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    parentUuid: string | null = null,
    metadata?: {
      model?: string;
      usage?: { input_tokens: number; output_tokens: number };
      toolCalls?: Array<{ id: string; name: string; input: unknown }>;
    }
  ): Promise<string> {
    const store = this.getOrCreateStore(sessionId);
    const uuid = nanoid();

    const entry: JSONLEntry = {
      uuid,
      parentUuid: parentUuid || this.lastParentUuid,
      sessionId,
      timestamp: new Date().toISOString(),
      type: role,
      cwd: this.projectPath,
      gitBranch: detectGitBranch(this.projectPath),
      version: '0.1.0',
      message: {
        role,
        content,
        model: metadata?.model,
        usage: metadata?.usage,
      },
    };

    await store.append(entry);
    this.lastParentUuid = uuid;

    return uuid;
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
    const store = this.getOrCreateStore(sessionId);
    const uuid = nanoid();

    const entry: JSONLEntry = {
      uuid,
      parentUuid: parentUuid || this.lastParentUuid,
      sessionId,
      timestamp: new Date().toISOString(),
      type: 'tool_use',
      cwd: this.projectPath,
      gitBranch: detectGitBranch(this.projectPath),
      version: '0.1.0',
      message: { role: 'assistant', content: '' },
      tool: { id: toolId, name: toolName, input },
    };

    await store.append(entry);
    this.lastParentUuid = uuid;

    return uuid;
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
    const store = this.getOrCreateStore(sessionId);
    const uuid = nanoid();

    const entry: JSONLEntry = {
      uuid,
      parentUuid: parentUuid || this.lastParentUuid,
      sessionId,
      timestamp: new Date().toISOString(),
      type: 'tool_result',
      cwd: this.projectPath,
      gitBranch: detectGitBranch(this.projectPath),
      version: '0.1.0',
      message: { role: 'system', content: '' },
      toolResult: { id: toolId, output, error },
    };

    await store.append(entry);
    this.lastParentUuid = uuid;

    return uuid;
  }

  /**
   * 保存压缩记录
   */
  async saveCompaction(
    sessionId: string,
    summary: string,
    metadata: {
      trigger: 'auto' | 'manual';
      preTokens: number;
      postTokens?: number;
      filesIncluded?: string[];
    }
  ): Promise<void> {
    const store = this.getOrCreateStore(sessionId);

    // 压缩边界
    const boundaryEntry: JSONLEntry = {
      uuid: nanoid(),
      parentUuid: this.lastParentUuid,
      sessionId,
      timestamp: new Date().toISOString(),
      type: 'system',
      subtype: 'compact_boundary',
      cwd: this.projectPath,
      version: '0.1.0',
      message: { role: 'system', content: '=== Context Compaction Boundary ===' },
      compactMetadata: metadata,
    };

    await store.append(boundaryEntry);

    // 总结消息
    const summaryEntry: JSONLEntry = {
      uuid: nanoid(),
      parentUuid: boundaryEntry.uuid,
      sessionId,
      timestamp: new Date().toISOString(),
      type: 'user',
      cwd: this.projectPath,
      version: '0.1.0',
      message: { role: 'user', content: summary },
      isCompactSummary: true,
      compactMetadata: metadata,
    };

    await store.append(summaryEntry);
    this.lastParentUuid = summaryEntry.uuid;
  }

  /**
   * 加载会话
   */
  async loadSession(sessionId: string): Promise<SessionContext | null> {
    const filePath = getSessionFilePath(this.projectPath, sessionId);
    const store = new JSONLStore(filePath);

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
    const filePath = getSessionFilePath(this.projectPath, sessionId);
    const store = new JSONLStore(filePath);

    if (!store.exists()) {
      return null;
    }

    const entries = await store.readAll();
    if (entries.length === 0) {
      return null;
    }

    // 找到最后一个压缩边界，从那里开始
    let startIndex = 0;
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].subtype === 'compact_boundary') {
        startIndex = i;
        break;
      }
    }

    // 转换为 ContextMessage
    const messages: ContextMessage[] = [];
    for (let i = startIndex; i < entries.length; i++) {
      const entry = entries[i];
      if (entry.type === 'user' || entry.type === 'assistant') {
        messages.push({
          id: entry.uuid,
          role: entry.message.role as ContextMessage['role'],
          content: typeof entry.message.content === 'string'
            ? entry.message.content
            : JSON.stringify(entry.message.content),
          timestamp: new Date(entry.timestamp).getTime(),
        });
      }
    }

    return {
      messages,
      topics: [],
      lastActivity: Date.now(),
    };
  }

  /**
   * 列出所有会话
   */
  async listSessions(): Promise<string[]> {
    const storagePath = getProjectStoragePath(this.projectPath);
    
    try {
      const files = await fs.readdir(storagePath);
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
    const filePath = getSessionFilePath(this.projectPath, sessionId);
    try {
      await fs.unlink(filePath);
    } catch {
      // 忽略不存在的文件
    }
  }

  /**
   * 获取或创建存储
   */
  private getOrCreateStore(sessionId: string): JSONLStore {
    if (this.currentSessionId !== sessionId || !this.currentStore) {
      const filePath = getSessionFilePath(this.projectPath, sessionId);
      this.currentStore = new JSONLStore(filePath);
      this.currentSessionId = sessionId;
      this.lastParentUuid = null;
    }
    return this.currentStore;
  }
}
```

### 8.5.5 CacheStore - 缓存层

**文件位置**：`src/context/storage/CacheStore.ts`

```typescript
/**
 * 缓存存储
 * 支持 TTL 和 LRU 淘汰
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  lastAccessed: number;
}

export class CacheStore {
  private cache = new Map<string, CacheEntry<unknown>>();
  private readonly maxSize: number;
  private readonly defaultTTL: number;

  constructor(maxSize: number = 100, defaultTTL: number = 5 * 60 * 1000) {
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
  }

  /**
   * 获取缓存
   */
  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return undefined;
    }

    // 检查是否过期
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    // 更新访问时间
    entry.lastAccessed = Date.now();
    return entry.value as T;
  }

  /**
   * 设置缓存
   */
  set<T>(key: string, value: T, ttl?: number): void {
    // 检查是否需要淘汰
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttl || this.defaultTTL),
      lastAccessed: Date.now(),
    });
  }

  /**
   * 删除缓存
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * LRU 淘汰
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      // 同时清理过期项
      if (Date.now() > entry.expiresAt) {
        this.cache.delete(key);
        continue;
      }

      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
}
```

---

## 8.6 文件分析器

**文件位置**：`src/context/FileAnalyzer.ts`

```typescript
/**
 * 文件分析器
 * 从消息历史中提取文件引用，用于压缩时包含重要文件
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import type { Message } from '../agent/types.js';
import type { FileReference, FileContent } from './types.js';

export class FileAnalyzer {
  private static readonly MAX_FILES = 5;
  private static readonly MAX_LINES_PER_FILE = 1000;

  /**
   * 分析消息中的文件引用
   */
  static analyzeFiles(messages: Message[]): FileReference[] {
    const fileMap = new Map<string, FileReference>();

    messages.forEach((msg, index) => {
      // 从消息内容中提取文件路径
      const contentFiles = this.extractFilePathsFromContent(
        typeof msg.content === 'string' ? msg.content : ''
      );
      contentFiles.forEach(path => {
        this.updateFileReference(fileMap, path, index, false);
      });

      // 从工具调用中提取文件路径
      if (msg.tool_calls) {
        msg.tool_calls.forEach(call => {
          const toolFiles = this.extractFilePathsFromToolCall(call);
          const wasModified = ['Write', 'Edit'].includes(call.function?.name || '');
          toolFiles.forEach(path => {
            this.updateFileReference(fileMap, path, index, wasModified);
          });
        });
      }
    });

    // 按重要性排序
    return Array.from(fileMap.values())
      .sort((a, b) => {
        // 1. 被修改的文件优先
        if (a.wasModified !== b.wasModified) return a.wasModified ? -1 : 1;
        // 2. 提及次数多的优先
        if (a.mentions !== b.mentions) return b.mentions - a.mentions;
        // 3. 最近提及的优先
        return b.lastMentioned - a.lastMentioned;
      })
      .slice(0, this.MAX_FILES);
  }

  /**
   * 读取文件内容
   */
  static async readFilesContent(paths: string[]): Promise<FileContent[]> {
    const contents: FileContent[] = [];

    for (const filePath of paths) {
      try {
        if (!existsSync(filePath)) {
          continue;
        }

        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');

        // 限制行数
        const truncated = lines.length > this.MAX_LINES_PER_FILE
          ? lines.slice(0, this.MAX_LINES_PER_FILE).join('\n') + '\n... (truncated)'
          : content;

        contents.push({ path: filePath, content: truncated });
      } catch {
        // 忽略读取失败的文件
      }
    }

    return contents;
  }

  /**
   * 从内容中提取文件路径
   */
  private static extractFilePathsFromContent(content: string): string[] {
    const paths: string[] = [];

    // 匹配绝对路径
    const absolutePathRegex = /(?:^|[\s"'`])(\/.+?\.[a-zA-Z0-9]+)/g;
    let match;
    while ((match = absolutePathRegex.exec(content)) !== null) {
      paths.push(match[1]);
    }

    return [...new Set(paths)];
  }

  /**
   * 从工具调用中提取文件路径
   */
  private static extractFilePathsFromToolCall(
    toolCall: { function: { name: string; arguments: string } }
  ): string[] {
    try {
      const args = JSON.parse(toolCall.function.arguments);
      const paths: string[] = [];

      // 常见的路径参数名
      const pathKeys = ['file_path', 'path', 'target', 'source', 'destination'];
      for (const key of pathKeys) {
        if (typeof args[key] === 'string') {
          paths.push(args[key]);
        }
      }

      return paths;
    } catch {
      return [];
    }
  }

  /**
   * 更新文件引用
   */
  private static updateFileReference(
    fileMap: Map<string, FileReference>,
    path: string,
    messageIndex: number,
    wasModified: boolean
  ): void {
    const existing = fileMap.get(path);
    if (existing) {
      existing.mentions++;
      existing.lastMentioned = messageIndex;
      if (wasModified) existing.wasModified = true;
    } else {
      fileMap.set(path, {
        path,
        mentions: 1,
        lastMentioned: messageIndex,
        wasModified,
      });
    }
  }
}
```

---

## 8.7 对话压缩服务

**文件位置**：`src/context/CompactionService.ts`

```typescript
/**
 * 对话压缩服务
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

      // 2. 生成总结
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
      // 降级策略
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
    // 如果有 chatService，使用 LLM 生成总结
    if (options.chatService) {
      const prompt = this.buildCompactionPrompt(messages, fileContents);
      try {
        const response = await (options.chatService as any).chat([
          { role: 'system', content: 'You are a helpful assistant that creates concise summaries.' },
          { role: 'user', content: prompt },
        ]);
        return response.content || this.createFallbackSummary(messages);
      } catch {
        return this.createFallbackSummary(messages);
      }
    }

    return this.createFallbackSummary(messages);
  }

  /**
   * 构建压缩提示词
   */
  private static buildCompactionPrompt(
    messages: Message[],
    fileContents: FileContent[]
  ): string {
    const messagesText = messages.map((msg, i) => {
      const content = typeof msg.content === 'string'
        ? msg.content
        : JSON.stringify(msg.content);
      const truncated = content.length > 5000
        ? content.substring(0, 5000) + '...'
        : content;
      return `[${i + 1}] ${msg.role}: ${truncated}`;
    }).join('\n\n');

    const filesText = fileContents.map(file =>
      `### ${file.path}\n\`\`\`\n${file.content}\n\`\`\``
    ).join('\n\n');

    return `Create a summary of this conversation that preserves key information for continuing the work.

## Conversation History
${messagesText}

${fileContents.length > 0 ? `## Important Files\n\n${filesText}` : ''}

Include:
1. Primary request and intent
2. Key technical decisions
3. Files modified
4. Errors encountered and fixes
5. Current work status
6. Pending tasks`;
  }

  /**
   * 创建回退总结（不使用 LLM）
   */
  private static createFallbackSummary(messages: Message[]): string {
    const userMessages = messages.filter(m => m.role === 'user');
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    const toolCalls = messages.filter(m => m.tool_calls?.length);

    const userSummary = userMessages.slice(-5).map(m => {
      const content = typeof m.content === 'string' ? m.content : '';
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
This is an auto-generated summary. Some context may have been lost.`;
  }

  /**
   * 过滤孤儿 tool 消息
   */
  private static filterOrphanToolMessages(messages: Message[]): Message[] {
    const availableToolCallIds = new Set<string>();
    
    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          if (tc.id) availableToolCallIds.add(tc.id);
        }
      }
    }

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
      content: `[Previous conversation summary]\n\n${summary}\n\n[End of summary]`,
    };
  }

  /**
   * 降级策略
   */
  private static fallbackCompact(
    messages: Message[],
    options: CompactionOptions,
    preTokens: number,
    error: unknown
  ): CompactionResult {
    console.warn('[CompactionService] 使用降级策略', error);

    const retainCount = Math.ceil(messages.length * this.FALLBACK_RETAIN_PERCENT);
    const candidateMessages = messages.slice(-retainCount);
    const retainedMessages = this.filterOrphanToolMessages(candidateMessages);

    const errorMsg = error instanceof Error ? error.message : String(error);
    const summaryMessage = this.createSummaryMessage(
      nanoid(),
      `[Compaction failed; using fallback]\n\nRetained latest ${retainCount} messages (~30%).\n\nError: ${errorMsg}`
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
}
```

---

## 8.8 ContextManager 主类

**文件位置**：`src/context/ContextManager.ts`

```typescript
/**
 * 上下文管理器
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
        timeWindow: 24 * 60 * 60 * 1000,
        ...options.defaultFilter,
      },
      compressionThreshold: options.compressionThreshold || 100000,
    };

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
    const sessionId = (configuration.sessionId as string) || nanoid();
    const now = Date.now();

    const contextData: ContextData = {
      layers: {
        system: await this.createSystemContext(),
        session: { sessionId, userId, preferences, configuration, startTime: now },
        conversation: { messages: [], topics: [], lastActivity: now },
        tool: { recentCalls: [], toolStates: {}, dependencies: {} },
        workspace: await this.createWorkspaceContext(),
      },
      metadata: { totalTokens: 0, priority: 1, lastUpdated: now },
    };

    this.memory.setContext(contextData);
    this.currentSessionId = sessionId;
    return sessionId;
  }

  /**
   * 添加消息
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

    this.memory.addMessage(message);

    // 检查是否需要压缩
    const contextData = this.memory.getContext();
    if (contextData && this.shouldCompress(contextData)) {
      await this.compressCurrentContext();
    }

    // 异步保存
    this.saveMessageAsync(message);
  }

  /**
   * 判断是否需要压缩
   */
  private shouldCompress(contextData: ContextData): boolean {
    return contextData.metadata.totalTokens > this.options.compressionThreshold;
  }

  /**
   * 压缩当前上下文
   */
  async compressCurrentContext(): Promise<CompactionResult | null> {
    const contextData = this.memory.getContext();
    if (!contextData) return null;

    const messages = contextData.layers.conversation.messages.map(m => ({
      role: m.role as 'user' | 'assistant' | 'system' | 'tool',
      content: m.content,
    }));

    const result = await CompactionService.compact(messages, {
      trigger: 'auto',
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
        await this.persistent.saveCompaction(this.currentSessionId, result.summary, {
          trigger: 'auto',
          preTokens: result.preTokens,
          postTokens: result.postTokens,
          filesIncluded: result.filesIncluded,
        });
      }
    }

    return result;
  }

  /**
   * 加载现有会话
   */
  async loadSession(sessionId: string): Promise<boolean> {
    try {
      const [session, conversation] = await Promise.all([
        this.persistent.loadSession(sessionId),
        this.persistent.loadConversation(sessionId),
      ]);

      if (!session || !conversation) return false;

      const contextData: ContextData = {
        layers: {
          system: await this.createSystemContext(),
          session,
          conversation,
          tool: { recentCalls: [], toolStates: {}, dependencies: {} },
          workspace: await this.createWorkspaceContext(),
        },
        metadata: { totalTokens: 0, priority: 1, lastUpdated: Date.now() },
      };

      this.memory.setContext(contextData);
      this.currentSessionId = sessionId;
      return true;
    } catch {
      return false;
    }
  }

  // ... 其他辅助方法 ...

  private async createSystemContext(): Promise<SystemContext> {
    return {
      osType: os.type(),
      osVersion: os.release(),
      shell: process.env.SHELL || 'unknown',
      nodeVersion: process.version,
      cwd: process.cwd(),
    };
  }

  private async createWorkspaceContext(): Promise<WorkspaceContext> {
    const projectPath = process.cwd();
    return {
      projectPath,
      gitBranch: detectGitBranch(projectPath),
      gitRemote: detectGitRemote(projectPath),
    };
  }

  private saveMessageAsync(message: ContextMessage): void {
    if (!this.currentSessionId) return;
    setImmediate(async () => {
      try {
        await this.persistent.saveMessage(
          this.currentSessionId!,
          message.role as 'user' | 'assistant' | 'system',
          message.content
        );
      } catch (error) {
        console.error('[ContextManager] 保存消息失败:', error);
      }
    });
  }

  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  getContext(): ContextData | null {
    return this.memory.getContext();
  }

  getMessages(): ContextMessage[] {
    return this.memory.getMessages();
  }
}
```

---

## 8.9 本章小结

### 完成的内容

| 文件 | 内容 |
|------|------|
| `src/context/types.ts` | 上下文类型定义 |
| `src/context/TokenCounter.ts` | Token 计数器 |
| `src/context/FileAnalyzer.ts` | 文件分析器 |
| `src/context/CompactionService.ts` | 压缩服务 |
| `src/context/ContextManager.ts` | 上下文管理器 |
| `src/context/storage/*.ts` | 三层存储实现 |

### 技术亮点

| 亮点 | 说明 |
|------|------|
| **三层存储架构** | 内存/持久化/缓存分离 |
| **JSONL 格式** | 追加友好、故障恢复、人类可读 |
| **80% 阈值自动压缩** | LLM 生成高质量总结 |
| **优雅降级** | LLM 失败时简单截断 |
| **孤儿消息过滤** | 保证工具调用完整性 |
| **项目隔离存储** | 不同项目会话互不干扰 |

### 压缩触发条件

```
           ↓ 当前 Token
═══════════════════════════════════
0%                              100%
          80% (阈值)
           │
           ▼ 触发压缩
```

---

## 8.10 本章遗留项

::: info 以下功能将在后续章节实现
根据项目规划，部分功能需要其他模块支持，将在后续章节补充。
:::

| 功能 | 说明 | 计划章节 |
|------|------|----------|
| **Agent 集成 ContextManager** | Agent 使用 ContextManager 管理消息和会话持久化 | 第 11 章 |
| **/compact 斜杠命令** | 用户手动触发压缩 | 第 9 章 |

### 当前状态

本章实现的上下文管理模块是**独立完整**的：

- ✅ ContextManager 上下文管理器
- ✅ TokenCounter Token 计算（使用 js-tiktoken）
- ✅ CompactionService 压缩服务
- ✅ FileAnalyzer 文件分析
- ✅ 三层存储架构（Memory/Persistent/Cache）
- ✅ JSONL 持久化格式
- ✅ 80% 阈值自动压缩 + 降级策略

### 为什么分开讲解？

1. **模块独立性** - 上下文管理是独立的关注点，可以单独测试
2. **渐进式学习** - 先理解核心概念，再在第 11 章学习完整集成
3. **灵活性** - 你可以根据项目需求选择是否使用完整的上下文管理

### 快速测试本章代码

```bash
# 测试 Token 计数和压缩服务
bun run src/context/test.ts
```

---

## 下一章预告

在 **第九章** 中，我们将：
1. 深入 Ink UI 系统
2. 实现确认提示组件
3. 实现 Markdown 渲染
4. 实现主题系统

这将让 CLI 界面更加美观和易用！
