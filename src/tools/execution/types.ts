/**
 * 执行管道类型定义
 */

import type { Tool, ToolResult, ToolInvocation } from '../types.js';

// ========== 权限模式 ==========

/**
 * 权限模式
 */
export enum PermissionMode {
  /** 默认模式：写操作需确认 */
  DEFAULT = 'default',
  /** 自动批准编辑 */
  AUTO_EDIT = 'autoEdit',
  /** 自动批准所有 */
  YOLO = 'yolo',
  /** 只读调研模式 */
  PLAN = 'plan',
}

// ========== 权限检查 ==========

/**
 * 权限检查结果
 */
export enum PermissionResult {
  ALLOW = 'allow',
  ASK = 'ask',
  DENY = 'deny',
}

/**
 * 权限检查结果详情
 */
export interface PermissionCheckResult {
  result: PermissionResult;
  matchedRule?: string;
  reason?: string;
}

/**
 * 权限配置
 */
export interface PermissionConfig {
  allow: string[];
  deny: string[];
  ask: string[];
}

/**
 * 工具调用描述符（用于权限检查）
 */
export interface ToolInvocationDescriptor {
  toolName: string;
  params: Record<string, unknown>;
  affectedPaths?: string[];
  tool?: Tool;
}

// ========== 确认机制 ==========

/**
 * 确认详情
 */
export interface ConfirmationDetails {
  title: string;
  message: string;
  details?: string;
  risks?: string[];
  affectedFiles?: string[];
}

/**
 * 确认响应
 */
export interface ConfirmationResponse {
  approved: boolean;
  reason?: string;
  scope?: 'once' | 'session';
}

/**
 * 确认处理器
 */
export interface ConfirmationHandler {
  requestConfirmation(details: ConfirmationDetails): Promise<ConfirmationResponse>;
}

// ========== 执行上下文 ==========

/**
 * 管道执行上下文（扩展自工具执行上下文）
 */
export interface PipelineExecutionContext {
  sessionId: string;
  workspaceRoot: string;
  permissionMode: PermissionMode;
  signal?: AbortSignal;
  onProgress?: (progress: ToolProgress) => void;
  confirmationHandler?: ConfirmationHandler;
  messageId?: string;
}

/**
 * 工具进度
 */
export interface ToolProgress {
  stage: string;
  message: string;
  percent?: number;
}

// ========== 工具执行 ==========

/**
 * 工具执行内部状态
 */
export interface ToolExecutionInternal {
  tool?: Tool;
  invocation?: ToolInvocation;
  needsConfirmation?: boolean;
  confirmationReason?: string;
  permissionSignature?: string;
  hookToolUseId?: string;
}

/**
 * 工具执行实例
 */
export class ToolExecution {
  private result?: ToolResult;
  private aborted = false;
  private abortReason?: string;

  readonly _internal: ToolExecutionInternal = {};

  constructor(
    public readonly toolName: string,
    public params: Record<string, unknown>,
    public readonly context: PipelineExecutionContext
  ) {}

  /**
   * 中止执行
   */
  abort(reason: string): void {
    this.aborted = true;
    this.abortReason = reason;
  }

  /**
   * 是否已中止
   */
  isAborted(): boolean {
    return this.aborted;
  }

  /**
   * 获取中止原因
   */
  getAbortReason(): string | undefined {
    return this.abortReason;
  }

  /**
   * 设置结果
   */
  setResult(result: ToolResult): void {
    this.result = result;
  }

  /**
   * 获取结果
   */
  getResult(): ToolResult | undefined {
    return this.result;
  }
}

// ========== 管道阶段 ==========

/**
 * 管道阶段接口
 */
export interface PipelineStage {
  readonly name: string;
  process(execution: ToolExecution): Promise<void>;
}

// ========== 管道配置 ==========

/**
 * 执行管道配置
 */
export interface ExecutionPipelineConfig {
  permissions?: PermissionConfig;
  defaultMode?: PermissionMode;
}

// ========== 执行历史 ==========

/**
 * 执行历史条目
 */
export interface ExecutionHistoryEntry {
  toolName: string;
  params: Record<string, unknown>;
  result: ToolResult;
  timestamp: number;
  duration: number;
  permissionMode: PermissionMode;
  stages: string[];
}

// ========== Hook 相关 ==========

/**
 * Pre-Tool Hook 结果
 */
export interface PreToolHookResult {
  decision: 'allow' | 'ask' | 'deny';
  modifiedInput?: Record<string, unknown>;
  reason?: string;
  warning?: string;
}

/**
 * Post-Tool Hook 参数
 */
export interface PostToolHookParams {
  toolName: string;
  params: Record<string, unknown>;
  result?: ToolResult;
  context: PipelineExecutionContext;
}

// ========== 管道事件 ==========

/**
 * 阶段开始事件
 */
export interface StageStartEvent {
  stage: string;
  execution: ToolExecution;
}

/**
 * 阶段完成事件
 */
export interface StageCompleteEvent {
  stage: string;
  execution: ToolExecution;
}
