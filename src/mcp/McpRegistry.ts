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

  /**
   * 注册 MCP 服务器
   */
  async registerServer(name: string, config: McpServerConfig): Promise<void> {
    // 检查是否已禁用
    if (config.enabled === false) {
      console.log(`[McpRegistry] 服务器 "${name}" 已禁用，跳过注册`);
      return;
    }

    if (this.servers.has(name)) {
      throw new Error(`MCP服务器 "${name}" 已经注册`);
    }

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

  /**
   * 设置客户端事件处理器
   */
  private setupClientEventHandlers(
    client: McpClient,
    serverInfo: McpServerInfo,
    name: string
  ): void {
    client.on('connected', (server: { name: string; version: string }) => {
      serverInfo.status = McpConnectionStatus.CONNECTED;
      serverInfo.connectedAt = new Date();
      serverInfo.serverName = server.name;
      serverInfo.serverVersion = server.version;
      serverInfo.tools = client.availableTools;
      serverInfo.lastError = undefined;
      this.emit('serverConnected', name, server);
    });

    client.on('disconnected', () => {
      serverInfo.status = McpConnectionStatus.DISCONNECTED;
      serverInfo.connectedAt = undefined;
      serverInfo.tools = [];
      this.emit('serverDisconnected', name);
    });

    client.on('error', (error: Error) => {
      serverInfo.status = McpConnectionStatus.ERROR;
      serverInfo.lastError = error;
      this.emit('serverError', name, error);
    });

    client.on('toolsUpdated', (tools: McpToolDefinition[]) => {
      const oldCount = serverInfo.tools.length;
      serverInfo.tools = tools;
      this.emit('toolsUpdated', name, tools, oldCount);
    });

    client.on('reconnecting', (attempt: number) => {
      serverInfo.status = McpConnectionStatus.CONNECTING;
      console.log(`[McpRegistry] 服务器 "${name}" 正在重连 (第 ${attempt} 次)`);
    });

    client.on('reconnected', () => {
      console.log(`[McpRegistry] 服务器 "${name}" 重连成功`);
    });

    client.on('reconnectFailed', () => {
      serverInfo.status = McpConnectionStatus.ERROR;
      console.error(`[McpRegistry] 服务器 "${name}" 重连失败`);
    });
  }

  /**
   * 获取所有可用工具（包含冲突处理）
   *
   * 工具命名策略：
   * - 无冲突: toolName
   * - 有冲突: serverName__toolName
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
