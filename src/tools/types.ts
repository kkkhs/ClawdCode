/**
 * 工具系统类型定义
 */

// ========== 工具类型枚举 ==========

/**
 * 工具类型
 * 决定工具的权限行为
 */
export enum ToolKind {
  /** 只读操作，无副作用 */
  ReadOnly = 'readonly',
  /** 文件写入操作 */
  Write = 'write',
  /** 命令执行，可能有副作用 */
  Execute = 'execute',
}

// ========== 工具描述 ==========

/**
 * 工具示例
 */
export interface ToolExample {
  description: string;
  params: Record<string, unknown>;
}

/**
 * 工具描述
 */
export interface ToolDescription {
  /** 简短描述（一行） */
  short: string;
  /** 详细说明 */
  long?: string;
  /** 使用注意事项 */
  usageNotes?: string[];
  /** 使用示例 */
  examples?: ToolExample[];
  /** 重要提示 */
  important?: string[];
}

// ========== 工具错误 ==========

/**
 * 工具错误类型
 */
export enum ToolErrorType {
  /** 参数验证错误 */
  VALIDATION_ERROR = 'validation_error',
  /** 执行错误 */
  EXECUTION_ERROR = 'execution_error',
  /** 权限错误 */
  PERMISSION_ERROR = 'permission_error',
  /** 超时错误 */
  TIMEOUT_ERROR = 'timeout_error',
  /** 未知错误 */
  UNKNOWN_ERROR = 'unknown_error',
}

/**
 * 工具错误
 */
export interface ToolError {
  type: ToolErrorType;
  message: string;
  details?: unknown;
}

// ========== 工具结果 ==========

/**
 * 工具执行结果
 */
export interface ToolResult {
  /** 执行是否成功 */
  success: boolean;
  /** 传递给 LLM 的内容（可能很长） */
  llmContent: string;
  /** 显示给用户的内容（简洁摘要） */
  displayContent: string;
  /** 错误信息 */
  error?: ToolError;
  /** 额外元数据 */
  metadata?: Record<string, unknown>;
}

// ========== 执行上下文 ==========

/**
 * 工具执行上下文
 */
export interface ExecutionContext {
  /** 会话 ID */
  sessionId?: string;
  /** 中断信号 */
  signal?: AbortSignal;
  /** 工作目录 */
  cwd?: string;
}

// ========== 函数声明 ==========

/**
 * LLM 函数声明（OpenAI 格式）
 */
export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// ========== 工具调用 ==========

/**
 * 工具调用实例
 */
export interface ToolInvocation<TParams = unknown> {
  /** 工具名称 */
  toolName: string;
  /** 参数 */
  params: TParams;
  /** 调用 ID */
  callId?: string;
}

// ========== 工具接口 ==========

/**
 * 工具接口
 */
export interface Tool<TParams = unknown> {
  /** 工具唯一名称 */
  readonly name: string;
  /** 显示名称 */
  readonly displayName: string;
  /** 工具类型 */
  readonly kind: ToolKind;
  /** 是否只读 */
  readonly isReadOnly: boolean;
  /** 是否并发安全 */
  readonly isConcurrencySafe: boolean;
  /** 是否启用结构化输出 */
  readonly strict: boolean;
  /** 工具描述 */
  readonly description: ToolDescription;
  /** 版本 */
  readonly version: string;
  /** 分类 */
  readonly category?: string;
  /** 标签 */
  readonly tags: string[];

  /** 生成 LLM 函数声明 */
  getFunctionDeclaration(): FunctionDeclaration;

  /** 构建执行实例 */
  build(params: TParams): ToolInvocation<TParams>;

  /** 执行工具 */
  execute(params: TParams, context?: ExecutionContext): Promise<ToolResult>;

  /** 提取签名内容（用于权限规则） */
  extractSignatureContent?: (params: unknown) => string;

  /** 抽象权限规则（用于权限匹配） */
  abstractPermissionRule?: (params: unknown) => string;
}
