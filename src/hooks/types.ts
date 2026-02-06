/**
 * Hooks 系统类型定义
 * 
 * Hooks 允许用户在特定事件点注入自定义 Shell 命令，
 * 实现工具拦截、上下文注入、自动化工作流等功能。
 */

import type { PermissionMode } from '../agent/types.js';

// ========== Hook 事件类型 ==========

/**
 * Hook 事件枚举
 * 
 * 11 种事件类型，覆盖 Agent 生命周期的各个关键节点
 */
export enum HookEvent {
  // ========== 工具执行类 ==========
  /** 工具执行前 (可阻止或修改输入) */
  PreToolUse = 'PreToolUse',
  /** 工具执行后 (可添加上下文或修改输出) */
  PostToolUse = 'PostToolUse',
  /** 工具执行失败后 */
  PostToolUseFailure = 'PostToolUseFailure',
  /** 权限请求时 (可自动批准/拒绝) */
  PermissionRequest = 'PermissionRequest',

  // ========== 会话生命周期类 ==========
  /** 用户提交提示词时 (可注入上下文) */
  UserPromptSubmit = 'UserPromptSubmit',
  /** 会话启动时 */
  SessionStart = 'SessionStart',
  /** 会话结束时 */
  SessionEnd = 'SessionEnd',

  // ========== 控制流类 ==========
  /** Agent 停止响应时 (可阻止停止) */
  Stop = 'Stop',
  /** 子 Agent (Task) 停止响应时 */
  SubagentStop = 'SubagentStop',

  // ========== 其他 ==========
  /** 通知事件 */
  Notification = 'Notification',
  /** 上下文压缩时 */
  Compaction = 'Compaction',
}

// ========== 退出码语义 ==========

export enum HookExitCode {
  /** 成功，继续执行 */
  SUCCESS = 0,
  /** 非阻塞错误，记录但继续 */
  NON_BLOCKING_ERROR = 1,
  /** 阻塞错误，停止执行 */
  BLOCKING_ERROR = 2,
  /** 超时 */
  TIMEOUT = 124,
}

// ========== 配置类型 ==========

/**
 * Hook 配置
 */
export interface HookConfig {
  /** 是否启用 Hooks */
  enabled?: boolean;
  /** 默认超时（秒） */
  defaultTimeout?: number;
  /** 超时行为 */
  timeoutBehavior?: 'ignore' | 'deny' | 'ask';
  /** 失败行为 */
  failureBehavior?: 'ignore' | 'deny' | 'ask';
  /** 最大并发数 */
  maxConcurrentHooks?: number;

  // 各事件类型的 Hook 列表
  PreToolUse?: HookMatcher[];
  PostToolUse?: HookMatcher[];
  PostToolUseFailure?: HookMatcher[];
  PermissionRequest?: HookMatcher[];
  UserPromptSubmit?: HookMatcher[];
  SessionStart?: HookMatcher[];
  SessionEnd?: HookMatcher[];
  Stop?: HookMatcher[];
  SubagentStop?: HookMatcher[];
  Notification?: HookMatcher[];
  Compaction?: HookMatcher[];
}

/**
 * Hook Matcher（匹配器配置）
 */
export interface HookMatcher {
  /** 可选名称 */
  name?: string;
  /** 匹配条件 */
  matcher?: MatcherConfig;
  /** Hook 列表 */
  hooks: Hook[];
}

/**
 * 匹配器配置
 */
export interface MatcherConfig {
  /** 工具名匹配（支持正则） */
  tools?: string;
  /** 文件路径匹配（glob） */
  paths?: string;
  /** 命令匹配（正则） */
  commands?: string;
}

/**
 * Hook 类型
 */
export type Hook = CommandHook;

/**
 * 命令 Hook
 */
export interface CommandHook {
  type: 'command';
  /** Shell 命令 */
  command: string;
  /** 超时时间（秒） */
  timeout?: number;
  /** 状态消息 */
  statusMessage?: string;
}

// ========== 输入类型 ==========

/**
 * Hook 输入基类
 */
export interface HookInputBase {
  hook_event_name: HookEvent;
  hook_execution_id: string;
  timestamp: string;
  session_id: string;
  project_dir: string;
}

/**
 * PreToolUse 输入
 */
export interface PreToolUseInput extends HookInputBase {
  hook_event_name: HookEvent.PreToolUse;
  tool_name: string;
  tool_use_id: string;
  tool_input: Record<string, unknown>;
  permission_mode: PermissionMode;
}

/**
 * PostToolUse 输入
 */
export interface PostToolUseInput extends HookInputBase {
  hook_event_name: HookEvent.PostToolUse;
  tool_name: string;
  tool_use_id: string;
  tool_input: Record<string, unknown>;
  tool_output: unknown;
}

/**
 * PostToolUseFailure 输入
 */
export interface PostToolUseFailureInput extends HookInputBase {
  hook_event_name: HookEvent.PostToolUseFailure;
  tool_name: string;
  tool_use_id: string;
  tool_input: Record<string, unknown>;
  error: string;
}

/**
 * PermissionRequest 输入
 */
export interface PermissionRequestInput extends HookInputBase {
  hook_event_name: HookEvent.PermissionRequest;
  tool_name: string;
  tool_input: Record<string, unknown>;
}

/**
 * UserPromptSubmit 输入
 */
export interface UserPromptSubmitInput extends HookInputBase {
  hook_event_name: HookEvent.UserPromptSubmit;
  prompt_content: string;
}

/**
 * SessionStart 输入
 */
export interface SessionStartInput extends HookInputBase {
  hook_event_name: HookEvent.SessionStart;
}

/**
 * SessionEnd 输入
 */
export interface SessionEndInput extends HookInputBase {
  hook_event_name: HookEvent.SessionEnd;
}

/**
 * Stop 输入
 */
export interface StopInput extends HookInputBase {
  hook_event_name: HookEvent.Stop;
  stop_reason?: string;
}

/**
 * SubagentStop 输入
 */
export interface SubagentStopInput extends HookInputBase {
  hook_event_name: HookEvent.SubagentStop;
  subagent_id: string;
  stop_reason?: string;
}

/**
 * Notification 输入
 */
export interface NotificationInput extends HookInputBase {
  hook_event_name: HookEvent.Notification;
  message: string;
  level: 'info' | 'warning' | 'error';
}

/**
 * Compaction 输入
 */
export interface CompactionInput extends HookInputBase {
  hook_event_name: HookEvent.Compaction;
  pre_tokens: number;
  message_count: number;
}

export type HookInput =
  | PreToolUseInput
  | PostToolUseInput
  | PostToolUseFailureInput
  | PermissionRequestInput
  | UserPromptSubmitInput
  | SessionStartInput
  | SessionEndInput
  | StopInput
  | SubagentStopInput
  | NotificationInput
  | CompactionInput;

// ========== 输出类型 ==========

/**
 * PreToolUse 输出
 */
export interface PreToolUseOutput {
  hookEventName?: 'PreToolUse';
  /** 权限决策 */
  permissionDecision?: 'allow' | 'deny' | 'ask';
  permissionDecisionReason?: string;
  /** 修改后的工具输入 */
  updatedInput?: Record<string, unknown>;
}

/**
 * PostToolUse 输出
 */
export interface PostToolUseOutput {
  hookEventName?: 'PostToolUse';
  /** 额外上下文 */
  additionalContext?: string;
  /** 修改后的输出 */
  updatedOutput?: unknown;
}

/**
 * PermissionRequest 输出
 */
export interface PermissionRequestOutput {
  /** 决策 */
  decision?: 'approve' | 'deny' | 'ask';
  reason?: string;
}

/**
 * Stop 输出
 */
export interface StopOutput {
  /** true 则阻止停止，强制继续 */
  continue?: boolean;
  reason?: string;
}

/**
 * Compaction 输出
 */
export interface CompactionOutput {
  /** true 则阻止压缩 */
  prevent?: boolean;
  reason?: string;
}

export type HookSpecificOutput =
  | PreToolUseOutput
  | PostToolUseOutput
  | PermissionRequestOutput
  | StopOutput
  | CompactionOutput;

// ========== 执行结果类型 ==========

/**
 * Hook 执行上下文
 */
export interface HookContext {
  sessionId: string;
  projectDir: string;
  permissionMode: PermissionMode;
}

/**
 * Hook 执行配置上下文
 */
export interface HookExecutionContext extends HookContext {
  config: HookConfig;
}

/**
 * 单个 Hook 执行结果
 */
export interface HookExecutionResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  output?: {
    hookSpecificOutput?: HookSpecificOutput;
    rawOutput?: string;
  };
  error?: string;
  blocking?: boolean;
  needsConfirmation?: boolean;
  warning?: string;
}

/**
 * PreToolUse Hook 结果
 */
export interface PreToolHookResult {
  decision: 'allow' | 'deny' | 'ask';
  reason?: string;
  modifiedInput?: Record<string, unknown>;
  warning?: string;
}

/**
 * PostToolUse Hook 结果
 */
export interface PostToolHookResult {
  additionalContext?: string;
  modifiedOutput?: unknown;
}

/**
 * PermissionRequest Hook 结果
 */
export interface PermissionHookResult {
  decision: 'approve' | 'deny' | 'ask';
  reason?: string;
}

/**
 * Stop Hook 结果
 */
export interface StopHookResult {
  shouldContinue: boolean;
  reason?: string;
}

/**
 * UserPromptSubmit Hook 结果
 */
export interface UserPromptHookResult {
  injectedContext?: string;
}

/**
 * Compaction Hook 结果
 */
export interface CompactionHookResult {
  shouldPrevent: boolean;
  reason?: string;
}

// ========== 匹配上下文 ==========

/**
 * 匹配上下文
 */
export interface MatchContext {
  toolName?: string;
  filePath?: string;
  command?: string;
}

// ========== 默认配置 ==========

export const DEFAULT_HOOK_CONFIG: HookConfig = {
  enabled: true,
  defaultTimeout: 60,
  timeoutBehavior: 'ignore',
  failureBehavior: 'ignore',
  maxConcurrentHooks: 5,
};
