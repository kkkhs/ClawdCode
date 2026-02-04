/**
 * MCP 服务器健康监控
 * 定期检查服务器状态，触发自动重连
 */

import { EventEmitter } from 'events';
import type { HealthCheckConfig, McpClientInterface } from './types.js';
import { McpConnectionStatus, DEFAULT_HEALTH_CHECK_CONFIG } from './types.js';
import { createDebugLogger } from '../utils/debug.js';

/**
 * 健康监控器
 */
export class HealthMonitor extends EventEmitter {
  private checkTimer: NodeJS.Timeout | null = null;
  private consecutiveFailures = 0;
  private isRunning = false;
  private lastCheckTime: Date | null = null;
  private lastCheckResult: 'healthy' | 'unhealthy' | 'unknown' = 'unknown';
  private debug: ReturnType<typeof createDebugLogger>;

  constructor(
    private client: McpClientInterface,
    private config: HealthCheckConfig = DEFAULT_HEALTH_CHECK_CONFIG
  ) {
    super();
    this.debug = createDebugLogger(`HealthMonitor:${client.serverName}`);
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

    this.debug.log(
      `健康监控已启动`,
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
    this.debug.log(`健康监控已停止`);
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
      this.scheduleNextCheck();
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

      this.debug.warn(
        `健康检查失败`,
        `(${this.consecutiveFailures}/${this.config.maxFailures}):`,
        (error as Error).message
      );

      // 超过最大失败次数，触发不健康事件
      if (this.consecutiveFailures >= this.config.maxFailures) {
        this.debug.error(
          `服务器不健康，连续失败 ${this.consecutiveFailures} 次`
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
