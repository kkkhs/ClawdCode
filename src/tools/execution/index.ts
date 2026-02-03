/**
 * 执行管道模块导出
 */

// 类型
export {
  PermissionMode,
  PermissionResult,
  ToolExecution,
  type PipelineStage,
  type PipelineExecutionContext,
  type ExecutionPipelineConfig,
  type ExecutionHistoryEntry,
  type PermissionCheckResult,
  type PermissionConfig,
  type ToolInvocationDescriptor,
  type ConfirmationDetails,
  type ConfirmationResponse,
  type ConfirmationHandler,
  type ToolProgress,
  type PreToolHookResult,
  type PostToolHookParams,
  type StageStartEvent,
  type StageCompleteEvent,
} from './types.js';

// 主类
export { ExecutionPipeline, type ExecutionPipelineEvents } from './ExecutionPipeline.js';

// 阶段
export {
  DiscoveryStage,
  PermissionStage,
  HookStage,
  ConfirmationStage,
  ExecutionStage,
  PostHookStage,
  FormattingStage,
} from './stages/index.js';
