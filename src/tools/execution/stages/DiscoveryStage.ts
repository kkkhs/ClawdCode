/**
 * Discovery Stage - 工具发现阶段
 * 从注册表中查找工具
 */

import type { PipelineStage, ToolExecution } from '../types.js';
import type { ToolRegistry } from '../../registry.js';

export class DiscoveryStage implements PipelineStage {
  readonly name = 'discovery';

  constructor(private registry: ToolRegistry) {}

  async process(execution: ToolExecution): Promise<void> {
    const tool = this.registry.get(execution.toolName);

    if (!tool) {
      execution.abort(`Tool "${execution.toolName}" not found in registry`);
      return;
    }

    // 将工具实例附加到执行上下文
    execution._internal.tool = tool;
  }
}
