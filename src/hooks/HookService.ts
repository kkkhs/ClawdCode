/**
 * Hook Service - Hooks 系统的简洁 API 层
 * 
 * 提供独立函数供各模块调用，内部处理所有错误和边界情况。
 * 这样调用方不需要关心 HookManager 的初始化状态和错误处理。
 */

import { getHookManager } from './HookManager.js';
import type { HookContext } from './types.js';
import type { PermissionMode } from '../agent/types.js';

/**
 * 创建 Hook 上下文
 */
function createContext(
  sessionId: string,
  projectDir?: string,
  permissionMode?: string
): HookContext {
  return {
    sessionId,
    projectDir: projectDir || process.cwd(),
    permissionMode: (permissionMode || 'default') as PermissionMode,
  };
}

/**
 * 检查 Hooks 是否可用
 */
export function isHooksAvailable(): boolean {
  const manager = getHookManager();
  return manager.isInitialized() && manager.isEnabled();
}

// ==================== 生命周期 Hooks ====================

/**
 * 会话开始
 */
export async function onSessionStart(sessionId: string, projectDir?: string): Promise<void> {
  if (!isHooksAvailable()) return;

  try {
    await getHookManager().executeSessionStartHooks(
      createContext(sessionId, projectDir)
    );
  } catch (error) {
    console.warn('[HookService] SessionStart hook error:', error);
  }
}

/**
 * 会话结束
 */
export async function onSessionEnd(sessionId: string, projectDir?: string): Promise<void> {
  if (!isHooksAvailable()) return;

  try {
    await getHookManager().executeSessionEndHooks(
      createContext(sessionId, projectDir)
    );
  } catch (error) {
    console.warn('[HookService] SessionEnd hook error:', error);
  }
}

/**
 * 用户提交消息
 * @returns 注入的上下文（如果有）
 */
export async function onUserPromptSubmit(
  promptContent: string,
  sessionId: string,
  projectDir?: string
): Promise<string | undefined> {
  if (!isHooksAvailable()) return undefined;

  try {
    const result = await getHookManager().executeUserPromptHooks(
      promptContent,
      createContext(sessionId, projectDir)
    );
    return result.injectedContext;
  } catch (error) {
    console.warn('[HookService] UserPromptSubmit hook error:', error);
    return undefined;
  }
}

// ==================== 控制流 Hooks ====================

/**
 * Agent 停止
 * @returns true 表示应该继续执行
 */
export async function onStop(
  stopReason: string | undefined,
  sessionId: string,
  projectDir?: string
): Promise<boolean> {
  if (!isHooksAvailable()) return false;

  try {
    const result = await getHookManager().executeStopHooks(
      stopReason,
      createContext(sessionId, projectDir)
    );
    return result.shouldContinue;
  } catch (error) {
    console.warn('[HookService] Stop hook error:', error);
    return false;
  }
}

/**
 * 上下文压缩
 * @returns true 表示应该阻止压缩
 */
export async function onCompaction(
  preTokens: number,
  messageCount: number,
  sessionId: string,
  projectDir?: string
): Promise<boolean> {
  if (!isHooksAvailable()) return false;

  try {
    const result = await getHookManager().executeCompactionHooks(
      preTokens,
      messageCount,
      createContext(sessionId, projectDir)
    );
    return result.shouldPrevent;
  } catch (error) {
    console.warn('[HookService] Compaction hook error:', error);
    return false;
  }
}

// ==================== 工具执行 Hooks ====================

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
 * 工具执行前
 */
export async function onPreToolUse(
  toolName: string,
  toolUseId: string,
  toolInput: Record<string, unknown>,
  sessionId: string,
  projectDir?: string,
  permissionMode?: string
): Promise<PreToolHookResult> {
  if (!isHooksAvailable()) {
    return { decision: 'allow' };
  }

  try {
    return await getHookManager().executePreToolHooks(
      toolName,
      toolUseId,
      toolInput,
      createContext(sessionId, projectDir, permissionMode)
    );
  } catch (error) {
    console.warn('[HookService] PreToolUse hook error:', error);
    return { decision: 'allow' };
  }
}

/**
 * 工具执行后（成功）
 */
export async function onPostToolUse(
  toolName: string,
  toolUseId: string,
  toolInput: Record<string, unknown>,
  toolResult: { success: boolean; llmContent?: string },
  sessionId: string,
  projectDir?: string,
  permissionMode?: string
): Promise<PostToolHookResult> {
  if (!isHooksAvailable()) {
    return {};
  }

  try {
    return await getHookManager().executePostToolHooks(
      toolName,
      toolUseId,
      toolInput,
      toolResult,
      createContext(sessionId, projectDir, permissionMode)
    );
  } catch (error) {
    console.warn('[HookService] PostToolUse hook error:', error);
    return {};
  }
}

/**
 * 工具执行后（失败）
 */
export async function onPostToolUseFailure(
  toolName: string,
  toolUseId: string,
  toolInput: Record<string, unknown>,
  errorMessage: string,
  sessionId: string,
  projectDir?: string,
  permissionMode?: string
): Promise<void> {
  if (!isHooksAvailable()) return;

  try {
    await getHookManager().executePostToolFailureHooks(
      toolName,
      toolUseId,
      toolInput,
      errorMessage,
      createContext(sessionId, projectDir, permissionMode)
    );
  } catch (error) {
    console.warn('[HookService] PostToolUseFailure hook error:', error);
  }
}

/**
 * 权限请求
 * @returns 'approve' | 'deny' | 'ask'
 */
export async function onPermissionRequest(
  toolName: string,
  toolInput: Record<string, unknown>,
  sessionId: string,
  projectDir?: string,
  permissionMode?: string
): Promise<'approve' | 'deny' | 'ask'> {
  if (!isHooksAvailable()) return 'ask';

  try {
    const result = await getHookManager().executePermissionHooks(
      toolName,
      toolInput,
      createContext(sessionId, projectDir, permissionMode)
    );
    return result.decision;
  } catch (error) {
    console.warn('[HookService] PermissionRequest hook error:', error);
    return 'ask';
  }
}
