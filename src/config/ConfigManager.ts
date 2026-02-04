/**
 * ConfigManager - 配置管理器（双文件配置架构）
 * 
 * 文件结构：
 * - config.json: 基础配置（API、模型、UI、MCP）
 * - settings.json: 行为配置（权限、Hooks、环境变量）
 * - settings.local.json: 本地行为配置（不提交到 Git）
 * 
 * 配置加载优先级（从低到高）：
 * 1. 默认配置
 * 2. 用户 config.json (~/.clawdcode/config.json)
 * 3. 用户 settings.json (~/.clawdcode/settings.json)
 * 4. 项目 config.json (./.clawdcode/config.json)
 * 5. 项目 settings.json (./.clawdcode/settings.json)
 * 6. 本地 settings.local.json (./.clawdcode/settings.local.json)
 * 7. 环境变量
 * 8. CLI 参数
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  Config,
  ConfigSchema,
  DEFAULT_CONFIG,
  ModelConfig,
  type PermissionConfig,
  type McpServerConfig,
} from './types.js';

export class ConfigManager {
  private static instance: ConfigManager;
  private config: Config;
  private configPaths: string[] = [];

  private constructor() {
    this.config = { ...DEFAULT_CONFIG };
  }

  /**
   * 获取单例实例
   */
  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * 初始化配置（加载所有配置源）
   * @returns 加载后的配置
   */
  async initialize(projectPath?: string): Promise<Config> {
    // 1. 从默认配置开始
    this.config = { ...DEFAULT_CONFIG };

    const userConfigDir = this.getUserConfigDir();
    const projectDir = projectPath || process.cwd();
    const projectConfigDir = path.join(projectDir, '.clawdcode');

    // 2. 加载用户 config.json
    await this.loadConfigFile(path.join(userConfigDir, 'config.json'));

    // 3. 加载用户 settings.json
    await this.loadConfigFile(path.join(userConfigDir, 'settings.json'));

    // 4. 加载项目 config.json
    await this.loadConfigFile(path.join(projectConfigDir, 'config.json'));

    // 5. 加载项目 settings.json
    await this.loadConfigFile(path.join(projectConfigDir, 'settings.json'));

    // 6. 加载本地 settings.local.json（不提交到 Git）
    await this.loadConfigFile(path.join(projectConfigDir, 'settings.local.json'));

    // 7. 应用环境变量
    this.applyEnvironmentVariables();

    return this.config;
  }

  /**
   * 获取用户配置目录路径
   */
  getUserConfigDir(): string {
    return path.join(os.homedir(), '.clawdcode');
  }

  /**
   * 获取用户配置文件路径
   */
  getUserConfigPath(): string {
    return path.join(this.getUserConfigDir(), 'config.json');
  }

  /**
   * 加载配置文件
   */
  private async loadConfigFile(configPath: string): Promise<boolean> {
    try {
      if (!fs.existsSync(configPath)) {
        return false;
      }

      const content = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(content);
      const validated = ConfigSchema.partial().parse(parsed);

      // 深度合并配置
      this.config = this.mergeConfig(this.config, validated);
      this.configPaths.push(configPath);

      return true;
    } catch (error) {
      console.warn(`Warning: Failed to load config from ${configPath}:`, (error as Error).message);
      return false;
    }
  }


  /**
   * 应用环境变量
   */
  private applyEnvironmentVariables(): void {
    this.config.default = this.config.default || {};
    const defaultConfig = this.config.default;

    if (process.env.OPENAI_API_KEY) {
      defaultConfig.apiKey = process.env.OPENAI_API_KEY;
    }
    if (process.env.OPENAI_BASE_URL) {
      defaultConfig.baseURL = process.env.OPENAI_BASE_URL;
    }
    if (process.env.OPENAI_MODEL) {
      defaultConfig.model = process.env.OPENAI_MODEL;
    }
  }

  /**
   * 应用 CLI 参数（最高优先级）
   */
  applyCliArgs(args: Partial<ModelConfig>): void {
    this.config.default = this.config.default || {};
    const defaultConfig = this.config.default;

    if (args.apiKey) {
      defaultConfig.apiKey = args.apiKey;
    }
    if (args.baseURL) {
      defaultConfig.baseURL = args.baseURL;
    }
    if (args.model) {
      defaultConfig.model = args.model;
    }
  }

  /**
   * 深度合并配置
   */
  private mergeConfig(base: Config, override: Partial<Config>): Config {
    const merged: Config = {
      ...base,
    };

    if (override.default || base.default) {
      merged.default = {
        ...base.default,
        ...override.default,
      };
    }

    if (override.models) {
      merged.models = override.models;
    }

    if (override.ui || base.ui) {
      merged.ui = {
        ...base.ui,
        ...override.ui,
      };
    }

    // 合并权限配置（数组合并而非覆盖）
    if (override.permissions || base.permissions) {
      merged.permissions = {
        allow: [
          ...(base.permissions?.allow || []),
          ...(override.permissions?.allow || []),
        ],
        deny: [
          ...(base.permissions?.deny || []),
          ...(override.permissions?.deny || []),
        ],
        ask: [
          ...(base.permissions?.ask || []),
          ...(override.permissions?.ask || []),
        ],
      };
    }

    // 其他字段使用后者覆盖
    if (override.defaultPermissionMode) {
      merged.defaultPermissionMode = override.defaultPermissionMode;
    }
    if (override.toolWhitelist) {
      merged.toolWhitelist = override.toolWhitelist;
    }
    if (override.toolBlacklist) {
      merged.toolBlacklist = override.toolBlacklist;
    }

    // 合并 MCP 服务器配置（深度合并）
    if (override.mcpServers || base.mcpServers) {
      merged.mcpServers = {
        ...(base.mcpServers || {}),
        ...(override.mcpServers || {}),
      };
    }

    // MCP 启用状态
    if (override.mcpEnabled !== undefined) {
      merged.mcpEnabled = override.mcpEnabled;
    }

    return merged;
  }

  /**
   * 获取完整配置
   */
  getConfig(): Config {
    return this.config;
  }

  /**
   * 获取默认模型配置
   */
  getDefaultModel(): ModelConfig {
    return this.config.default ?? {};
  }

  /**
   * 获取已加载的配置文件路径
   */
  getLoadedConfigPaths(): string[] {
    return [...this.configPaths];
  }

  /**
   * 获取权限配置
   */
  getPermissionConfig(): PermissionConfig {
    return this.config.permissions || { allow: [], deny: [], ask: [] };
  }

  /**
   * 获取默认权限模式
   */
  getDefaultPermissionMode(): string {
    return this.config.defaultPermissionMode || 'default';
  }

  /**
   * 获取 MCP 服务器配置
   */
  getMcpServers(): Record<string, McpServerConfig> {
    return this.config.mcpServers || {};
  }

  /**
   * 检查 MCP 是否启用
   */
  isMcpEnabled(): boolean {
    return this.config.mcpEnabled !== false;
  }

  /**
   * 创建默认配置文件
   */
  async createDefaultConfig(): Promise<string> {
    const configDir = this.getUserConfigDir();
    const configPath = this.getUserConfigPath();

    // 创建目录
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // 写入默认配置（不包含敏感信息）
    const defaultConfig: Config = {
      default: {
        model: 'gpt-4',
        // apiKey: 'your-api-key',  // 需要用户自己填写
        // baseURL: 'https://api.openai.com/v1',
      },
      ui: {
        theme: 'dark',
      },
      mcpEnabled: true,
      mcpServers: {
        // 示例 MCP 服务器配置（已注释）
        // github: {
        //   type: 'stdio',
        //   command: 'npx',
        //   args: ['-y', '@modelcontextprotocol/server-github'],
        //   env: { GITHUB_TOKEN: '${GITHUB_TOKEN}' },
        // },
      },
    };

    const content = JSON.stringify(defaultConfig, null, 2);
    fs.writeFileSync(configPath, content, 'utf-8');

    return configPath;
  }

  /**
   * 验证配置是否完整（有 API Key）
   */
  isConfigValid(): boolean {
    return !!this.config.default?.apiKey;
  }
}

// 导出单例
export const configManager = ConfigManager.getInstance();
