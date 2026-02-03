/**
 * ExecutionPipeline - 执行管道
 * 七阶段管道，将工具系统与 Agent 连接
 */

import { EventEmitter } from 'events';
import {
  ToolExecution,
  PermissionMode,
  type PipelineStage,
  type PipelineExecutionContext,
  type ExecutionPipelineConfig,
  type ExecutionHistoryEntry,
  type StageStartEvent,
  type StageCompleteEvent,
} from './types.js';
import type { ToolResult, ToolErrorType } from '../types.js';
import type { ToolRegistry } from '../registry.js';
import {
  DiscoveryStage,
  PermissionStage,
  HookStage,
  ConfirmationStage,
  ExecutionStage,
  PostHookStage,
  FormattingStage,
} from './stages/index.js';

/**
 * 执行管道事件
 */
export interface ExecutionPipelineEvents {
  stageStart: (event: StageStartEvent) => void;
  stageComplete: (event: StageCompleteEvent) => void;
  executionStart: (execution: ToolExecution) => void;
  executionComplete: (execution: ToolExecution, result: ToolResult) => void;
  executionError: (execution: ToolExecution, error: Error) => void;
}

/**
 * 执行管道
 */
export class ExecutionPipeline extends EventEmitter {
  private stages: PipelineStage[];
  private executionHistory: ExecutionHistoryEntry[] = [];
  private readonly sessionApprovals = new Set<string>();
  private readonly maxHistorySize = 1000;

  constructor(
    private registry: ToolRegistry,
    config: ExecutionPipelineConfig = {}
  ) {
    super();

    const defaultMode = config.defaultMode || PermissionMode.DEFAULT;

    // 初始化七个执行阶段
    this.stages = [
      new DiscoveryStage(this.registry),
      new PermissionStage(config.permissions, this.sessionApprovals, defaultMode),
      new HookStage(),
      new ConfirmationStage(this.sessionApprovals),
      new ExecutionStage(),
      new PostHookStage(),
      new FormattingStage(),
    ];
  }

  /**
   * 执行工具调用
   */
  async execute(
    toolName: string,
    params: Record<string, unknown>,
    context: PipelineExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now();
    const executedStages: string[] = [];

    // 创建执行实例
    const execution = new ToolExecution(toolName, params, context);

    // 发出执行开始事件
    this.emit('executionStart', execution);

    try {
      // 依次执行各阶段
      for (const stage of this.stages) {
        if (execution.isAborted()) {
          break;
        }

        // 发出阶段开始事件
        this.emit('stageStart', { stage: stage.name, execution });

        // 执行阶段
        await stage.process(execution);

        // 记录已执行的阶段
        executedStages.push(stage.name);

        // 发出阶段完成事件
        this.emit('stageComplete', { stage: stage.name, execution });
      }

      // 获取或创建结果
      const result = execution.getResult() || this.createErrorResult(execution);

      // 记录执行历史
      this.recordExecution({
        toolName,
        params,
        result,
        timestamp: startTime,
        duration: Date.now() - startTime,
        permissionMode: context.permissionMode,
        stages: executedStages,
      });

      // 发出执行完成事件
      this.emit('executionComplete', execution, result);

      return result;
    } catch (error) {
      // 发出执行错误事件
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('executionError', execution, err);

      // 返回错误结果
      return {
        success: false,
        llmContent: `Pipeline execution error: ${err.message}`,
        displayContent: `❌ Pipeline error: ${err.message}`,
        error: {
          type: 'execution_error' as ToolErrorType,
          message: err.message,
        },
      };
    }
  }

  /**
   * 创建错误结果（用于中止的执行）
   */
  private createErrorResult(execution: ToolExecution): ToolResult {
    const reason = execution.getAbortReason() || 'Unknown error';
    return {
      success: false,
      llmContent: `Tool execution aborted: ${reason}`,
      displayContent: `❌ ${execution.toolName}: ${reason}`,
      error: {
        type: 'execution_error' as ToolErrorType,
        message: reason,
      },
    };
  }

  /**
   * 记录执行历史
   */
  private recordExecution(entry: ExecutionHistoryEntry): void {
    this.executionHistory.push(entry);

    // 限制历史大小
    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory.shift();
    }
  }

  /**
   * 获取工具注册表
   */
  getRegistry(): ToolRegistry {
    return this.registry;
  }

  /**
   * 获取执行历史
   */
  getHistory(): ExecutionHistoryEntry[] {
    return [...this.executionHistory];
  }

  /**
   * 清除执行历史
   */
  clearHistory(): void {
    this.executionHistory = [];
  }

  /**
   * 获取会话批准列表
   */
  getSessionApprovals(): Set<string> {
    return new Set(this.sessionApprovals);
  }

  /**
   * 清除会话批准
   */
  clearSessionApprovals(): void {
    this.sessionApprovals.clear();
  }

  /**
   * 添加会话批准
   */
  addSessionApproval(signature: string): void {
    this.sessionApprovals.add(signature);
  }

  /**
   * 检查是否已批准
   */
  hasSessionApproval(signature: string): boolean {
    return this.sessionApprovals.has(signature);
  }

  /**
   * 获取管道阶段名称
   */
  getStageNames(): string[] {
    return this.stages.map(s => s.name);
  }
}
