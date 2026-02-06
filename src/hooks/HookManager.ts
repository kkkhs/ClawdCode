/**
 * Hook 管理器
 * 
 * 单例模式，负责：
 * - 加载和管理 Hook 配置
 * - 协调 Hook 的匹配和执行
 * - 防止重复执行
 */

import { nanoid } from 'nanoid';
import { Matcher, extractFilePath, extractCommand } from './Matcher.js';
import { HookExecutor } from './HookExecutor.js';
import {
  HookEvent,
  DEFAULT_HOOK_CONFIG,
  type HookConfig,
  type HookContext,
  type HookExecutionContext,
  type PreToolUseInput,
  type PostToolUseInput,
  type PostToolUseFailureInput,
  type PermissionRequestInput,
  type UserPromptSubmitInput,
  type SessionStartInput,
  type SessionEndInput,
  type StopInput,
  type CompactionInput,
  type PreToolHookResult,
  type PostToolHookResult,
  type PermissionHookResult,
  type StopHookResult,
  type UserPromptHookResult,
  type CompactionHookResult,
  type MatchContext,
  type Hook,
} from './types.js';

/**
 * 执行防护 - 防止同一工具调用重复执行 Hook
 */
class HookExecutionGuard {
  private executed: Map<string, Set<HookEvent>> = new Map();

  canExecute(toolUseId: string, event: HookEvent): boolean {
    const events = this.executed.get(toolUseId);
    if (!events) return true;
    return !events.has(event);
  }

  markExecuted(toolUseId: string, event: HookEvent): void {
    let events = this.executed.get(toolUseId);
    if (!events) {
      events = new Set();
      this.executed.set(toolUseId, events);
    }
    events.add(event);
  }

  clear(): void {
    this.executed.clear();
  }
}

/**
 * Hook 管理器
 */
export class HookManager {
  private static instance: HookManager | null = null;

  private config: HookConfig = DEFAULT_HOOK_CONFIG;
  private executor = new HookExecutor();
  private matcher = new Matcher();
  private guard = new HookExecutionGuard();
  private sessionDisabled = false;
  private initialized = false;

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): HookManager {
    if (!HookManager.instance) {
      HookManager.instance = new HookManager();
    }
    return HookManager.instance;
  }

  /**
   * 重置实例（用于测试）
   */
  static resetInstance(): void {
    HookManager.instance = null;
  }

  /**
   * 加载配置
   */
  loadConfig(config: Partial<HookConfig>): void {
    this.config = this.mergeConfig(DEFAULT_HOOK_CONFIG, config);
    this.initialized = true;
  }

  /**
   * 合并配置
   */
  private mergeConfig(base: HookConfig, override: Partial<HookConfig>): HookConfig {
    return {
      ...base,
      ...override,
      // 合并各事件类型的 Hook 列表
      PreToolUse: override.PreToolUse ?? base.PreToolUse,
      PostToolUse: override.PostToolUse ?? base.PostToolUse,
      PostToolUseFailure: override.PostToolUseFailure ?? base.PostToolUseFailure,
      PermissionRequest: override.PermissionRequest ?? base.PermissionRequest,
      UserPromptSubmit: override.UserPromptSubmit ?? base.UserPromptSubmit,
      SessionStart: override.SessionStart ?? base.SessionStart,
      SessionEnd: override.SessionEnd ?? base.SessionEnd,
      Stop: override.Stop ?? base.Stop,
      SubagentStop: override.SubagentStop ?? base.SubagentStop,
      Notification: override.Notification ?? base.Notification,
      Compaction: override.Compaction ?? base.Compaction,
    };
  }

  /**
   * 检查是否启用
   */
  isEnabled(): boolean {
    return (this.config.enabled ?? true) && !this.sessionDisabled;
  }

  /**
   * 临时禁用（当前会话）
   */
  disableForSession(): void {
    this.sessionDisabled = true;
  }

  /**
   * 重新启用
   */
  enableForSession(): void {
    this.sessionDisabled = false;
  }

  /**
   * 获取配置
   */
  getConfig(): HookConfig {
    return this.config;
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 获取匹配的 Hooks
   */
  private getMatchingHooks(event: HookEvent, context: MatchContext): Hook[] {
    const matchers = this.config[event];
    return this.matcher.getMatchingHooks(matchers, context);
  }

  /**
   * 创建执行上下文
   */
  private createExecutionContext(context: HookContext): HookExecutionContext {
    return {
      ...context,
      config: this.config,
    };
  }

  // ==================== PreToolUse ====================

  /**
   * 执行 PreToolUse Hooks
   */
  async executePreToolHooks(
    toolName: string,
    toolUseId: string,
    toolInput: Record<string, unknown>,
    context: HookContext
  ): Promise<PreToolHookResult> {
    if (!this.isEnabled()) {
      return { decision: 'allow' };
    }

    // Plan 模式跳过 hooks
    if (context.permissionMode === 'plan') {
      return { decision: 'allow' };
    }

    // 检查是否已执行
    if (!this.guard.canExecute(toolUseId, HookEvent.PreToolUse)) {
      return { decision: 'allow' };
    }

    // 获取匹配的 hooks
    const hooks = this.getMatchingHooks(HookEvent.PreToolUse, {
      toolName,
      filePath: extractFilePath(toolInput),
      command: extractCommand(toolName, toolInput),
    });

    if (hooks.length === 0) {
      return { decision: 'allow' };
    }

    // 构建输入
    const hookInput: PreToolUseInput = {
      hook_event_name: HookEvent.PreToolUse,
      hook_execution_id: nanoid(),
      timestamp: new Date().toISOString(),
      tool_name: toolName,
      tool_use_id: toolUseId,
      tool_input: toolInput,
      project_dir: context.projectDir,
      session_id: context.sessionId,
      permission_mode: context.permissionMode,
    };

    // 执行
    const result = await this.executor.executePreToolHooks(
      hooks,
      hookInput,
      this.createExecutionContext(context)
    );

    // 标记已执行
    this.guard.markExecuted(toolUseId, HookEvent.PreToolUse);

    // YOLO 模式：将 ask 转为 allow，但保留 deny
    if (context.permissionMode === 'yolo' && result.decision === 'ask') {
      return { ...result, decision: 'allow' };
    }

    return result;
  }

  // ==================== PostToolUse ====================

  /**
   * 执行 PostToolUse Hooks
   */
  async executePostToolHooks(
    toolName: string,
    toolUseId: string,
    toolInput: Record<string, unknown>,
    toolOutput: unknown,
    context: HookContext
  ): Promise<PostToolHookResult> {
    if (!this.isEnabled()) {
      return {};
    }

    // 检查是否已执行
    if (!this.guard.canExecute(toolUseId, HookEvent.PostToolUse)) {
      return {};
    }

    // 获取匹配的 hooks
    const hooks = this.getMatchingHooks(HookEvent.PostToolUse, {
      toolName,
      filePath: extractFilePath(toolInput),
      command: extractCommand(toolName, toolInput),
    });

    if (hooks.length === 0) {
      return {};
    }

    // 构建输入
    const hookInput: PostToolUseInput = {
      hook_event_name: HookEvent.PostToolUse,
      hook_execution_id: nanoid(),
      timestamp: new Date().toISOString(),
      tool_name: toolName,
      tool_use_id: toolUseId,
      tool_input: toolInput,
      tool_output: toolOutput,
      project_dir: context.projectDir,
      session_id: context.sessionId,
    };

    // 执行
    const result = await this.executor.executePostToolHooks(
      hooks,
      hookInput,
      this.createExecutionContext(context)
    );

    // 标记已执行
    this.guard.markExecuted(toolUseId, HookEvent.PostToolUse);

    return result;
  }

  // ==================== PostToolUseFailure ====================

  /**
   * 执行 PostToolUseFailure Hooks
   */
  async executePostToolFailureHooks(
    toolName: string,
    toolUseId: string,
    toolInput: Record<string, unknown>,
    error: string,
    context: HookContext
  ): Promise<void> {
    if (!this.isEnabled()) return;

    const hooks = this.getMatchingHooks(HookEvent.PostToolUseFailure, {
      toolName,
      filePath: extractFilePath(toolInput),
      command: extractCommand(toolName, toolInput),
    });

    if (hooks.length === 0) return;

    const hookInput: PostToolUseFailureInput = {
      hook_event_name: HookEvent.PostToolUseFailure,
      hook_execution_id: nanoid(),
      timestamp: new Date().toISOString(),
      tool_name: toolName,
      tool_use_id: toolUseId,
      tool_input: toolInput,
      error,
      project_dir: context.projectDir,
      session_id: context.sessionId,
    };

    await this.executor.executeGenericHooks(
      hooks,
      hookInput,
      this.createExecutionContext(context)
    );
  }

  // ==================== PermissionRequest ====================

  /**
   * 执行 PermissionRequest Hooks
   */
  async executePermissionHooks(
    toolName: string,
    toolInput: Record<string, unknown>,
    context: HookContext
  ): Promise<PermissionHookResult> {
    if (!this.isEnabled()) {
      return { decision: 'ask' };
    }

    const hooks = this.getMatchingHooks(HookEvent.PermissionRequest, {
      toolName,
      filePath: extractFilePath(toolInput),
      command: extractCommand(toolName, toolInput),
    });

    if (hooks.length === 0) {
      return { decision: 'ask' };
    }

    const hookInput: PermissionRequestInput = {
      hook_event_name: HookEvent.PermissionRequest,
      hook_execution_id: nanoid(),
      timestamp: new Date().toISOString(),
      tool_name: toolName,
      tool_input: toolInput,
      project_dir: context.projectDir,
      session_id: context.sessionId,
    };

    return this.executor.executePermissionHooks(
      hooks,
      hookInput,
      this.createExecutionContext(context)
    );
  }

  // ==================== UserPromptSubmit ====================

  /**
   * 执行 UserPromptSubmit Hooks
   */
  async executeUserPromptHooks(
    promptContent: string,
    context: HookContext
  ): Promise<UserPromptHookResult> {
    if (!this.isEnabled()) {
      return {};
    }

    const hooks = this.getMatchingHooks(HookEvent.UserPromptSubmit, {});

    if (hooks.length === 0) {
      return {};
    }

    const hookInput: UserPromptSubmitInput = {
      hook_event_name: HookEvent.UserPromptSubmit,
      hook_execution_id: nanoid(),
      timestamp: new Date().toISOString(),
      prompt_content: promptContent,
      project_dir: context.projectDir,
      session_id: context.sessionId,
    };

    return this.executor.executeUserPromptHooks(
      hooks,
      hookInput,
      this.createExecutionContext(context)
    );
  }

  // ==================== SessionStart ====================

  /**
   * 执行 SessionStart Hooks
   */
  async executeSessionStartHooks(context: HookContext): Promise<void> {
    if (!this.isEnabled()) return;

    const hooks = this.getMatchingHooks(HookEvent.SessionStart, {});

    if (hooks.length === 0) return;

    const hookInput: SessionStartInput = {
      hook_event_name: HookEvent.SessionStart,
      hook_execution_id: nanoid(),
      timestamp: new Date().toISOString(),
      project_dir: context.projectDir,
      session_id: context.sessionId,
    };

    await this.executor.executeGenericHooks(
      hooks,
      hookInput,
      this.createExecutionContext(context)
    );

    // 清理执行防护
    this.guard.clear();
  }

  // ==================== SessionEnd ====================

  /**
   * 执行 SessionEnd Hooks
   */
  async executeSessionEndHooks(context: HookContext): Promise<void> {
    if (!this.isEnabled()) return;

    const hooks = this.getMatchingHooks(HookEvent.SessionEnd, {});

    if (hooks.length === 0) return;

    const hookInput: SessionEndInput = {
      hook_event_name: HookEvent.SessionEnd,
      hook_execution_id: nanoid(),
      timestamp: new Date().toISOString(),
      project_dir: context.projectDir,
      session_id: context.sessionId,
    };

    await this.executor.executeGenericHooks(
      hooks,
      hookInput,
      this.createExecutionContext(context)
    );
  }

  // ==================== Stop ====================

  /**
   * 执行 Stop Hooks
   */
  async executeStopHooks(
    stopReason: string | undefined,
    context: HookContext
  ): Promise<StopHookResult> {
    if (!this.isEnabled()) {
      return { shouldContinue: false };
    }

    const hooks = this.getMatchingHooks(HookEvent.Stop, {});

    if (hooks.length === 0) {
      return { shouldContinue: false };
    }

    const hookInput: StopInput = {
      hook_event_name: HookEvent.Stop,
      hook_execution_id: nanoid(),
      timestamp: new Date().toISOString(),
      stop_reason: stopReason,
      project_dir: context.projectDir,
      session_id: context.sessionId,
    };

    return this.executor.executeStopHooks(
      hooks,
      hookInput,
      this.createExecutionContext(context)
    );
  }

  // ==================== Compaction ====================

  /**
   * 执行 Compaction Hooks
   */
  async executeCompactionHooks(
    preTokens: number,
    messageCount: number,
    context: HookContext
  ): Promise<CompactionHookResult> {
    if (!this.isEnabled()) {
      return { shouldPrevent: false };
    }

    const hooks = this.getMatchingHooks(HookEvent.Compaction, {});

    if (hooks.length === 0) {
      return { shouldPrevent: false };
    }

    const hookInput: CompactionInput = {
      hook_event_name: HookEvent.Compaction,
      hook_execution_id: nanoid(),
      timestamp: new Date().toISOString(),
      pre_tokens: preTokens,
      message_count: messageCount,
      project_dir: context.projectDir,
      session_id: context.sessionId,
    };

    return this.executor.executeCompactionHooks(
      hooks,
      hookInput,
      this.createExecutionContext(context)
    );
  }

  // ==================== 统计信息 ====================

  /**
   * 获取配置的 Hook 数量统计
   */
  getHookCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    
    for (const event of Object.values(HookEvent)) {
      const matchers = this.config[event];
      if (matchers && Array.isArray(matchers)) {
        let count = 0;
        for (const matcher of matchers) {
          count += matcher.hooks?.length || 0;
        }
        if (count > 0) {
          counts[event] = count;
        }
      }
    }

    return counts;
  }

  /**
   * 获取所有已配置的事件类型
   */
  getConfiguredEvents(): HookEvent[] {
    const events: HookEvent[] = [];
    
    for (const event of Object.values(HookEvent)) {
      const matchers = this.config[event];
      if (matchers && Array.isArray(matchers) && matchers.length > 0) {
        events.push(event);
      }
    }

    return events;
  }
}

/**
 * 获取 HookManager 单例
 */
export function getHookManager(): HookManager {
  return HookManager.getInstance();
}
