/**
 * Slash 命令类型定义
 */

/**
 * Slash 命令上下文
 */
export interface SlashCommandContext {
  /** 当前工作目录 */
  cwd: string;
  /** 会话 ID */
  sessionId?: string;
  /** 用户消息历史 */
  messages?: any[];
}

/**
 * Slash 命令结果
 */
export interface SlashCommandResult {
  /** 结果类型 */
  type: 'success' | 'error' | 'info' | 'silent';
  /** 内容（Markdown 格式） */
  content?: string;
  /** 是否继续处理（用于某些命令可能需要修改后续流程） */
  shouldContinue?: boolean;
  /** 额外数据 */
  data?: any;
}

/**
 * Slash 命令定义
 */
export interface SlashCommand {
  /** 命令名称（不含 /） */
  name: string;
  /** 命令别名 */
  aliases?: string[];
  /** 命令描述 */
  description: string;
  /** 使用示例 */
  usage?: string;
  /** 命令处理函数 */
  handler: (args: string, context: SlashCommandContext) => Promise<SlashCommandResult>;
}
