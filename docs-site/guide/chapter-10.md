# 第十章：MCP 协议

> **学习目标**：理解 MCP 协议架构、实现 MCP 客户端、服务器注册中心和动态工具注册
> 
> **预计阅读时间**：55 分钟
> 
> **实践时间**：70 分钟
> 
> **前置要求**：已完成第九章的代码实现

---

## 10.1 什么是 MCP

### 10.1.1 MCP 协议简介

**MCP**（Model Context Protocol）是 Anthropic 推出的 AI 工具扩展协议，旨在标准化 AI 与外部工具和数据源之间的通信方式。

```
┌─────────────────────────────────────────────────────────────┐
│                        AI 应用（Host）                       │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │ Claude  │  │ Cursor  │  │ Cline   │  │ Clawdcode│        │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘        │
└───────┼────────────┼────────────┼────────────┼─────────────┘
        │            │            │            │
        └────────────┴────────────┴────────────┘
                          │
                    MCP 协议
                          │
┌─────────────────────────┼─────────────────────────────────┐
│                   MCP 服务器                               │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │
│  │ GitHub  │  │  Slack  │  │ Database│  │ Browser │       │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘       │
└───────────────────────────────────────────────────────────┘
```

### 10.1.2 为什么需要 MCP

| 问题 | MCP 解决方案 |
|------|-------------|
| **工具碎片化** | 统一的工具发现和调用协议 |
| **重复开发** | 工具服务器可被多个 AI 应用复用 |
| **安全隔离** | 工具在独立进程运行，与 Host 隔离 |
| **动态扩展** | 运行时发现和注册新工具 |

### 10.1.3 MCP 核心概念

| 概念 | 说明 |
|------|------|
| **Host** | AI 应用（如 Claude Desktop、ClawdCode） |
| **MCP Server** | 提供工具/资源的服务进程 |
| **Transport** | 通信方式（stdio、SSE、HTTP） |
| **Tool** | 服务器暴露的可调用功能 |
| **Resource** | 服务器提供的数据资源 |

### 10.1.4 目录结构

```
src/mcp/
├── types.ts            # MCP 类型定义
├── McpClient.ts        # MCP 客户端（连接、重试、工具调用）
├── McpRegistry.ts      # 服务器注册中心（单例）
├── createMcpTool.ts    # JSON Schema → Zod 转换
├── HealthMonitor.ts    # 健康监控
├── index.ts            # 模块导出

src/slash-commands/
├── types.ts            # Slash 命令类型
├── mcpCommand.ts       # /mcp 命令实现
└── index.ts            # 命令注册
```

---

## 10.2 MCP 类型定义

### 10.2.1 连接状态枚举

**文件位置**：`src/mcp/types.ts`

```typescript
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
 * 用于判断是否应该重试连接
 */
export enum ErrorType {
  NETWORK_TEMPORARY = 'network_temporary',  // 临时网络错误（可重试）
  NETWORK_PERMANENT = 'network_permanent',  // 永久网络错误
  CONFIG_ERROR = 'config_error',            // 配置错误（不重试）
  AUTH_ERROR = 'auth_error',                // 认证错误（需要用户介入）
  PROTOCOL_ERROR = 'protocol_error',        // 协议错误
  UNKNOWN = 'unknown',                      // 未知错误
}

/**
 * 分类后的错误
 */
export interface ClassifiedError {
  type: ErrorType;
  isRetryable: boolean;   // 是否可重试
  originalError: Error;
}
```

### 10.2.2 工具定义类型

```typescript
/**
 * MCP 工具定义（来自 MCP Server）
 * 这是 MCP 服务器返回的工具描述格式
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
 * MCP 使用标准 JSON Schema 描述参数
 */
export interface JSONSchemaProperty {
  type?: string | string[];      // 类型（string/number/boolean/object/array）
  description?: string;           // 属性描述
  enum?: any[];                   // 枚举值
  items?: JSONSchemaProperty;     // 数组元素类型
  properties?: Record<string, JSONSchemaProperty>;  // 对象属性
  required?: string[];            // 必填字段
  minimum?: number;               // 数字最小值
  maximum?: number;               // 数字最大值
  minLength?: number;             // 字符串最小长度
  maxLength?: number;             // 字符串最大长度
  pattern?: string;               // 正则模式
  default?: any;                  // 默认值
  oneOf?: JSONSchemaProperty[];   // 联合类型
  anyOf?: JSONSchemaProperty[];   // 任一类型
  allOf?: JSONSchemaProperty[];   // 交叉类型
  $ref?: string;                  // 引用
}

/**
 * MCP 工具调用响应
 */
export interface McpToolCallResponse {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;          // 文本内容
    data?: string;          // base64 编码的图片数据
    mimeType?: string;      // MIME 类型
    uri?: string;           // 资源 URI
  }>;
  isError?: boolean;        // 是否为错误响应
}
```

### 10.2.3 服务器配置类型

```typescript
/**
 * MCP 服务器配置
 * 支持三种传输类型：stdio、sse、http
 */
export interface McpServerConfig {
  /** 传输类型 */
  type: 'stdio' | 'sse' | 'http';

  // ===== stdio 配置（本地进程） =====
  /** 可执行命令 */
  command?: string;
  /** 命令参数 */
  args?: string[];
  /** 环境变量 */
  env?: Record<string, string>;
  /** 工作目录 */
  cwd?: string;

  // ===== sse/http 配置（远程服务） =====
  /** 服务器 URL */
  url?: string;
  /** HTTP 请求头 */
  headers?: Record<string, string>;

  // ===== OAuth 配置（可选） =====
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
  maxRetries: 3,            // 初始连接最大重试次数
  initialDelay: 1000,       // 初始重试延迟（毫秒）
  maxReconnectAttempts: 5,  // 断连后最大重连次数
  maxReconnectDelay: 30000, // 最大重连延迟（毫秒）
};
```

### 10.2.4 客户端接口

```typescript
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
 * 继承 EventEmitter 以支持事件驱动
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
  totalServers: number;       // 总服务器数
  connectedServers: number;   // 已连接服务器数
  disconnectedServers: number;// 未连接服务器数
  errorServers: number;       // 错误状态服务器数
  totalTools: number;         // 总工具数
}
```

### 10.2.5 事件类型

```typescript
/**
 * MCP 客户端事件类型
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

/**
 * MCP 注册中心事件类型
 */
export interface McpRegistryEvents {
  serverRegistered: (name: string, info: McpServerInfo) => void;
  serverConnected: (name: string, server: { name: string; version: string }) => void;
  serverDisconnected: (name: string) => void;
  serverError: (name: string, error: Error) => void;
  toolsUpdated: (serverName: string, tools: McpToolDefinition[], oldCount: number) => void;
}
```

---

## 10.3 MCP 客户端

### 10.3.1 错误分类函数

**文件位置**：`src/mcp/McpClient.ts`

```typescript
/**
 * MCP 客户端
 * 处理与 MCP 服务器的连接、重试、工具调用
 */

import { EventEmitter } from 'events';
import {
  McpConnectionStatus,
  McpToolDefinition,
  McpToolCallResponse,
  McpServerConfig,
  HealthCheckConfig,
  ErrorType,
  ClassifiedError,
  DEFAULT_CONNECTION_CONFIG,
  type McpClientInterface,
} from './types.js';
import { HealthMonitor } from './HealthMonitor.js';

/**
 * 错误分类函数
 * 根据错误消息判断错误类型，决定是否应该重试
 */
function classifyError(error: unknown): ClassifiedError {
  if (!(error instanceof Error)) {
    return {
      type: ErrorType.UNKNOWN,
      isRetryable: false,
      originalError: new Error(String(error)),
    };
  }

  const msg = error.message.toLowerCase();

  // 永久性配置错误（不重试）
  const permanentErrors = [
    'command not found',
    'no such file',
    'permission denied',
    'invalid configuration',
    'enoent',
    'spawn',
  ];
  if (permanentErrors.some(p => msg.includes(p))) {
    return { type: ErrorType.CONFIG_ERROR, isRetryable: false, originalError: error };
  }

  // 认证错误（需要用户介入，不自动重试）
  if (msg.includes('unauthorized') || msg.includes('401') || msg.includes('authentication failed')) {
    return { type: ErrorType.AUTH_ERROR, isRetryable: false, originalError: error };
  }

  // 临时网络错误（可重试）
  const temporaryErrors = [
    'timeout',
    'connection refused',
    'network error',
    'rate limit',
    '503',
    '429',
    'econnrefused',
    'etimedout',
  ];
  if (temporaryErrors.some(t => msg.includes(t))) {
    return { type: ErrorType.NETWORK_TEMPORARY, isRetryable: true, originalError: error };
  }

  // 默认允许重试（乐观策略）
  return { type: ErrorType.UNKNOWN, isRetryable: true, originalError: error };
}
```

### 10.3.2 客户端类结构

```typescript
/**
 * MCP 客户端实现
 */
export class McpClient extends EventEmitter implements McpClientInterface {
  // ===== 状态 =====
  private status: McpConnectionStatus = McpConnectionStatus.DISCONNECTED;
  private sdkClient: any = null;  // @modelcontextprotocol/sdk Client
  private tools = new Map<string, McpToolDefinition>();
  private serverInfo: { name: string; version: string } | null = null;

  // ===== 重连配置 =====
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isManualDisconnect = false;  // 区分主动断开和意外断连

  // ===== 健康监控 =====
  private healthMonitor: HealthMonitor | null = null;

  // ===== 公开属性 =====
  public readonly serverName: string;

  constructor(
    private config: McpServerConfig,
    serverName?: string,
    healthCheckConfig?: HealthCheckConfig
  ) {
    super();
    this.serverName = serverName || 'default';

    // 初始化健康监控
    if (healthCheckConfig?.enabled) {
      this.healthMonitor = new HealthMonitor(this, healthCheckConfig);
      this.healthMonitor.on('unhealthy', (failures: number, error: Error) => {
        this.emit('unhealthy', failures, error);
        // 不健康时触发重连
        if (this.status === McpConnectionStatus.CONNECTED) {
          this.handleUnexpectedClose();
        }
      });
    }
  }

  // ===== Getter =====

  get connectionStatus(): McpConnectionStatus {
    return this.status;
  }

  get availableTools(): McpToolDefinition[] {
    return Array.from(this.tools.values());
  }

  private setStatus(status: McpConnectionStatus): void {
    const oldStatus = this.status;
    this.status = status;
    if (oldStatus !== status) {
      this.emit('statusChanged', status, oldStatus);
    }
  }
```

### 10.3.3 连接逻辑（带重试）

```typescript
  /**
   * 连接到 MCP 服务器（带重试）
   * 使用指数退避策略进行重试
   */
  async connectWithRetry(
    maxRetries = DEFAULT_CONNECTION_CONFIG.maxRetries,
    initialDelay = DEFAULT_CONNECTION_CONFIG.initialDelay
  ): Promise<void> {
    if (this.status !== McpConnectionStatus.DISCONNECTED) {
      throw new Error('客户端已连接或正在连接中');
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.doConnect();
        this.reconnectAttempts = 0;  // 连接成功，重置计数器
        return;
      } catch (error) {
        lastError = error as Error;
        const classified = classifyError(error);

        console.warn(
          `[McpClient:${this.serverName}] 连接失败（${attempt}/${maxRetries}）:`,
          classified.type,
          (error as Error).message
        );

        // 永久性错误不重试
        if (!classified.isRetryable) {
          console.error(`[McpClient:${this.serverName}] 检测到永久性错误，放弃重试`);
          throw error;
        }

        // 指数退避：1s → 2s → 4s → ...
        if (attempt < maxRetries) {
          const delay = initialDelay * Math.pow(2, attempt - 1);
          console.log(`[McpClient:${this.serverName}] ${delay}ms 后重试...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('连接失败');
  }
```

### 10.3.4 实际连接逻辑

```typescript
  /**
   * 实际连接逻辑
   */
  private async doConnect(): Promise<void> {
    try {
      this.setStatus(McpConnectionStatus.CONNECTING);

      // 动态导入 MCP SDK（避免启动时加载）
      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');

      // 创建 SDK 客户端
      this.sdkClient = new Client(
        { name: 'clawdcode', version: '1.0.0' },
        { capabilities: { roots: { listChanged: true }, sampling: {} } }
      );

      // 监听关闭事件
      this.sdkClient.onclose = () => this.handleUnexpectedClose();

      // 创建传输层
      const transport = await this.createTransport();

      // 连接
      await this.sdkClient.connect(transport);

      // 获取服务器信息
      const serverVersion = this.sdkClient.getServerVersion?.();
      this.serverInfo = {
        name: serverVersion?.name || 'Unknown',
        version: serverVersion?.version || '0.0.0',
      };

      // 加载工具列表
      await this.loadTools();

      this.setStatus(McpConnectionStatus.CONNECTED);
      this.emit('connected', this.serverInfo);

      // 启动健康监控
      if (this.healthMonitor) {
        this.healthMonitor.start();
      }

      console.log(
        `[McpClient:${this.serverName}] 已连接到服务器:`,
        this.serverInfo.name,
        `v${this.serverInfo.version}`,
        `(${this.tools.size} 个工具)`
      );
    } catch (error) {
      this.setStatus(McpConnectionStatus.ERROR);
      this.emit('error', error);
      throw error;
    }
  }
```

### 10.3.5 传输层创建

```typescript
  /**
   * 创建传输层
   * 根据配置类型创建不同的传输实例
   */
  private async createTransport(): Promise<any> {
    const { type, command, args, env, cwd, url, headers } = this.config;

    // ===== stdio 传输（本地进程） =====
    if (type === 'stdio') {
      if (!command) {
        throw new Error('stdio 传输需要 command 参数');
      }

      const { StdioClientTransport } = await import(
        '@modelcontextprotocol/sdk/client/stdio.js'
      );

      // 合并环境变量（过滤掉 undefined）
      const mergedEnv: Record<string, string> = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) {
          mergedEnv[key] = value;
        }
      }
      if (env) {
        Object.assign(mergedEnv, env);
      }

      return new StdioClientTransport({
        command,
        args: args || [],
        env: mergedEnv,
        cwd: cwd || process.cwd(),
        stderr: 'ignore',  // 忽略 stderr（避免污染输出）
      });
    }

    // ===== SSE 传输（Server-Sent Events） =====
    if (type === 'sse') {
      if (!url) {
        throw new Error('sse 传输需要 url 参数');
      }

      const { SSEClientTransport } = await import(
        '@modelcontextprotocol/sdk/client/sse.js'
      );

      return new SSEClientTransport(new URL(url), {
        requestInit: { headers: headers || {} },
      });
    }

    // ===== HTTP 传输（Streamable HTTP） =====
    if (type === 'http') {
      if (!url) {
        throw new Error('http 传输需要 url 参数');
      }

      // 尝试使用 StreamableHTTPClientTransport
      try {
        const { StreamableHTTPClientTransport } = await import(
          '@modelcontextprotocol/sdk/client/streamableHttp.js'
        );
        return new StreamableHTTPClientTransport(new URL(url), {
          requestInit: { headers: headers || {} },
        });
      } catch {
        // 回退到 SSE
        const { SSEClientTransport } = await import(
          '@modelcontextprotocol/sdk/client/sse.js'
        );
        return new SSEClientTransport(new URL(url), {
          requestInit: { headers: headers || {} },
        });
      }
    }

    throw new Error(`不支持的传输类型: ${type}`);
  }
```

### 10.3.6 工具加载与调用

```typescript
  /**
   * 加载工具列表
   */
  private async loadTools(): Promise<void> {
    if (!this.sdkClient) {
      throw new Error('客户端未连接');
    }

    try {
      const result = await this.sdkClient.listTools();
      const oldCount = this.tools.size;

      this.tools.clear();
      if (result.tools && Array.isArray(result.tools)) {
        for (const tool of result.tools) {
          this.tools.set(tool.name, {
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema || { type: 'object' },
          });
        }
      }

      // 如果工具数量变化，触发事件
      if (oldCount !== this.tools.size) {
        this.emit('toolsUpdated', this.availableTools);
      }
    } catch (error) {
      console.error(`[McpClient:${this.serverName}] 加载工具列表失败:`, error);
      throw error;
    }
  }

  /**
   * 重新加载工具列表（公开方法）
   */
  async reloadTools(): Promise<void> {
    await this.loadTools();
  }

  /**
   * 调用 MCP 工具
   */
  async callTool(
    name: string,
    arguments_: Record<string, any> = {}
  ): Promise<McpToolCallResponse> {
    if (!this.sdkClient) {
      throw new Error('客户端未连接到服务器');
    }

    if (!this.tools.has(name)) {
      throw new Error(`工具 "${name}" 不存在`);
    }

    try {
      const result = await this.sdkClient.callTool({
        name,
        arguments: arguments_,
      });

      return result as McpToolCallResponse;
    } catch (error) {
      console.error(`[McpClient:${this.serverName}] 调用工具 "${name}" 失败:`, error);
      throw error;
    }
  }
```

### 10.3.7 断连处理与自动重连

```typescript
  /**
   * 主动断开连接
   */
  async disconnect(): Promise<void> {
    this.isManualDisconnect = true;

    // 停止健康监控
    if (this.healthMonitor) {
      this.healthMonitor.stop();
    }

    // 清除重连计时器
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // 关闭 SDK 客户端
    if (this.sdkClient) {
      try {
        await this.sdkClient.close();
      } catch (error) {
        console.warn(`[McpClient:${this.serverName}] 关闭连接时出错:`, error);
      }
      this.sdkClient = null;
    }

    this.tools.clear();
    this.setStatus(McpConnectionStatus.DISCONNECTED);
    this.emit('disconnected');

    console.log(`[McpClient:${this.serverName}] 已断开连接`);
  }

  /**
   * 处理意外断连
   */
  private handleUnexpectedClose(): void {
    // 如果是主动断开，不处理
    if (this.isManualDisconnect) {
      return;
    }

    if (this.status === McpConnectionStatus.CONNECTED) {
      console.warn(`[McpClient:${this.serverName}] 检测到意外断连，准备重连...`);
      this.setStatus(McpConnectionStatus.ERROR);
      this.emit('error', new Error('MCP服务器连接意外关闭'));
      this.scheduleReconnect();
    }
  }

  /**
   * 调度自动重连
   * 使用指数退避：1s → 2s → 4s → 8s → 16s（最大 30s）
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // 检查是否超过最大重连次数
    if (this.reconnectAttempts >= DEFAULT_CONNECTION_CONFIG.maxReconnectAttempts) {
      console.error(`[McpClient:${this.serverName}] 达到最大重连次数，放弃重连`);
      this.emit('reconnectFailed');
      return;
    }

    // 计算指数退避延迟
    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts),
      DEFAULT_CONNECTION_CONFIG.maxReconnectDelay
    );
    this.reconnectAttempts++;

    console.log(
      `[McpClient:${this.serverName}] 将在 ${delay}ms 后进行第 ${this.reconnectAttempts} 次重连...`
    );

    this.emit('reconnecting', this.reconnectAttempts);

    this.reconnectTimer = setTimeout(async () => {
      try {
        // 清理旧连接
        if (this.sdkClient) {
          await this.sdkClient.close().catch(() => {});
          this.sdkClient = null;
        }

        this.setStatus(McpConnectionStatus.DISCONNECTED);
        await this.doConnect();

        console.log(`[McpClient:${this.serverName}] 重连成功`);
        this.reconnectAttempts = 0;
        this.emit('reconnected');
      } catch (error) {
        const classified = classifyError(error);
        if (classified.isRetryable) {
          this.scheduleReconnect();  // 继续尝试
        } else {
          console.error(`[McpClient:${this.serverName}] 检测到永久性错误，停止重连`);
          this.emit('reconnectFailed');
        }
      }
    }, delay);
  }
}
```

---

## 10.4 MCP 服务器注册中心

### 10.4.1 单例设计

**文件位置**：`src/mcp/McpRegistry.ts`

```typescript
/**
 * MCP 服务器注册中心
 * 管理多个 MCP 服务器的单例注册表
 */

import { EventEmitter } from 'events';
import {
  McpConnectionStatus,
  McpServerConfig,
  McpServerInfo,
  McpToolDefinition,
  McpRegistryStatistics,
} from './types.js';
import { McpClient } from './McpClient.js';
import { createMcpTool } from './createMcpTool.js';
import type { Tool } from '../tools/types.js';

/**
 * MCP 注册中心（单例）
 * 
 * 为什么使用单例？
 * 1. MCP 连接是全局资源，需要统一管理
 * 2. 避免重复连接相同服务器
 * 3. 便于工具发现和统计
 */
export class McpRegistry extends EventEmitter {
  private static instance: McpRegistry | null = null;
  private servers: Map<string, McpServerInfo> = new Map();

  private constructor() {
    super();
  }

  /**
   * 获取单例实例
   */
  static getInstance(): McpRegistry {
    if (!McpRegistry.instance) {
      McpRegistry.instance = new McpRegistry();
    }
    return McpRegistry.instance;
  }

  /**
   * 重置单例（仅用于测试）
   */
  static resetInstance(): void {
    if (McpRegistry.instance) {
      McpRegistry.instance.disconnectAll().catch(() => {});
      McpRegistry.instance = null;
    }
  }
```

### 10.4.2 服务器注册

```typescript
  /**
   * 注册 MCP 服务器
   */
  async registerServer(name: string, config: McpServerConfig): Promise<void> {
    // 检查是否已禁用
    if (config.enabled === false) {
      console.log(`[McpRegistry] 服务器 "${name}" 已禁用，跳过注册`);
      return;
    }

    // 检查重复注册
    if (this.servers.has(name)) {
      throw new Error(`MCP服务器 "${name}" 已经注册`);
    }

    // 创建客户端
    const client = new McpClient(config, name, config.healthCheck);
    const serverInfo: McpServerInfo = {
      config,
      client,
      status: McpConnectionStatus.DISCONNECTED,
      tools: [],
    };

    // 设置事件处理器
    this.setupClientEventHandlers(client, serverInfo, name);

    this.servers.set(name, serverInfo);
    this.emit('serverRegistered', name, serverInfo);

    console.log(`[McpRegistry] 已注册服务器: ${name} (${config.type})`);

    // 尝试连接
    try {
      await this.connectServer(name);
    } catch (error) {
      console.warn(`[McpRegistry] 服务器 "${name}" 连接失败:`, (error as Error).message);
    }
  }

  /**
   * 批量注册服务器
   * 并行注册多个服务器，单个失败不影响其他
   */
  async registerServers(servers: Record<string, McpServerConfig>): Promise<void> {
    const promises = Object.entries(servers).map(([name, config]) =>
      this.registerServer(name, config).catch(error => {
        console.warn(`[McpRegistry] 注册服务器 "${name}" 失败:`, (error as Error).message);
        return error;
      })
    );

    await Promise.allSettled(promises);
  }
```

### 10.4.3 连接管理

```typescript
  /**
   * 连接服务器
   */
  async connectServer(name: string): Promise<void> {
    const serverInfo = this.servers.get(name);
    if (!serverInfo) {
      throw new Error(`服务器 "${name}" 未注册`);
    }

    if (serverInfo.status === McpConnectionStatus.CONNECTED) {
      console.log(`[McpRegistry] 服务器 "${name}" 已连接`);
      return;
    }

    await serverInfo.client.connectWithRetry();
  }

  /**
   * 断开服务器连接
   */
  async disconnectServer(name: string): Promise<void> {
    const serverInfo = this.servers.get(name);
    if (!serverInfo) {
      throw new Error(`服务器 "${name}" 未注册`);
    }

    await serverInfo.client.disconnect();
  }

  /**
   * 断开所有服务器
   */
  async disconnectAll(): Promise<void> {
    const promises = Array.from(this.servers.keys()).map(name =>
      this.disconnectServer(name).catch(() => {})
    );
    await Promise.allSettled(promises);
  }

  /**
   * 移除服务器
   */
  async removeServer(name: string): Promise<void> {
    const serverInfo = this.servers.get(name);
    if (!serverInfo) {
      return;
    }

    await serverInfo.client.disconnect().catch(() => {});
    this.servers.delete(name);

    console.log(`[McpRegistry] 已移除服务器: ${name}`);
  }
```

### 10.4.4 事件处理

```typescript
  /**
   * 设置客户端事件处理器
   * 将客户端事件转发到注册中心
   */
  private setupClientEventHandlers(
    client: McpClient,
    serverInfo: McpServerInfo,
    name: string
  ): void {
    // 连接成功
    client.on('connected', (server: { name: string; version: string }) => {
      serverInfo.status = McpConnectionStatus.CONNECTED;
      serverInfo.connectedAt = new Date();
      serverInfo.serverName = server.name;
      serverInfo.serverVersion = server.version;
      serverInfo.tools = client.availableTools;
      serverInfo.lastError = undefined;
      this.emit('serverConnected', name, server);
    });

    // 断开连接
    client.on('disconnected', () => {
      serverInfo.status = McpConnectionStatus.DISCONNECTED;
      serverInfo.connectedAt = undefined;
      serverInfo.tools = [];
      this.emit('serverDisconnected', name);
    });

    // 错误
    client.on('error', (error: Error) => {
      serverInfo.status = McpConnectionStatus.ERROR;
      serverInfo.lastError = error;
      this.emit('serverError', name, error);
    });

    // 工具更新
    client.on('toolsUpdated', (tools: McpToolDefinition[]) => {
      const oldCount = serverInfo.tools.length;
      serverInfo.tools = tools;
      this.emit('toolsUpdated', name, tools, oldCount);
    });

    // 重连中
    client.on('reconnecting', (attempt: number) => {
      serverInfo.status = McpConnectionStatus.CONNECTING;
      console.log(`[McpRegistry] 服务器 "${name}" 正在重连 (第 ${attempt} 次)`);
    });

    // 重连成功
    client.on('reconnected', () => {
      console.log(`[McpRegistry] 服务器 "${name}" 重连成功`);
    });

    // 重连失败
    client.on('reconnectFailed', () => {
      serverInfo.status = McpConnectionStatus.ERROR;
      console.error(`[McpRegistry] 服务器 "${name}" 重连失败`);
    });
  }
```

### 10.4.5 工具发现（冲突处理）

```typescript
  /**
   * 获取所有可用工具（包含冲突处理）
   * 
   * 工具命名策略：
   * - 无冲突: toolName
   * - 有冲突: serverName__toolName
   * 
   * 示例：
   * - github 服务器有 create_issue
   * - gitlab 服务器也有 create_issue
   * 结果：
   * - github__create_issue
   * - gitlab__create_issue
   */
  async getAvailableTools(): Promise<Tool[]> {
    const tools: Tool[] = [];
    const nameConflicts = new Map<string, number>();

    // 第一遍：检测冲突
    for (const [, serverInfo] of this.servers) {
      if (serverInfo.status === McpConnectionStatus.CONNECTED) {
        for (const mcpTool of serverInfo.tools) {
          const count = nameConflicts.get(mcpTool.name) || 0;
          nameConflicts.set(mcpTool.name, count + 1);
        }
      }
    }

    // 第二遍：创建工具（冲突时添加前缀）
    for (const [serverName, serverInfo] of this.servers) {
      if (serverInfo.status === McpConnectionStatus.CONNECTED) {
        for (const mcpTool of serverInfo.tools) {
          const hasConflict = (nameConflicts.get(mcpTool.name) || 0) > 1;
          const toolName = hasConflict
            ? `${serverName}__${mcpTool.name}`  // 冲突时: github__create_issue
            : mcpTool.name;                     // 无冲突: create_issue

          try {
            const tool = createMcpTool(
              serverInfo.client,
              serverName,
              mcpTool,
              toolName
            );
            tools.push(tool);
          } catch (error) {
            console.warn(
              `[McpRegistry] 创建工具 "${mcpTool.name}" 失败:`,
              (error as Error).message
            );
          }
        }
      }
    }

    return tools;
  }
```

### 10.4.6 查询接口

```typescript
  /**
   * 获取服务器信息
   */
  getServer(name: string): McpServerInfo | undefined {
    return this.servers.get(name);
  }

  /**
   * 获取所有服务器
   */
  getAllServers(): Map<string, McpServerInfo> {
    return new Map(this.servers);
  }

  /**
   * 获取统计信息
   */
  getStatistics(): McpRegistryStatistics {
    let connectedServers = 0;
    let disconnectedServers = 0;
    let errorServers = 0;
    let totalTools = 0;

    for (const serverInfo of this.servers.values()) {
      switch (serverInfo.status) {
        case McpConnectionStatus.CONNECTED:
          connectedServers++;
          totalTools += serverInfo.tools.length;
          break;
        case McpConnectionStatus.DISCONNECTED:
          disconnectedServers++;
          break;
        case McpConnectionStatus.ERROR:
          errorServers++;
          break;
      }
    }

    return {
      totalServers: this.servers.size,
      connectedServers,
      disconnectedServers,
      errorServers,
      totalTools,
    };
  }

  /**
   * 检查服务器是否存在
   */
  hasServer(name: string): boolean {
    return this.servers.has(name);
  }

  /**
   * 获取服务器状态
   */
  getServerStatus(name: string): McpConnectionStatus | undefined {
    return this.servers.get(name)?.status;
  }
}
```

---

## 10.5 JSON Schema 转 Zod 转换器

### 10.5.1 转换函数

**文件位置**：`src/mcp/createMcpTool.ts`

```typescript
/**
 * MCP Tool 转换器
 * 将 MCP 工具定义（JSON Schema）转换为 ClawdCode Tool（Zod Schema）
 * 
 * 背景：
 * - MCP 服务器使用 JSON Schema 描述工具参数
 * - ClawdCode 使用 Zod 进行参数验证
 * - 需要在运行时动态转换
 */

import { z } from 'zod';
import type {
  McpToolDefinition,
  McpClientInterface,
  JSONSchemaProperty,
} from './types.js';
import { createTool } from '../tools/createTool.js';
import { ToolKind, ToolErrorType } from '../tools/types.js';

/**
 * 将 JSON Schema 转换为 Zod Schema
 * 支持递归处理嵌套类型
 */
function convertJsonSchemaToZod(jsonSchema: JSONSchemaProperty): z.ZodSchema {
  // null 或 undefined
  if (!jsonSchema || typeof jsonSchema !== 'object') {
    return z.any();
  }

  const type = Array.isArray(jsonSchema.type) ? jsonSchema.type[0] : jsonSchema.type;

  // ===== object 类型 =====
  if (type === 'object' || jsonSchema.properties) {
    const shape: Record<string, z.ZodSchema> = {};
    const required = jsonSchema.required || [];

    if (jsonSchema.properties) {
      for (const [key, value] of Object.entries(jsonSchema.properties)) {
        if (typeof value === 'object' && value !== null) {
          let fieldSchema = convertJsonSchemaToZod(value);

          // 非必填字段标记为可选
          if (!required.includes(key)) {
            fieldSchema = fieldSchema.optional();
          }

          shape[key] = fieldSchema;
        }
      }
    }

    return z.object(shape);
  }

  // ===== array 类型 =====
  if (type === 'array') {
    if (jsonSchema.items && typeof jsonSchema.items === 'object') {
      return z.array(convertJsonSchemaToZod(jsonSchema.items));
    }
    return z.array(z.any());
  }

  // ===== string 类型 =====
  if (type === 'string') {
    // 枚举处理
    if (jsonSchema.enum && jsonSchema.enum.length > 0) {
      return z.enum(jsonSchema.enum as [string, ...string[]]);
    }

    let schema = z.string();

    // 长度限制
    if (jsonSchema.minLength !== undefined) {
      schema = schema.min(jsonSchema.minLength);
    }
    if (jsonSchema.maxLength !== undefined) {
      schema = schema.max(jsonSchema.maxLength);
    }

    // 正则模式
    if (jsonSchema.pattern) {
      try {
        schema = schema.regex(new RegExp(jsonSchema.pattern));
      } catch {
        // 忽略无效的正则
      }
    }

    return schema;
  }

  // ===== number / integer 类型 =====
  if (type === 'number' || type === 'integer') {
    let schema = z.number();

    if (jsonSchema.minimum !== undefined) {
      schema = schema.min(jsonSchema.minimum);
    }
    if (jsonSchema.maximum !== undefined) {
      schema = schema.max(jsonSchema.maximum);
    }

    return schema;
  }

  // ===== boolean 类型 =====
  if (type === 'boolean') {
    return z.boolean();
  }

  // ===== oneOf / anyOf（联合类型） =====
  if (jsonSchema.oneOf && jsonSchema.oneOf.length >= 2) {
    const schemas = jsonSchema.oneOf
      .filter((s): s is JSONSchemaProperty => typeof s === 'object' && s !== null)
      .map(s => convertJsonSchemaToZod(s));

    if (schemas.length >= 2) {
      return z.union(schemas as [z.ZodSchema, z.ZodSchema, ...z.ZodSchema[]]);
    }
  }

  if (jsonSchema.anyOf && jsonSchema.anyOf.length >= 2) {
    const schemas = jsonSchema.anyOf
      .filter((s): s is JSONSchemaProperty => typeof s === 'object' && s !== null)
      .map(s => convertJsonSchemaToZod(s));

    if (schemas.length >= 2) {
      return z.union(schemas as [z.ZodSchema, z.ZodSchema, ...z.ZodSchema[]]);
    }
  }

  // 默认 any
  return z.any();
}
```

### 10.5.2 创建 MCP 工具

```typescript
/**
 * 将 MCP 工具定义转换为 ClawdCode Tool
 */
export function createMcpTool(
  mcpClient: McpClientInterface,
  serverName: string,
  toolDef: McpToolDefinition,
  customName?: string
) {
  // 1. JSON Schema → Zod Schema
  let zodSchema: z.ZodSchema;
  try {
    zodSchema = convertJsonSchemaToZod(toolDef.inputSchema);
  } catch (error) {
    console.warn(
      `[createMcpTool] Schema 转换失败，使用降级 schema: ${toolDef.name}`,
      (error as Error).message
    );
    zodSchema = z.any();  // 降级方案：接受任意参数
  }

  // 2. 决定工具名称
  const toolName = customName || toolDef.name;

  // 3. 创建 ClawdCode Tool
  return createTool({
    name: toolName,
    displayName: `${serverName}: ${toolDef.name}`,
    kind: ToolKind.Execute,  // MCP 工具视为 Execute 类型（需要确认）
    schema: zodSchema,
    description: {
      short: toolDef.description || `MCP Tool: ${toolDef.name}`,
      long: [
        `MCP 工具，来自服务器: ${serverName}`,
        toolDef.description || '',
        '',
        '执行外部工具，需要用户确认。',
      ].filter(Boolean).join('\n'),
      important: [
        `From MCP server: ${serverName}`,
        'Executes external tools; user confirmation required',
      ],
    },
    category: 'mcp',
    tags: ['mcp', 'external', serverName],

    // 执行逻辑
    async execute(params) {
      try {
        const result = await mcpClient.callTool(toolDef.name, params);

        // 处理响应内容
        let llmContent = '';
        let displayContent = '';

        if (result.content && Array.isArray(result.content)) {
          for (const item of result.content) {
            if (item.type === 'text' && item.text) {
              llmContent += item.text;
              displayContent += item.text;
            } else if (item.type === 'image') {
              displayContent += `[图片: ${item.mimeType || 'unknown'}]\n`;
              llmContent += `[image: ${item.mimeType || 'unknown'}]\n`;
            } else if (item.type === 'resource') {
              displayContent += `[资源: ${item.uri || item.mimeType || 'unknown'}]\n`;
              llmContent += `[resource: ${item.uri || item.mimeType || 'unknown'}]\n`;
            }
          }
        }

        // 错误响应
        if (result.isError) {
          return {
            success: false,
            llmContent: llmContent || 'MCP tool execution failed',
            displayContent: `❌ ${displayContent || 'MCP工具执行失败'}`,
            error: {
              type: ToolErrorType.EXECUTION_ERROR,
              message: llmContent || 'MCP tool execution failed',
            },
          };
        }

        // 成功响应
        return {
          success: true,
          llmContent: llmContent || 'Execution succeeded',
          displayContent: `✅ MCP工具 ${toolDef.name} 执行成功\n${displayContent}`,
          metadata: {
            serverName,
            toolName: toolDef.name,
            mcpResult: result,
          },
        };
      } catch (error) {
        const errorMessage = (error as Error).message;
        return {
          success: false,
          llmContent: `MCP tool execution failed: ${errorMessage}`,
          displayContent: `❌ MCP工具执行失败: ${errorMessage}`,
          error: {
            type: ToolErrorType.EXECUTION_ERROR,
            message: errorMessage,
          },
        };
      }
    },
  });
}

/**
 * 批量创建 MCP 工具
 */
export function createMcpTools(
  mcpClient: McpClientInterface,
  serverName: string,
  toolDefs: McpToolDefinition[],
  namePrefix?: string
) {
  return toolDefs.map(toolDef => {
    const customName = namePrefix ? `${namePrefix}__${toolDef.name}` : undefined;
    return createMcpTool(mcpClient, serverName, toolDef, customName);
  });
}
```

---

## 10.6 健康监控

### 10.6.1 HealthMonitor 实现

**文件位置**：`src/mcp/HealthMonitor.ts`

```typescript
/**
 * MCP 服务器健康监控
 * 定期检查服务器状态，触发自动重连
 */

import { EventEmitter } from 'events';
import type { HealthCheckConfig, McpClientInterface } from './types.js';
import { McpConnectionStatus, DEFAULT_HEALTH_CHECK_CONFIG } from './types.js';

/**
 * 健康监控器
 * 
 * 工作原理：
 * 1. 按配置间隔定期检查连接健康
 * 2. 检查方式：尝试重新加载工具列表
 * 3. 连续失败达到阈值时触发 unhealthy 事件
 */
export class HealthMonitor extends EventEmitter {
  private checkTimer: NodeJS.Timeout | null = null;
  private consecutiveFailures = 0;
  private isRunning = false;
  private lastCheckTime: Date | null = null;
  private lastCheckResult: 'healthy' | 'unhealthy' | 'unknown' = 'unknown';

  constructor(
    private client: McpClientInterface,
    private config: HealthCheckConfig = DEFAULT_HEALTH_CHECK_CONFIG
  ) {
    super();
  }

  /**
   * 启动健康监控
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.consecutiveFailures = 0;
    this.scheduleNextCheck();

    console.log(
      `[HealthMonitor:${this.client.serverName}] 健康监控已启动`,
      `(间隔: ${this.config.intervalMs}ms, 超时: ${this.config.timeoutMs}ms)`
    );
  }

  /**
   * 停止健康监控
   */
  stop(): void {
    this.isRunning = false;
    if (this.checkTimer) {
      clearTimeout(this.checkTimer);
      this.checkTimer = null;
    }
    console.log(`[HealthMonitor:${this.client.serverName}] 健康监控已停止`);
  }

  /**
   * 获取健康状态
   */
  getStatus(): {
    isHealthy: boolean;
    consecutiveFailures: number;
    lastCheckTime: Date | null;
    lastCheckResult: 'healthy' | 'unhealthy' | 'unknown';
  } {
    return {
      isHealthy: this.consecutiveFailures < this.config.maxFailures,
      consecutiveFailures: this.consecutiveFailures,
      lastCheckTime: this.lastCheckTime,
      lastCheckResult: this.lastCheckResult,
    };
  }

  /**
   * 调度下次检查
   */
  private scheduleNextCheck(): void {
    if (!this.isRunning) {
      return;
    }

    this.checkTimer = setTimeout(async () => {
      await this.performCheck();
      this.scheduleNextCheck();  // 递归调度
    }, this.config.intervalMs);
  }

  /**
   * 执行健康检查
   */
  private async performCheck(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    // 只在连接状态下进行检查
    if (this.client.connectionStatus !== McpConnectionStatus.CONNECTED) {
      this.lastCheckResult = 'unknown';
      return;
    }

    this.lastCheckTime = new Date();

    try {
      // 使用超时包装检查
      const checkPromise = this.doHealthCheck();
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('健康检查超时')), this.config.timeoutMs);
      });

      await Promise.race([checkPromise, timeoutPromise]);

      // 检查成功
      this.consecutiveFailures = 0;
      this.lastCheckResult = 'healthy';
      this.emit('healthy');
    } catch (error) {
      // 检查失败
      this.consecutiveFailures++;
      this.lastCheckResult = 'unhealthy';

      console.warn(
        `[HealthMonitor:${this.client.serverName}] 健康检查失败`,
        `(${this.consecutiveFailures}/${this.config.maxFailures}):`,
        (error as Error).message
      );

      // 超过最大失败次数，触发不健康事件
      if (this.consecutiveFailures >= this.config.maxFailures) {
        console.error(
          `[HealthMonitor:${this.client.serverName}] 服务器不健康，连续失败 ${this.consecutiveFailures} 次`
        );
        this.emit('unhealthy', this.consecutiveFailures, error);
      }
    }
  }

  /**
   * 实际健康检查逻辑
   * 尝试重新获取工具列表作为健康检查手段
   */
  private async doHealthCheck(): Promise<void> {
    // 简单的健康检查：尝试重新加载工具列表
    // 如果能成功获取，说明连接是健康的
    await this.client.reloadTools();
  }
}
```

---

## 10.7 Slash 命令系统

### 10.7.1 命令类型定义

**文件位置**：`src/slash-commands/types.ts`

```typescript
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
```

### 10.7.2 /mcp 命令实现

**文件位置**：`src/slash-commands/mcpCommand.ts`

```typescript
/**
 * /mcp 命令 - 显示 MCP 服务器状态和工具
 */

import type { SlashCommand, SlashCommandResult } from './types.js';
import { McpRegistry, McpConnectionStatus } from '../mcp/index.js';

/**
 * 获取状态图标
 */
function getStatusEmoji(status: McpConnectionStatus): string {
  switch (status) {
    case McpConnectionStatus.CONNECTED:
      return '🟢';
    case McpConnectionStatus.CONNECTING:
      return '🟡';
    case McpConnectionStatus.ERROR:
      return '🔴';
    case McpConnectionStatus.DISCONNECTED:
    default:
      return '⚪';
  }
}

/**
 * 格式化时间
 */
function formatTime(date: Date | undefined): string {
  if (!date) return 'N/A';
  return date.toLocaleTimeString();
}

/**
 * /mcp 命令实现
 */
export const mcpCommand: SlashCommand = {
  name: 'mcp',
  description: '显示 MCP 服务器状态和可用工具',
  usage: '/mcp [tools|<server-name>]',

  async handler(args): Promise<SlashCommandResult> {
    const mcpRegistry = McpRegistry.getInstance();
    const stats = mcpRegistry.getStatistics();
    const servers = mcpRegistry.getAllServers();

    // 没有配置任何 MCP 服务器
    if (stats.totalServers === 0) {
      return {
        type: 'info',
        content: `## MCP 服务器状态

📭 **未配置任何 MCP 服务器**

要添加 MCP 服务器，请在配置文件中添加 \`mcpServers\` 配置：

\`\`\`json
// ~/.clawdcode/config.json
{
  "mcpServers": {
    "github": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "\${GITHUB_TOKEN}"
      }
    }
  }
}
\`\`\`
`,
      };
    }

    const trimmedArgs = args.trim().toLowerCase();

    // /mcp tools - 列出所有工具
    if (trimmedArgs === 'tools') {
      return await handleToolsSubcommand(mcpRegistry);
    }

    // /mcp <server-name> - 显示特定服务器详情
    if (trimmedArgs && trimmedArgs !== '') {
      const serverInfo = mcpRegistry.getServer(trimmedArgs);
      if (serverInfo) {
        return handleServerDetail(trimmedArgs, serverInfo);
      }
    }

    // 默认：显示概览
    let output = '## MCP 服务器状态\n\n';
    output += `| 指标 | 值 |\n`;
    output += `|------|----|\n`;
    output += `| 总服务器 | ${stats.totalServers} |\n`;
    output += `| 已连接 | ${stats.connectedServers} |\n`;
    output += `| 错误 | ${stats.errorServers} |\n`;
    output += `| 总工具数 | ${stats.totalTools} |\n`;
    output += '\n';

    output += '### 服务器列表\n\n';
    output += '| 状态 | 服务器 | 工具数 | 连接时间 |\n';
    output += '|------|--------|--------|----------|\n';

    for (const [name, info] of servers) {
      const emoji = getStatusEmoji(info.status);
      const toolCount = info.status === McpConnectionStatus.CONNECTED ? info.tools.length : '-';
      const connectedAt = formatTime(info.connectedAt);
      output += `| ${emoji} | ${name} | ${toolCount} | ${connectedAt} |\n`;
    }

    output += '\n---\n';
    output += '💡 **提示：** 使用 `/mcp tools` 查看所有工具，或 `/mcp <服务器名>` 查看详情\n';

    return {
      type: 'success',
      content: output,
    };
  },
};

/**
 * 处理 /mcp tools 子命令
 */
async function handleToolsSubcommand(registry: McpRegistry): Promise<SlashCommandResult> {
  const tools = await registry.getAvailableTools();

  if (tools.length === 0) {
    return {
      type: 'info',
      content: '## MCP 工具\n\n📭 **没有可用的 MCP 工具**\n\n请确保至少有一个 MCP 服务器已连接。',
    };
  }

  let output = '## MCP 可用工具\n\n';
  output += `共 **${tools.length}** 个工具可用\n\n`;
  output += '| 工具名 | 描述 | 分类 |\n';
  output += '|--------|------|------|\n';

  for (const tool of tools) {
    const description = tool.description?.short || '-';
    const category = tool.category || 'mcp';
    // 截断过长的描述
    const shortDesc = description.length > 50 ? description.slice(0, 47) + '...' : description;
    output += `| \`${tool.name}\` | ${shortDesc} | ${category} |\n`;
  }

  return {
    type: 'success',
    content: output,
  };
}

/**
 * 处理特定服务器详情
 */
function handleServerDetail(name: string, info: any): SlashCommandResult {
  const emoji = getStatusEmoji(info.status);

  let output = `## ${emoji} MCP 服务器: ${name}\n\n`;

  output += '### 基本信息\n\n';
  output += `| 属性 | 值 |\n`;
  output += `|------|----|\n`;
  output += `| 状态 | ${info.status} |\n`;
  output += `| 类型 | ${info.config.type} |\n`;

  if (info.serverName) {
    output += `| 服务器名 | ${info.serverName} |\n`;
  }
  if (info.serverVersion) {
    output += `| 版本 | ${info.serverVersion} |\n`;
  }
  if (info.connectedAt) {
    output += `| 连接时间 | ${info.connectedAt.toLocaleString()} |\n`;
  }
  if (info.lastError) {
    output += `| 最后错误 | ${info.lastError.message} |\n`;
  }

  output += '\n### 配置\n\n';
  output += '```json\n';
  output += JSON.stringify(
    {
      type: info.config.type,
      command: info.config.command,
      args: info.config.args,
      url: info.config.url,
    },
    null,
    2
  );
  output += '\n```\n';

  if (info.status === McpConnectionStatus.CONNECTED && info.tools.length > 0) {
    output += '\n### 可用工具\n\n';
    for (const tool of info.tools) {
      output += `- \`${tool.name}\`: ${tool.description || '-'}\n`;
    }
  }

  return {
    type: 'success',
    content: output,
  };
}
```

### 10.7.3 命令注册

**文件位置**：`src/slash-commands/index.ts`

```typescript
/**
 * Slash 命令模块
 */

export * from './types.js';
export { mcpCommand } from './mcpCommand.js';

// 内置命令注册表
import type { SlashCommand } from './types.js';
import { mcpCommand } from './mcpCommand.js';

/**
 * 内置 slash 命令
 */
export const builtinCommands: SlashCommand[] = [
  mcpCommand,
];

/**
 * 获取命令（支持别名）
 */
export function getCommand(name: string): SlashCommand | undefined {
  const normalizedName = name.toLowerCase();
  return builtinCommands.find(
    cmd => cmd.name === normalizedName || cmd.aliases?.includes(normalizedName)
  );
}

/**
 * 检查是否是 slash 命令
 */
export function isSlashCommand(input: string): boolean {
  return input.trim().startsWith('/');
}

/**
 * 解析 slash 命令
 */
export function parseSlashCommand(input: string): { name: string; args: string } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) {
    return null;
  }

  const withoutSlash = trimmed.slice(1);
  const spaceIndex = withoutSlash.indexOf(' ');

  if (spaceIndex === -1) {
    return { name: withoutSlash, args: '' };
  }

  return {
    name: withoutSlash.slice(0, spaceIndex),
    args: withoutSlash.slice(spaceIndex + 1),
  };
}
```

---

## 10.8 配置集成

### 10.8.1 MCP 配置 Schema

**文件位置**：`src/config/types.ts`（添加 MCP 相关部分）

```typescript
/**
 * MCP 服务器配置 Schema
 */
export const McpServerConfigSchema = z.object({
  type: z.enum(['stdio', 'sse', 'http']),
  
  // stdio 配置
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  cwd: z.string().optional(),
  
  // sse/http 配置
  url: z.string().optional(),
  headers: z.record(z.string()).optional(),
  
  // 其他配置
  enabled: z.boolean().optional(),
  timeout: z.number().optional(),
  description: z.string().optional(),
  
  // 健康检查配置
  healthCheck: z.object({
    enabled: z.boolean(),
    intervalMs: z.number(),
    timeoutMs: z.number(),
    maxFailures: z.number(),
  }).optional(),
});

/**
 * 完整配置 Schema (config.json)
 */
export const ConfigSchema = z.object({
  // ... 其他配置 ...
  
  // MCP 服务器配置
  mcpServers: z.record(McpServerConfigSchema).optional(),
  
  // MCP 是否启用
  mcpEnabled: z.boolean().optional(),
});

/**
 * 默认配置
 */
export const DEFAULT_CONFIG: Config = {
  // ... 其他默认值 ...
  mcpServers: {},
  mcpEnabled: true,
};
```

### 10.8.2 配置示例

```json
// ~/.clawdcode/config.json
{
  "default": {
    "model": "gpt-4",
    "apiKey": "${OPENAI_API_KEY}"
  },
  "mcpEnabled": true,
  "mcpServers": {
    "github": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      },
      "description": "GitHub MCP Server",
      "healthCheck": {
        "enabled": true,
        "intervalMs": 30000,
        "timeoutMs": 5000,
        "maxFailures": 3
      }
    },
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"],
      "description": "Filesystem MCP Server"
    },
    "remote-api": {
      "type": "sse",
      "url": "https://mcp.example.com/sse",
      "headers": {
        "Authorization": "Bearer ${API_TOKEN}"
      },
      "description": "Remote MCP API"
    }
  }
}
```

---

## 10.9 模块导出

**文件位置**：`src/mcp/index.ts`

```typescript
/**
 * MCP 协议模块
 * Model Context Protocol - Anthropic 推出的 AI 工具扩展协议
 */

// 类型导出
export * from './types.js';

// 核心组件
export { McpClient } from './McpClient.js';
export { McpRegistry } from './McpRegistry.js';
export { HealthMonitor } from './HealthMonitor.js';

// 工具转换
export { createMcpTool, createMcpTools } from './createMcpTool.js';
```

---

## 10.10 MCP 工具集成到 Agent

### 10.10.1 在 Agent 中注册 MCP 工具

当 Agent 初始化时，需要将 MCP 工具注册到 ToolRegistry：

```typescript
// src/agent/Agent.ts（第 11 章将完整集成）

import { McpRegistry } from '../mcp/index.js';

class Agent {
  private async initializeMcpTools(): Promise<void> {
    const mcpRegistry = McpRegistry.getInstance();
    const mcpTools = await mcpRegistry.getAvailableTools();
    
    // 将 MCP 工具注册到 ToolRegistry
    for (const tool of mcpTools) {
      this.toolRegistry.register(tool);
    }
    
    console.log(`[Agent] 已注册 ${mcpTools.length} 个 MCP 工具`);
  }
}
```

### 10.10.2 MCP 工具在 Agentic Loop 中的执行

```
用户输入 → LLM 决策 → 工具调用请求
                         ↓
              ┌─────────────────────┐
              │   ToolRegistry      │
              │   ├── Read（内置） │
              │   ├── Edit（内置） │
              │   ├── github__create_issue（MCP）│
              │   └── search_code（MCP）│
              └─────────────────────┘
                         ↓
              ExecutionPipeline（七阶段）
                         ↓
              权限检查 → 确认 → 执行
                         ↓
              MCP 工具调用：mcpClient.callTool()
                         ↓
              结果返回给 LLM → 继续循环
```

---

## 10.11 本章小结

### 完成的内容

| 文件 | 内容 |
|------|------|
| `src/mcp/types.ts` | MCP 类型定义（状态、配置、工具、事件） |
| `src/mcp/McpClient.ts` | MCP 客户端（连接、重试、工具调用） |
| `src/mcp/McpRegistry.ts` | 服务器注册中心（单例、工具发现、冲突处理） |
| `src/mcp/createMcpTool.ts` | JSON Schema → Zod 转换器 |
| `src/mcp/HealthMonitor.ts` | 健康监控（定期检查、自动重连） |
| `src/slash-commands/*.ts` | Slash 命令系统 + `/mcp` 命令 |
| `src/config/types.ts` | MCP 配置 Schema |

### 技术亮点

| 亮点 | 说明 |
|------|------|
| **标准协议** | 遵循 MCP 规范，可复用社区工具 |
| **多传输支持** | stdio（本地进程）、SSE、HTTP |
| **自动重连** | 指数退避策略，永久错误识别 |
| **健康监控** | 定期检查，自动触发重连 |
| **工具名冲突处理** | 自动添加服务器前缀 |
| **Schema 转换** | JSON Schema → Zod 运行时转换 |

### MCP 架构图

```
┌──────────────────────────────────────────────────────────────┐
│                        ClawdCode                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                     McpRegistry（单例）                  │ │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐                 │ │
│  │  │ github  │  │ slack   │  │ custom  │  ...            │ │
│  │  │McpClient│  │McpClient│  │McpClient│                 │ │
│  │  └────┬────┘  └────┬────┘  └────┬────┘                 │ │
│  └───────┼────────────┼────────────┼──────────────────────┘ │
│          │            │            │                         │
└──────────┼────────────┼────────────┼─────────────────────────┘
           │            │            │
           ▼            ▼            ▼
    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
    │ MCP Server  │ │ MCP Server  │ │ MCP Server  │
    │   (stdio)   │ │   (sse)     │ │   (http)    │
    └─────────────┘ └─────────────┘ └─────────────┘
```

---

## 10.12 本章遗留项

::: info 以下功能将在后续章节实现
根据项目规划，部分高级功能需要其他模块支持。
:::

| 功能 | 说明 | 计划章节 |
|------|------|----------|
| **`loadMcpConfigFromCli`** | 从 CLI 参数 `--mcp-config` 加载临时 MCP 配置 | 第 11 章 |
| **`--mcp-config` CLI 参数** | CLI 传递临时 MCP 配置文件路径 | 第 11 章 |
| **Slash 命令集成到 UI** | 在 UI 中处理 `/mcp` 等 slash 命令 | 第 12 章 |
| **OAuthProvider** | OAuth 2.0 认证流程（需要浏览器交互） | 可选优化 |
| **`src/mcp/auth/` 目录** | OAuth 认证相关文件 | 可选优化 |

### 当前状态

本章实现的 MCP 模块是**独立完整**的：

- ✅ McpClient MCP 客户端
- ✅ McpRegistry MCP 注册中心（单例）
- ✅ HealthMonitor 健康监控
- ✅ createMcpTool JSON Schema → Zod 转换器
- ✅ /mcp Slash 命令
- ✅ ConfigManager MCP 配置支持
- ✅ 多传输支持（stdio/SSE/HTTP）
- ✅ 自动重连 + 指数退避
- ✅ 工具名冲突处理

### 依赖安装

使用 MCP 功能需要安装官方 SDK：

```bash
bun add @modelcontextprotocol/sdk
```

---

## 下一章预告

在 **第十一章** 中，我们将：
1. 引入 Zustand 状态管理
2. 实现双文件配置（用户配置 + 运行时配置）
3. 完整集成所有模块（Agent + ContextManager + UI + MCP）
4. 实现 SSOT（Single Source of Truth）架构

这将是完成整个 ClawdCode 的关键集成章节！

::: tip 后续章节规划
- **第 11 章**：完整集成（Zustand Store、ClawdInterface 集成、SSOT 架构）
- **第 12 章**：进阶功能（HookManager、诊断命令、Subagent、IDE 集成）
:::
