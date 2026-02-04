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

  // 认证错误（需要用户介入）
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

  // 默认允许重试
  return { type: ErrorType.UNKNOWN, isRetryable: true, originalError: error };
}

/**
 * MCP 客户端实现
 */
export class McpClient extends EventEmitter implements McpClientInterface {
  private status: McpConnectionStatus = McpConnectionStatus.DISCONNECTED;
  private sdkClient: any = null;  // @modelcontextprotocol/sdk Client
  private tools = new Map<string, McpToolDefinition>();
  private serverInfo: { name: string; version: string } | null = null;

  // 重连配置
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isManualDisconnect = false;

  // 健康监控
  private healthMonitor: HealthMonitor | null = null;

  // 服务器名称（用于日志）
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
        // 触发重连
        if (this.status === McpConnectionStatus.CONNECTED) {
          this.handleUnexpectedClose();
        }
      });
    }
  }

  /**
   * 获取连接状态
   */
  get connectionStatus(): McpConnectionStatus {
    return this.status;
  }

  /**
   * 获取可用工具列表
   */
  get availableTools(): McpToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * 设置连接状态
   */
  private setStatus(status: McpConnectionStatus): void {
    const oldStatus = this.status;
    this.status = status;
    if (oldStatus !== status) {
      this.emit('statusChanged', status, oldStatus);
    }
  }

  /**
   * 连接到 MCP 服务器（带重试）
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
        this.reconnectAttempts = 0;
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

        // 指数退避重试
        if (attempt < maxRetries) {
          const delay = initialDelay * Math.pow(2, attempt - 1);
          console.log(`[McpClient:${this.serverName}] ${delay}ms 后重试...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('连接失败');
  }

  /**
   * 实际连接逻辑
   */
  private async doConnect(): Promise<void> {
    try {
      this.setStatus(McpConnectionStatus.CONNECTING);

      // 动态导入 MCP SDK
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

  /**
   * 创建传输层
   */
  private async createTransport(): Promise<any> {
    const { type, command, args, env, cwd, url, headers } = this.config;

    if (type === 'stdio') {
      if (!command) {
        throw new Error('stdio 传输需要 command 参数');
      }

      const { StdioClientTransport } = await import(
        '@modelcontextprotocol/sdk/client/stdio.js'
      );

      // 过滤掉 undefined 的环境变量
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
        stderr: 'ignore',
      });
    }

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

    if (type === 'http') {
      if (!url) {
        throw new Error('http 传输需要 url 参数');
      }

      // HTTP Streamable 传输（如果 SDK 支持）
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

      if (oldCount !== this.tools.size) {
        this.emit('toolsUpdated', this.availableTools);
      }
    } catch (error) {
      console.error(`[McpClient:${this.serverName}] 加载工具列表失败:`, error);
      throw error;
    }
  }

  /**
   * 重新加载工具列表
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

  /**
   * 断开连接
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
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.reconnectAttempts >= DEFAULT_CONNECTION_CONFIG.maxReconnectAttempts) {
      console.error(`[McpClient:${this.serverName}] 达到最大重连次数，放弃重连`);
      this.emit('reconnectFailed');
      return;
    }

    // 指数退避：1s, 2s, 4s, 8s, 16s（最大30s）
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
          this.scheduleReconnect();
        } else {
          console.error(`[McpClient:${this.serverName}] 检测到永久性错误，停止重连`);
          this.emit('reconnectFailed');
        }
      }
    }, delay);
  }
}
