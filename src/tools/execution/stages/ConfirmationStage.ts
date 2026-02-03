/**
 * Confirmation Stage - 用户确认阶段
 * 请求用户确认危险操作
 */

import type {
  PipelineStage,
  ToolExecution,
  ConfirmationDetails,
} from '../types.js';

export class ConfirmationStage implements PipelineStage {
  readonly name = 'confirmation';

  constructor(private sessionApprovals: Set<string>) {}

  async process(execution: ToolExecution): Promise<void> {
    // 如果不需要确认，直接通过
    if (!execution._internal.needsConfirmation) {
      return;
    }

    const tool = execution._internal.tool;
    if (!tool) {
      execution.abort('Tool not found in execution context');
      return;
    }

    // 检查是否已在会话中批准
    const signature = execution._internal.permissionSignature;
    if (signature && this.sessionApprovals.has(signature)) {
      return;
    }

    // 构建确认详情
    const confirmationDetails: ConfirmationDetails = {
      title: `Permission Required: ${tool.name}`,
      message: execution._internal.confirmationReason || 'This operation requires your confirmation',
      details: this.generatePreview(execution),
      risks: this.extractRisks(execution),
      affectedFiles: this.getAffectedPaths(execution),
    };

    // 请求用户确认
    const handler = execution.context.confirmationHandler;
    if (!handler) {
      // 无确认处理器，默认拒绝
      execution.abort('No confirmation handler available - operation requires user approval');
      return;
    }

    const response = await handler.requestConfirmation(confirmationDetails);

    if (!response.approved) {
      execution.abort(`User rejected: ${response.reason || 'No reason provided'}`);
      return;
    }

    // 如果用户选择"记住此决定"，保存到会话批准列表
    if (response.scope === 'session' && signature) {
      this.sessionApprovals.add(signature);
    }
  }

  /**
   * 生成操作预览
   */
  private generatePreview(execution: ToolExecution): string | undefined {
    const { toolName, params } = execution;

    switch (toolName) {
      case 'Edit': {
        const oldString = params.old_string as string;
        const newString = params.new_string as string;
        const filePath = params.file_path as string;

        return `**File:** ${filePath}

**Before:**
\`\`\`
${this.truncate(oldString, 10)}
\`\`\`

**After:**
\`\`\`
${this.truncate(newString, 10)}
\`\`\``;
      }

      case 'Write': {
        const content = params.contents as string;
        const filePath = params.file_path as string;

        return `**File:** ${filePath}

**Content Preview:**
\`\`\`
${this.truncate(content, 20)}
\`\`\``;
      }

      case 'Bash': {
        const command = params.command as string;
        const cwd = params.working_directory as string;

        return `**Command:** \`${command}\`${cwd ? `\n**Directory:** ${cwd}` : ''}`;
      }

      default:
        return undefined;
    }
  }

  /**
   * 提取风险信息
   */
  private extractRisks(execution: ToolExecution): string[] {
    const risks: string[] = [];
    const { toolName, params } = execution;
    const tool = execution._internal.tool;

    // 基于工具类型的风险
    if (tool?.kind === 'write') {
      risks.push('This operation will modify files');
    } else if (tool?.kind === 'execute') {
      risks.push('This operation will execute system commands');
    }

    // 基于参数的风险
    if (toolName === 'Bash') {
      const command = params.command as string;
      if (command.includes('rm')) {
        risks.push('Command may delete files');
      }
      if (command.includes('sudo')) {
        risks.push('Command requires elevated privileges');
      }
      if (command.includes('|')) {
        risks.push('Command uses piping');
      }
    }

    // 检查敏感文件
    const confirmReason = execution._internal.confirmationReason || '';
    if (confirmReason.includes('Sensitive file')) {
      risks.push('Operation involves sensitive files');
    }

    return risks;
  }

  /**
   * 获取受影响的文件路径
   */
  private getAffectedPaths(execution: ToolExecution): string[] {
    const params = execution.params;
    const pathKeys = ['file_path', 'path', 'target', 'destination'];
    const paths: string[] = [];

    for (const key of pathKeys) {
      if (typeof params[key] === 'string') {
        paths.push(params[key] as string);
      }
    }

    return paths;
  }

  /**
   * 截断文本
   */
  private truncate(text: string, maxLines: number = 10): string {
    const lines = text.split('\n');
    if (lines.length <= maxLines) {
      return text;
    }
    return lines.slice(0, maxLines).join('\n') + `\n... (${lines.length - maxLines} more lines)`;
  }
}
