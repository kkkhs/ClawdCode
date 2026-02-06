/**
 * 上下文管理类型定义
 */

import type { Message } from '../agent/types.js';

// ============================================================================
// 基础消息类型
// ============================================================================

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

/**
 * 工具调用记录
 */
export interface ToolCallRecord {
  id: string;
  name: string;
  input: unknown;
  output?: unknown;
  timestamp: number;
  status: 'pending' | 'success' | 'error';
  error?: string;
}

// ============================================================================
// 上下文分层
// ============================================================================

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
  recentCalls: ToolCallRecord[];
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
 * 上下文分层
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

// ============================================================================
// JSONL 存储格式
// ============================================================================

/**
 * JSONL 条目类型
 */
export type JSONLEntryType = 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'system';

/**
 * JSONL 条目
 */
export interface JSONLEntry {
  /** 消息唯一 ID (nanoid) */
  uuid: string;
  /** 父消息 ID (用于对话线程追踪) */
  parentUuid: string | null;
  /** 会话 ID */
  sessionId: string;
  /** ISO 8601 时间戳 */
  timestamp: string;
  /** 消息类型 */
  type: JSONLEntryType;
  /** 子类型 */
  subtype?: 'compact_boundary';
  /** 工作目录 */
  cwd: string;
  /** Git 分支 */
  gitBranch?: string;
  /** 版本号 */
  version: string;
  /** 消息内容 */
  message: {
    role: 'user' | 'assistant' | 'system';
    content: string | unknown;
    model?: string;
    usage?: { input_tokens: number; output_tokens: number };
  };
  /** 工具调用信息 */
  tool?: { id: string; name: string; input: unknown };
  /** 工具结果 */
  toolResult?: { id: string; output: unknown; error?: string };
  /** 压缩标记 */
  isCompactSummary?: boolean;
  compactMetadata?: CompactMetadata;
}

/**
 * 压缩元数据
 */
export interface CompactMetadata {
  trigger: 'auto' | 'manual';
  preTokens: number;
  postTokens?: number;
  filesIncluded?: string[];
}

// ============================================================================
// 存储选项
// ============================================================================

/**
 * 存储配置
 */
export interface StorageOptions {
  maxMemorySize: number;
  persistentPath: string;
  cacheSize: number;
  compressionEnabled: boolean;
}

/**
 * 过滤选项
 */
export interface FilterOptions {
  maxTokens: number;
  maxMessages: number;
  timeWindow: number;
}

/**
 * ContextManager 配置
 */
export interface ContextManagerOptions {
  storage: StorageOptions;
  defaultFilter: FilterOptions;
  compressionThreshold: number;
}

// ============================================================================
// 压缩服务
// ============================================================================

/**
 * 压缩选项
 */
export interface CompactionOptions {
  trigger: 'auto' | 'manual';
  modelName: string;
  maxContextTokens: number;
  actualPreTokens?: number;
  chatService?: unknown; // ChatService 类型
  sessionId?: string;    // 用于 Hook 上下文
  projectDir?: string;   // 用于 Hook 上下文
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
 * 文件引用
 */
export interface FileReference {
  path: string;
  mentions: number;
  lastMentioned: number;
  wasModified: boolean;
}

/**
 * 文件内容
 */
export interface FileContent {
  path: string;
  content: string;
  lines: number;
  truncated: boolean;
}

// ============================================================================
// 内存信息
// ============================================================================

/**
 * 内存使用情况
 */
export interface MemoryInfo {
  hasData: boolean;
  messageCount: number;
  toolCallCount: number;
  lastUpdated: number | null;
}
