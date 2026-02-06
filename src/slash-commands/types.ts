/**
 * Slash 命令类型定义
 */

/**
 * 命令分类
 */
export type CommandCategory = 
  | 'general'      // 通用命令
  | 'session'      // 会话相关
  | 'config'       // 配置相关
  | 'skills'       // Skills 相关
  | 'git'          // Git 相关
  | 'mcp'          // MCP 相关
  | 'custom';      // 自定义命令

/**
 * 选择器选项（用于交互式选择）
 */
export interface SelectorOption<T = string> {
  value: T;
  label: string;
  description?: string;
  isCurrent?: boolean;
}

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
  /** ContextManager 实例（用于 /compact 等命令） */
  contextManager?: any;
  /** ChatService 实例（用于 LLM 调用） */
  chatService?: any;
  /** 模型名称 */
  modelName?: string;
  /** 显示选择器的回调 */
  showSelector?: <T>(options: {
    title: string;
    options: SelectorOption<T>[];
    onSelect: (value: T) => void;
    onCancel: () => void;
  }) => void;
  /** 隐藏选择器的回调 */
  hideSelector?: () => void;
}

/**
 * Slash 命令结果
 */
export interface SlashCommandResult {
  /** 是否成功 */
  success: boolean;
  /** 结果类型（用于 UI 展示） */
  type?: 'success' | 'error' | 'info' | 'silent' | 'selector';
  /** 内容（Markdown 格式） */
  content?: string;
  /** 消息（简短提示） */
  message?: string;
  /** 错误信息 */
  error?: string;
  /** 是否继续处理（用于某些命令可能需要修改后续流程） */
  shouldContinue?: boolean;
  /** 额外数据 */
  data?: any;
  /** 选择器配置（type 为 'selector' 时使用） */
  selector?: {
    title: string;
    options: SelectorOption[];
    /** 选择后的处理器名称 */
    handler: 'theme' | 'model';
  };
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
  /** 详细描述 */
  fullDescription?: string;
  /** 使用示例 */
  usage?: string;
  /** 命令分类 */
  category?: CommandCategory;
  /** 示例列表 */
  examples?: string[];
  /** 命令处理函数 */
  handler: (args: string, context: SlashCommandContext) => Promise<SlashCommandResult>;
}

/**
 * 命令建议（用于模糊匹配）
 */
export interface CommandSuggestion {
  /** 完整命令（含 /） */
  command: string;
  /** 命令描述 */
  description: string;
  /** 匹配分数 (0-100) */
  matchScore?: number;
}

/**
 * 命令注册表类型
 */
export type SlashCommandRegistry = Record<string, SlashCommand>;

// ==================== 自定义命令类型 ====================

/**
 * 自定义命令 Frontmatter 配置
 */
export interface CustomCommandConfig {
  /** 命令描述（AI 调用必需） */
  description?: string;
  /** 参数提示，如 [message] */
  argumentHint?: string;
  /** 限制可用工具列表 */
  allowedTools?: string[];
  /** 指定执行模型 */
  model?: string;
  /** 禁止 AI 调用（默认 false） */
  disableModelInvocation?: boolean;
}

/**
 * 自定义命令来源
 */
export type CustomCommandSource = 'user' | 'project';

/**
 * 自定义命令目录类型
 */
export type CustomCommandSourceDir = 'claude' | 'clawdcode';

/**
 * 自定义命令
 */
export interface CustomCommand {
  /** 命令名（不含 /） */
  name: string;
  /** 命名空间（子目录名） */
  namespace?: string;
  /** Frontmatter 配置 */
  config: CustomCommandConfig;
  /** Markdown 正文 */
  content: string;
  /** 文件完整路径 */
  path: string;
  /** 来源类型 */
  source: CustomCommandSource;
  /** 目录类型 */
  sourceDir: CustomCommandSourceDir;
}

/**
 * 命令执行上下文
 */
export interface CustomCommandExecutionContext {
  /** 命令参数 */
  args: string[];
  /** 工作目录 */
  workspaceRoot: string;
  /** 中断信号 */
  signal?: AbortSignal;
}

/**
 * 自定义命令发现结果
 */
export interface CustomCommandDiscoveryResult {
  /** 发现的命令列表 */
  commands: CustomCommand[];
  /** 警告信息 */
  warnings: string[];
  /** 扫描的目录 */
  scannedDirs: string[];
}
