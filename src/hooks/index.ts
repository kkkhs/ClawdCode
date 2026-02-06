/**
 * Hooks 系统模块
 * 
 * 提供在 Agent 生命周期各节点注入自定义 Shell 命令的能力。
 */

// 类型导出
export * from './types.js';

// 核心类导出
export { HookManager, getHookManager } from './HookManager.js';
export { HookExecutor } from './HookExecutor.js';
export { Matcher, extractFilePath, extractCommand } from './Matcher.js';

// Hook Service - 简洁 API 层（独立函数）
export {
  isHooksAvailable,
  // 生命周期
  onSessionStart,
  onSessionEnd,
  onUserPromptSubmit,
  // 控制流
  onStop,
  onCompaction,
  // 工具执行
  onPreToolUse,
  onPostToolUse,
  onPostToolUseFailure,
  onPermissionRequest,
  // 类型
  type PreToolHookResult,
  type PostToolHookResult,
} from './HookService.js';

// 便捷函数
import { getHookManager } from './HookManager.js';
import type { HookConfig } from './types.js';

/**
 * 初始化 Hooks 系统
 */
export function initializeHooks(config: Partial<HookConfig>): void {
  const manager = getHookManager();
  manager.loadConfig(config);
}

/**
 * 检查 Hooks 是否启用
 */
export function isHooksEnabled(): boolean {
  return getHookManager().isEnabled();
}

/**
 * 获取 Hook 统计信息
 */
export function getHookStats(): { enabled: boolean; counts: Record<string, number> } {
  const manager = getHookManager();
  return {
    enabled: manager.isEnabled(),
    counts: manager.getHookCounts(),
  };
}
