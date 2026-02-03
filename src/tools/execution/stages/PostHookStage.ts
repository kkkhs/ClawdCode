/**
 * Post Hook Stage - PostToolUse Hooks 执行阶段
 * 执行工具使用后的钩子
 */

import type { PipelineStage, ToolExecution, PostToolHookParams } from '../types.js';

/**
 * Hook 管理器接口（简化版，完整实现在第12章）
 */
interface IHookManager {
  isEnabled(): boolean;
  executePostToolUseHooks(params: PostToolHookParams): Promise<void>;
}

/**
 * 默认 Hook 管理器（空实现）
 */
class DefaultHookManager implements IHookManager {
  private static instance: DefaultHookManager;

  static getInstance(): DefaultHookManager {
    if (!this.instance) {
      this.instance = new DefaultHookManager();
    }
    return this.instance;
  }

  isEnabled(): boolean {
    return false;
  }

  async executePostToolUseHooks(): Promise<void> {
    // 空实现
  }
}

export class PostHookStage implements PipelineStage {
  readonly name = 'postHook';
  private hookManager: IHookManager;

  constructor(hookManager?: IHookManager) {
    this.hookManager = hookManager || DefaultHookManager.getInstance();
  }

  async process(execution: ToolExecution): Promise<void> {
    // 跳过条件：Hook 未启用
    if (!this.hookManager.isEnabled()) {
      return;
    }

    const result = execution.getResult();

    // 执行 PostToolUse hooks
    await this.hookManager.executePostToolUseHooks({
      toolName: execution.toolName,
      params: execution.params,
      result,
      context: execution.context,
    });
  }
}
