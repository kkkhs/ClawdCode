/**
 * Execution Stage - 实际执行阶段
 * 执行工具
 */

import type { PipelineStage, ToolExecution } from '../types.js';
import type { ExecutionContext } from '../../types.js';

export class ExecutionStage implements PipelineStage {
  readonly name = 'execution';

  async process(execution: ToolExecution): Promise<void> {
    const tool = execution._internal.tool;

    if (!tool) {
      execution.abort('Tool not found in execution context');
      return;
    }

    try {
      // 构建执行上下文
      const context: ExecutionContext = {
        sessionId: execution.context.sessionId,
        signal: execution.context.signal,
        cwd: execution.context.workspaceRoot,
      };

      // 执行工具
      const result = await tool.execute(execution.params, context);

      // 设置结果
      execution.setResult(result);
    } catch (error) {
      // 处理执行错误
      const errorMessage = error instanceof Error ? error.message : String(error);
      execution.abort(`Tool execution failed: ${errorMessage}`);
    }
  }
}
