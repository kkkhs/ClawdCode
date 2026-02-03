/**
 * Hook Stage (Pre) - PreToolUse Hooks 执行阶段
 * 执行工具使用前的钩子
 */

import { nanoid } from 'nanoid';
import type { PipelineStage, ToolExecution, PreToolHookResult } from '../types.js';

/**
 * Hook 管理器接口（简化版，完整实现在第12章）
 */
interface IHookManager {
  isEnabled(): boolean;
  executePreToolHooks(
    toolName: string,
    toolUseId: string,
    params: Record<string, unknown>,
    context: { projectDir: string; sessionId: string; permissionMode: string }
  ): Promise<PreToolHookResult>;
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

  async executePreToolHooks(): Promise<PreToolHookResult> {
    return { decision: 'allow' };
  }
}

export class HookStage implements PipelineStage {
  readonly name = 'hook';
  private hookManager: IHookManager;

  constructor(hookManager?: IHookManager) {
    this.hookManager = hookManager || DefaultHookManager.getInstance();
  }

  async process(execution: ToolExecution): Promise<void> {
    // 跳过条件：Hook 未启用
    if (!this.hookManager.isEnabled()) {
      return;
    }

    const tool = execution._internal.tool;
    if (!tool) {
      return;
    }

    // 生成唯一的 toolUseId（PostToolUse 阶段复用）
    const toolUseId = execution.context.messageId || `tool_${nanoid()}`;
    execution._internal.hookToolUseId = toolUseId;

    const projectDir = execution.context.workspaceRoot || process.cwd();

    // 执行 PreToolUse hooks
    const result = await this.hookManager.executePreToolHooks(
      tool.name,
      toolUseId,
      execution.params as Record<string, unknown>,
      {
        projectDir,
        sessionId: execution.context.sessionId || 'unknown',
        permissionMode: execution.context.permissionMode || 'default',
      }
    );

    // 处理 Hook 决策
    if (result.decision === 'deny') {
      // 直接拒绝，中止执行
      execution.abort(result.reason || 'Hook blocked execution');
      return;
    }

    if (result.decision === 'ask') {
      // 标记需要用户确认（传递给 Confirmation 阶段）
      execution._internal.needsConfirmation = true;
      execution._internal.confirmationReason =
        result.reason || 'Hook requires confirmation';
      return;
    }

    // decision === 'allow'：应用修改后的输入
    if (result.modifiedInput) {
      const newParams = { ...execution.params, ...result.modifiedInput };

      // 重新验证修改后的参数
      if (tool.build) {
        try {
          tool.build(newParams);
          // 更新参数
          execution.params = newParams;
        } catch (err) {
          execution.abort(
            `Hook modified parameters are invalid: ${err instanceof Error ? err.message : String(err)}`
          );
          return;
        }
      }
    }

    // 输出警告信息
    if (result.warning) {
      console.warn(`[Hook Warning] ${result.warning}`);
    }
  }
}
