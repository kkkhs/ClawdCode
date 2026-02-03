/**
 * 工具系统导出
 */

// 类型
export {
  ToolKind,
  ToolErrorType,
} from './types.js';

export type {
  Tool,
  ToolResult,
  ToolError,
  ToolDescription,
  ToolExample,
  ExecutionContext,
  FunctionDeclaration,
  ToolInvocation,
} from './types.js';

// 工厂函数
export { createTool } from './createTool.js';
export type { ToolConfig } from './createTool.js';

// Schema
export { ToolSchemas, optional } from './schemas.js';

// 注册表
export { ToolRegistry, createToolRegistry } from './registry.js';

// 注册表事件
export type { ToolRegisteredEvent } from './registry.js';

// 内置工具
export {
  readTool,
  editTool,
  writeTool,
  globTool,
  grepTool,
  bashTool,
  getBuiltinTools,
} from './builtin/index.js';

// 执行管道
export {
  ExecutionPipeline,
  PermissionMode,
  PermissionResult,
  ToolExecution,
} from './execution/index.js';

export type {
  ExecutionPipelineEvents,
  PipelineStage,
  PipelineExecutionContext,
  ExecutionPipelineConfig,
  ExecutionHistoryEntry,
  PermissionCheckResult,
  PermissionConfig,
  ToolInvocationDescriptor,
  ConfirmationDetails,
  ConfirmationResponse,
  ConfirmationHandler,
  ToolProgress,
  PreToolHookResult,
  PostToolHookParams,
} from './execution/index.js';

// 验证
export {
  PermissionChecker,
  DEFAULT_PERMISSION_CONFIG,
  SensitiveFileDetector,
  SensitivityLevel,
} from './validation/index.js';

export type {
  SensitivityResult,
  SensitivityResultWithPath,
} from './validation/index.js';
