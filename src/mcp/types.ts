/**
 * MCP 协议类型定义
 * Model Context Protocol - Anthropic 推出的 AI 工具扩展协议
 */

import type { EventEmitter } from 'events';

/**
 * MCP 连接状态枚举
 */
export enum McpConnectionStatus {
  DISCONNECTED = 'disconnected',  // 未连接
  CONNECTING = 'connecting',      // 连接中
  CONNECTED = 'connected',        // 已连接
  ERROR = 'error',                // 错误
}

/**
 * 错误类型枚举
 */
export enum ErrorType {
  NETWORK_TEMPORARY = 'network_temporary',  // 临时网络错误（可重试）
  NETWORK_PERMANENT = 'network_permanent',  // 永久网络错误
  CONFIG_ERROR = 'config_error',            // 配置错误
  AUTH_ERROR = 'auth_error',                // 认证错误
  PROTOCOL_ERROR = 'protocol_error',        // 协议错误
  UNKNOWN = 'unknown',                      // 未知错误
}

/**
 * 分类后的错误
 */
export interface ClassifiedError {
  type: ErrorType;
  isRetryable: boolean;
  originalError: Error;
}

/**
 * MCP 工具定义（来自 MCP Server）
 */
export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, JSONSchemaProperty>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

/**
 * JSON Schema 属性类型
 */
export interface JSONSchemaProperty {
  type?: string | string[];
  description?: string;
  enum?: any[];
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  default?: any;
  oneOf?: JSONSchemaProperty[];
  anyOf?: JSONSchemaProperty[];
  allOf?: JSONSchemaProperty[];
  $ref?: string;
}

/**
 * MCP 工具调用响应
 */
export interface McpToolCallResponse {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;       // base64 编码的图片数据
    mimeType?: string;
    uri?: string;
  }>;
  isError?: boolean;
}

/**
 * MCP 服务器配置
 */
export interface McpServerConfig {
  /** 传输类型 */
  type: 'stdio' | 'sse' | 'http';

  // ===== stdio 配置 =====
  /** 可执行命令 */
  command?: string;
  /** 命令参数 */
  args?: string[];
  /** 环境变量 */
  env?: Record<string, string>;
  /** 工作目录 */
  cwd?: string;

  // ===== sse/http 配置 =====
  /** 服务器 URL */
  url?: string;
  /** HTTP 请求头 */
  headers?: Record<string, string>;

  // ===== OAuth 配置 =====
  oauth?: OAuthConfig;

  // ===== 健康检查配置 =====
  healthCheck?: HealthCheckConfig;

  // ===== 其他配置 =====
  /** 是否启用 */
  enabled?: boolean;
  /** 连接超时（毫秒） */
  timeout?: number;
  /** 描述 */
  description?: string;
}

/**
 * OAuth 配置
 */
export interface OAuthConfig {
  enabled: boolean;
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  scopes?: string[];
  redirectUri?: string;
}

/**
 * 健康检查配置
 */
export interface HealthCheckConfig {
  enabled: boolean;
  /** 检查间隔（毫秒） */
  intervalMs: number;
  /** 超时时间（毫秒） */
  timeoutMs: number;
  /** 最大失败次数（超过则标记为不健康） */
  maxFailures: number;
}

/**
 * MCP 服务器信息
 */
export interface McpServerInfo {
  /** 服务器配置 */
  config: McpServerConfig;
  /** 客户端实例 */
  client: McpClientInterface;
  /** 连接状态 */
  status: McpConnectionStatus;
  /** 可用工具列表 */
  tools: McpToolDefinition[];
  /** 服务器名称 */
  serverName?: string;
  /** 服务器版本 */
  serverVersion?: string;
  /** 连接时间 */
  connectedAt?: Date;
  /** 最后错误 */
  lastError?: Error;
}

/**
 * MCP 客户端接口
 */
export interface McpClientInterface extends EventEmitter {
  /** 连接状态 */
  readonly connectionStatus: McpConnectionStatus;
  /** 可用工具 */
  readonly availableTools: McpToolDefinition[];
  /** 服务器名称 */
  readonly serverName: string;

  /** 连接（带重试） */
  connectWithRetry(maxRetries?: number, initialDelay?: number): Promise<void>;
  /** 断开连接 */
  disconnect(): Promise<void>;
  /** 调用工具 */
  callTool(name: string, arguments_: Record<string, any>): Promise<McpToolCallResponse>;
  /** 重新加载工具列表 */
  reloadTools(): Promise<void>;
}

/**
 * MCP 注册中心统计信息
 */
export interface McpRegistryStatistics {
  totalServers: number;
  connectedServers: number;
  disconnectedServers: number;
  errorServers: number;
  totalTools: number;
}

/**
 * MCP 事件类型
 */
export interface McpClientEvents {
  connected: (serverInfo: { name: string; version: string }) => void;
  disconnected: () => void;
  error: (error: Error) => void;
  reconnecting: (attempt: number) => void;
  reconnected: () => void;
  reconnectFailed: () => void;
  toolsUpdated: (tools: McpToolDefinition[]) => void;
  unhealthy: (failures: number, error: Error) => void;
}

export interface McpRegistryEvents {
  serverRegistered: (name: string, info: McpServerInfo) => void;
  serverConnected: (name: string, server: { name: string; version: string }) => void;
  serverDisconnected: (name: string) => void;
  serverError: (name: string, error: Error) => void;
  toolsUpdated: (serverName: string, tools: McpToolDefinition[], oldCount: number) => void;
}

/**
 * 默认健康检查配置
 */
export const DEFAULT_HEALTH_CHECK_CONFIG: HealthCheckConfig = {
  enabled: true,
  intervalMs: 30000,    // 30 秒
  timeoutMs: 5000,      // 5 秒
  maxFailures: 3,       // 3 次失败后标记为不健康
};

/**
 * 默认连接配置
 */
export const DEFAULT_CONNECTION_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000,
  maxReconnectAttempts: 5,
  maxReconnectDelay: 30000,
};
