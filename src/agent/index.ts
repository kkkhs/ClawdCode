/**
 * Agent 模块导出
 */

export { Agent, default as AgentDefault } from './Agent.js';
export { SimpleAgent } from './SimpleAgent.js';

export type {
  // 消息类型
  Message,
  MessageRole,
  ToolCall,
  
  // 上下文类型
  ChatContext,
  PermissionMode,
  ConfirmationHandler,
  
  // 循环类型
  LoopOptions,
  LoopResult,
  LoopError,
  LoopErrorType,
  
  // 工具类型
  ToolResult,
  ToolDefinition,
  
  // 配置类型
  AgentConfig,
  AgentOptions,
  
  // ChatService 类型
  ChatResponse,
  IChatService,
} from './types.js';
