/**
 * CustomCommandRegistry - 自定义命令注册中心
 * 
 * 管理自定义命令的发现、加载和执行
 */

import type {
  CustomCommand,
  CustomCommandExecutionContext,
  CustomCommandDiscoveryResult,
} from '../types.js';
import { CustomCommandLoader } from './CustomCommandLoader.js';
import { CustomCommandExecutor } from './CustomCommandExecutor.js';

/**
 * 自定义命令注册中心
 */
export class CustomCommandRegistry {
  private static instance: CustomCommandRegistry;
  
  private commands: Map<string, CustomCommand> = new Map();
  private loader = new CustomCommandLoader();
  private executor = new CustomCommandExecutor();
  private initialized = false;

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): CustomCommandRegistry {
    if (!CustomCommandRegistry.instance) {
      CustomCommandRegistry.instance = new CustomCommandRegistry();
    }
    return CustomCommandRegistry.instance;
  }

  /**
   * 初始化：发现并注册所有自定义命令
   */
  async initialize(workspaceRoot: string): Promise<CustomCommandDiscoveryResult> {
    const result = await this.loader.discover(workspaceRoot);

    // 清空现有命令
    this.commands.clear();

    // 按顺序注册（后面的覆盖前面的同名命令）
    for (const cmd of result.commands) {
      const key = this.getCommandKey(cmd.name, cmd.namespace);
      this.commands.set(key, cmd);
    }

    this.initialized = true;
    return result;
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 获取命令
   */
  getCommand(name: string, namespace?: string): CustomCommand | undefined {
    // 先尝试带命名空间
    if (namespace) {
      const key = this.getCommandKey(name, namespace);
      const cmd = this.commands.get(key);
      if (cmd) return cmd;
    }

    // 再尝试不带命名空间
    return this.commands.get(name);
  }

  /**
   * 获取所有命令
   */
  getAllCommands(): CustomCommand[] {
    return Array.from(this.commands.values());
  }

  /**
   * 获取可被 AI 调用的命令
   * 
   * 条件：
   * - 有 description
   * - 没有设置 disableModelInvocation: true
   */
  getModelInvocableCommands(): CustomCommand[] {
    return this.getAllCommands().filter(
      (cmd) => cmd.config.description && !cmd.config.disableModelInvocation
    );
  }

  /**
   * 执行命令
   */
  async executeCommand(
    name: string,
    context: CustomCommandExecutionContext,
    namespace?: string
  ): Promise<string | null> {
    const cmd = this.getCommand(name, namespace);
    if (!cmd) return null;

    return this.executor.execute(cmd, context);
  }

  /**
   * 获取命令标签
   * 
   * 项目命令: "(project)" 或 "(project:namespace)"
   * 用户命令: "(user)" 或 "(user:namespace)"
   */
  getCommandLabel(cmd: CustomCommand): string {
    const base = cmd.source === 'project' ? 'project' : 'user';
    return cmd.namespace ? `(${base}:${cmd.namespace})` : `(${base})`;
  }

  /**
   * 生成命令键
   */
  private getCommandKey(name: string, namespace?: string): string {
    return namespace ? `${namespace}/${name}` : name;
  }

  /**
   * 重新加载命令
   */
  async reload(workspaceRoot: string): Promise<CustomCommandDiscoveryResult> {
    return this.initialize(workspaceRoot);
  }

  /**
   * 获取命令数量
   */
  get size(): number {
    return this.commands.size;
  }
}
