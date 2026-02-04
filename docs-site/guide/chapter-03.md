# 第三章：CLI 入口与启动流程

> **学习目标**：构建完整的 CLI 架构，包括命令解析、中间件机制、版本检查和配置管理
> 
> **预计阅读时间**：45 分钟
> 
> **实践时间**：60 分钟
> 
> **前置要求**：已完成第二章的代码实现

---

## 3.1 CLI 架构概览

### 3.1.1 完整启动流程

当用户在终端输入 `clawdcode` 命令时，会触发以下初始化流程：

```
用户输入命令
      ↓
早期解析 --debug 参数（确保日志可用）
      ↓
启动版本检查（并行执行，不阻塞）
      ↓
创建 yargs CLI 实例
      ↓
注册全局选项和命令
      ↓
解析所有参数
      ↓
执行中间件链
      ↓
┌──────────────────────────────────────────┐
│ validatePermissions → loadConfiguration  │
│         → validateOutput                 │
└──────────────────────────────────────────┘
      ↓
执行默认命令
      ↓
等待版本检查 → 有更新？→ 显示 UpdatePrompt
      ↓
启动 React UI 主界面
```

### 3.1.2 本章文件结构

我们将创建/修改以下文件：

```
src/
├── main.tsx                    # 【修改】CLI 主入口
├── cli/
│   ├── types.ts                # 【新建】CLI 类型定义
│   ├── config.ts               # 【新建】yargs 选项配置
│   ├── middleware.ts           # 【新建】中间件函数
│   └── index.ts                # 【新建】模块导出
├── config/
│   ├── types.ts                # 【修改】配置类型（第 2 章创建）
│   ├── ConfigManager.ts        # 【新建】配置管理器
│   └── index.ts                # 【新建】模块导出
├── services/
│   ├── VersionChecker.ts       # 【新建】版本检查服务
│   └── index.ts                # 【新建】模块导出
└── ui/
    ├── App.tsx                 # 【修改】添加版本检查支持
    └── components/
        ├── UpdatePrompt.tsx    # 【新建】更新提示组件
        └── index.ts            # 【修改】添加导出
```

---

## 3.2 CLI 类型定义

### 3.2.1 创建类型文件

**文件位置**：`src/cli/types.ts`

```typescript
/**
 * CLI 类型定义
 * 
 * 定义所有 CLI 相关的类型，包括：
 * - 命令行参数接口
 * - 中间件函数类型
 * - App 组件属性
 */

import type { Arguments } from 'yargs';

/**
 * 权限模式
 * 
 * - default: 默认模式，写操作需要确认
 * - autoEdit: 自动确认文件编辑，其他写操作仍需确认
 * - yolo: 自动确认所有操作（危险！）
 */
export type PermissionMode = 'default' | 'autoEdit' | 'yolo';

/**
 * CLI 参数接口
 * 
 * 继承 yargs 的 Arguments 类型，添加我们的自定义参数
 */
export interface CliArguments extends Arguments {
  // ========== 调试选项 ==========
  debug?: boolean;

  // ========== AI 选项 ==========
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  maxTurns?: number;

  // ========== 安全选项 ==========
  permissionMode?: PermissionMode;
  yolo?: boolean;                    // --yolo 快捷方式
  allowedTools?: string[];           // 工具白名单
  disallowedTools?: string[];        // 工具黑名单

  // ========== 会话选项 ==========
  continue?: boolean;                // 继续上次会话
  resume?: string | boolean;         // 恢复指定会话

  // ========== 输出选项 ==========
  print?: boolean;                   // 非交互模式
  outputFormat?: 'text' | 'json';

  // ========== 命令相关 ==========
  init?: boolean;                    // 创建配置文件

  // ========== 位置参数 ==========
  message?: string;                  // 初始消息
}

/**
 * 中间件函数类型
 * 
 * yargs 中间件在命令执行前运行，用于：
 * - 验证参数
 * - 加载配置
 * - 设置全局状态
 */
export type MiddlewareFunction<T = CliArguments> = (
  argv: T
) => void | Promise<void>;

/**
 * App Props - 传递给 UI 组件的属性
 */
export interface AppProps {
  apiKey: string;
  baseURL?: string;
  model?: string;
  initialMessage?: string;
  debug?: boolean;
  permissionMode?: PermissionMode;
  resumeSessionId?: string;
}
```

**代码说明**：

| 类型 | 说明 |
|------|------|
| `PermissionMode` | 三种权限模式，平衡安全和效率 |
| `CliArguments` | 所有 CLI 参数的完整定义 |
| `MiddlewareFunction` | 中间件函数签名 |
| `AppProps` | 传递给 React 组件的属性 |

---

## 3.3 yargs 选项配置

### 3.3.1 创建配置文件

**文件位置**：`src/cli/config.ts`

```typescript
/**
 * CLI 配置 - yargs 选项定义
 * 
 * 所有命令行选项在此集中定义
 * 使用分组让帮助输出更清晰
 */

import type { Options } from 'yargs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * 同步读取 package.json 版本
 * 
 * 尝试多个可能的路径以适应不同环境：
 * - 打包后: dist/ -> root
 * - 开发环境: src/cli/ -> root
 * 
 * 注意：不使用 process.cwd()，因为用户运行 clawdcode 时
 * 工作目录是他们的项目目录，不是 clawdcode 安装目录
 */
function readVersionSync(): string {
  // 获取当前文件的目录
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  
  // 可能的 package.json 路径
  const possiblePaths = [
    path.resolve(__dirname, '../package.json'),     // 打包后: dist/ -> root
    path.resolve(__dirname, '../../package.json'),  // 开发环境: src/cli/ -> root
  ];

  for (const pkgPath of possiblePaths) {
    try {
      const content = fs.readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(content) as { name?: string; version?: string };
      // 验证是否是正确的 package（名字匹配）
      if (pkg.name === 'clawdcode' && pkg.version) {
        return pkg.version;
      }
    } catch {
      // 继续尝试下一个路径
    }
  }

  // 如果都失败，使用默认版本
  return '0.1.0';
}

const version = readVersionSync();

/**
 * CLI 基础配置
 */
export const cliConfig = {
  scriptName: 'clawdcode',
  usage: '$0 [message] [options]',
  version,
};

/**
 * 全局选项定义
 * 
 * 分组说明：
 * - Debug Options: 调试相关
 * - AI Options: 模型和 AI 相关
 * - Security Options: 权限和安全相关
 * - Session Options: 会话管理相关
 * - Output Options: 输出格式相关
 * - Config Options: 配置相关
 */
export const globalOptions = {
  // ========== Debug Options ==========
  debug: {
    alias: 'd',
    type: 'boolean',
    describe: 'Enable debug mode',
    default: false,
    group: 'Debug Options:',
  },

  // ========== AI Options ==========
  'api-key': {
    type: 'string',
    describe: 'API key for the LLM service',
    group: 'AI Options:',
  },

  'base-url': {
    type: 'string',
    describe: 'Base URL for the API (for OpenAI-compatible services)',
    group: 'AI Options:',
  },

  model: {
    alias: 'm',
    type: 'string',
    describe: 'Model to use for the current session',
    group: 'AI Options:',
  },

  'max-turns': {
    type: 'number',
    describe: 'Maximum conversation turns (default: 100)',
    group: 'AI Options:',
  },

  // ========== Security Options ==========
  'permission-mode': {
    type: 'string',
    choices: ['default', 'autoEdit', 'yolo'] as const,
    describe: 'Permission mode for tool execution',
    group: 'Security Options:',
  },

  yolo: {
    type: 'boolean',
    describe: 'Auto-approve all tool executions (alias for --permission-mode=yolo)',
    default: false,
    group: 'Security Options:',
  },

  'allowed-tools': {
    type: 'array',
    string: true,  // 数组元素为字符串
    describe: 'List of tool names to allow',
    group: 'Security Options:',
  },

  'disallowed-tools': {
    type: 'array',
    string: true,
    describe: 'List of tool names to disallow',
    group: 'Security Options:',
  },

  // ========== Session Options ==========
  continue: {
    alias: 'c',
    type: 'boolean',
    describe: 'Continue the most recent conversation',
    default: false,
    group: 'Session Options:',
  },

  resume: {
    alias: 'r',
    type: 'string',
    describe: 'Resume a specific conversation by ID',
    group: 'Session Options:',
  },

  // ========== Output Options ==========
  print: {
    alias: 'p',
    type: 'boolean',
    describe: 'Print response and exit (non-interactive mode)',
    default: false,
    group: 'Output Options:',
  },

  'output-format': {
    type: 'string',
    choices: ['text', 'json'] as const,
    describe: 'Output format (only with --print)',
    default: 'text',
    group: 'Output Options:',
  },

  // ========== Config Options ==========
  init: {
    type: 'boolean',
    describe: 'Create default configuration file',
    default: false,
    group: 'Config Options:',
  },
} satisfies Record<string, Options>;
```

**代码说明**：

| 部分 | 说明 |
|------|------|
| `readVersionSync()` | 从 package.json 读取版本，支持多种运行环境 |
| `cliConfig` | CLI 基础配置（名称、用法、版本） |
| `globalOptions` | 所有选项定义，使用 `group` 分组 |
| `satisfies` | TypeScript 4.9 特性，确保类型正确但保留字面量类型 |

### 3.3.2 选项类型说明

```typescript
// 布尔类型
debug: { type: 'boolean' }

// 字符串类型
model: { type: 'string' }

// 数字类型
'max-turns': { type: 'number' }

// 字符串数组
'allowed-tools': { type: 'array', string: true }

// 枚举（使用 choices）
'permission-mode': { 
  type: 'string',
  choices: ['default', 'autoEdit', 'yolo'] as const
}

// 别名
debug: { alias: 'd' }  // -d 等同于 --debug
```

---

## 3.4 中间件机制

### 3.4.1 什么是中间件

yargs 中间件是在命令执行前运行的函数链，类似 Express 的中间件概念：

```
参数解析完成 → middleware1 → middleware2 → middleware3 → 执行命令
```

中间件的用途：
- 验证参数有效性
- 加载配置文件
- 参数转换和规范化
- 设置全局状态

### 3.4.2 创建中间件文件

**文件位置**：`src/cli/middleware.ts`

```typescript
/**
 * CLI 中间件
 * 
 * 中间件在命令执行前运行，用于：
 * - 验证参数
 * - 加载配置
 * - 设置全局状态
 * 
 * 执行顺序：
 * validatePermissions → loadConfiguration → validateOutput
 */

import type { CliArguments } from './types.js';
import { configManager } from '../config/index.js';

/**
 * 中间件 1：验证权限相关参数
 * 
 * 职责：
 * 1. 处理 --yolo 快捷方式（转换为 --permission-mode=yolo）
 * 2. 检测工具列表冲突（同一工具不能同时在 allow 和 disallow 中）
 */
export const validatePermissions = (argv: CliArguments): void => {
  // 1. 处理 --yolo 快捷方式
  if (argv.yolo) {
    // 检查是否与 --permission-mode 冲突
    if (argv.permissionMode && argv.permissionMode !== 'yolo') {
      throw new Error(
        'Cannot use both --yolo and --permission-mode with different values'
      );
    }
    // 将 --yolo 转换为 --permission-mode=yolo
    argv.permissionMode = 'yolo';
  }

  // 2. 验证工具列表冲突
  if (Array.isArray(argv.allowedTools) && Array.isArray(argv.disallowedTools)) {
    const allowedSet = new Set(argv.allowedTools);
    // 找出同时在两个列表中的工具
    const intersection = argv.disallowedTools.filter(tool => allowedSet.has(tool));
    
    if (intersection.length > 0) {
      throw new Error(
        `Tools cannot be both allowed and disallowed: ${intersection.join(', ')}`
      );
    }
  }
};

/**
 * 中间件 2：加载配置
 * 
 * 职责：
 * 1. 初始化 ConfigManager（加载配置文件 + 环境变量）
 * 2. 应用 CLI 参数（最高优先级）
 * 3. 验证会话选项
 */
export const loadConfiguration = async (argv: CliArguments): Promise<void> => {
  // 跳过 --init 命令的配置加载（因为配置文件可能不存在）
  if (argv.init) {
    return;
  }

  try {
    // 1. 初始化 ConfigManager
    // 这会加载：默认配置 → 用户配置 → 项目配置 → 环境变量
    await configManager.initialize();

    // 2. 应用 CLI 参数（最高优先级）
    configManager.applyCliArgs({
      apiKey: argv.apiKey,
      baseURL: argv.baseUrl,
      model: argv.model,
    });

    // Debug 输出
    if (argv.debug) {
      console.log('[CLI] Configuration loaded successfully');
      const paths = configManager.getLoadedConfigPaths();
      if (paths.length > 0) {
        console.log('[CLI] Loaded config files:', paths);
      }
    }
  } catch (error) {
    // 配置加载失败是致命错误
    console.error('❌ Failed to initialize configuration');
    console.error(
      'Error:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    console.error('');
    console.error('Please check:');
    console.error('  1. Config file format (~/.clawdcode/config.json)');
    console.error('  2. Run "clawdcode --init" to create default config');
    console.error('  3. Config file permissions');
    process.exit(1);
  }

  // 3. 验证会话选项
  if (argv.continue && argv.resume) {
    throw new Error('Cannot use both --continue and --resume flags');
  }
};

/**
 * 中间件 3：验证输出选项
 * 
 * 职责：
 * 1. 验证 --output-format 只能与 --print 一起使用
 */
export const validateOutput = (argv: CliArguments): void => {
  // --output-format 只能与 --print 一起使用
  if (argv.outputFormat && argv.outputFormat !== 'text' && !argv.print) {
    throw new Error('--output-format can only be used with --print flag');
  }
};

/**
 * 中间件链（按顺序执行）
 * 
 * 使用 any[] 类型以兼容 yargs 的复杂泛型系统
 * eslint-disable 是必要的，因为 yargs 的类型定义非常复杂
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const middlewareChain: any[] = [
  validatePermissions,
  loadConfiguration,
  validateOutput,
];
```

**代码说明**：

| 中间件 | 职责 |
|--------|------|
| `validatePermissions` | 验证权限参数，处理快捷方式 |
| `loadConfiguration` | 加载配置文件，应用 CLI 参数 |
| `validateOutput` | 验证输出选项组合 |

### 3.4.3 创建模块导出

**文件位置**：`src/cli/index.ts`

```typescript
/**
 * CLI 模块导出
 */

export { globalOptions, cliConfig } from './config.js';
export { middlewareChain, validatePermissions, loadConfiguration, validateOutput } from './middleware.js';
export type { CliArguments, MiddlewareFunction, PermissionMode, AppProps } from './types.js';
```

---

## 3.5 配置管理器

### 3.5.1 扩展配置类型

**文件位置**：`src/config/types.ts`

在第 2 章的基础上添加权限配置：

```typescript
/**
 * 配置类型定义
 * 
 * 【第 3 章修改】：添加权限配置
 */

import { z } from 'zod';

/**
 * 模型配置 Schema
 */
export const ModelConfigSchema = z.object({
  name: z.string().optional(),
  apiKey: z.string().optional(),
  baseURL: z.string().optional(),
  model: z.string().optional(),
});

/**
 * UI 配置 Schema
 */
export const UIConfigSchema = z.object({
  theme: z.enum(['dark', 'light']).optional(),
});

/**
 * 【新增】权限配置 Schema
 * 
 * 用于细粒度控制工具执行权限
 */
export const PermissionConfigSchema = z.object({
  allow: z.array(z.string()).default([]),  // 自动允许的操作模式
  deny: z.array(z.string()).default([]),   // 拒绝的操作模式
  ask: z.array(z.string()).default([]),    // 需要询问的操作模式
});

/**
 * 完整配置 Schema
 */
export const ConfigSchema = z.object({
  // 默认模型配置
  default: ModelConfigSchema.optional(),
  
  // 多模型配置（可选，用于在运行时切换）
  models: z.array(ModelConfigSchema).optional(),
  
  // UI 配置
  ui: UIConfigSchema.optional(),
  
  // 【新增】权限配置
  permissions: PermissionConfigSchema.optional(),
  
  // 【新增】默认权限模式
  defaultPermissionMode: z.enum(['default', 'autoEdit', 'yolo', 'plan']).optional(),
  
  // 【新增】工具白名单
  toolWhitelist: z.array(z.string()).optional(),
  
  // 【新增】工具黑名单
  toolBlacklist: z.array(z.string()).optional(),
});

// 类型导出
export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type UIConfig = z.infer<typeof UIConfigSchema>;
export type PermissionConfig = z.infer<typeof PermissionConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;

/**
 * 默认配置
 */
export const DEFAULT_CONFIG: Config = {
  default: {
    model: 'gpt-4',
  },
  ui: {
    theme: 'dark',
  },
  permissions: {
    allow: [],
    deny: [],
    ask: [],
  },
  defaultPermissionMode: 'default',
};
```

**新增内容说明**：

| 字段 | 说明 |
|------|------|
| `permissions` | 细粒度权限控制 |
| `defaultPermissionMode` | 默认权限模式 |
| `toolWhitelist` | 工具白名单 |
| `toolBlacklist` | 工具黑名单 |

### 3.5.2 创建 ConfigManager

**文件位置**：`src/config/ConfigManager.ts`

```typescript
/**
 * ConfigManager - 配置管理器
 * 
 * 配置加载优先级（从低到高）：
 * 1. 默认配置
 * 2. 用户配置 (~/.clawdcode/config.json)
 * 3. 项目配置 (./.clawdcode/config.json)
 * 4. 环境变量
 * 5. CLI 参数
 * 
 * 使用单例模式确保全局只有一个配置实例
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
} from './types.js';

export class ConfigManager {
  // 单例实例
  private static instance: ConfigManager;
  
  // 当前配置
  private config: Config;
  
  // 已加载的配置文件路径（用于调试）
  private configPaths: string[] = [];

  /**
   * 私有构造函数（单例模式）
   */
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
   * 初始化配置
   * 
   * @param projectPath - 项目路径（可选，默认使用 cwd）
   */
  async initialize(projectPath?: string): Promise<void> {
    // 1. 从默认配置开始
    this.config = { ...DEFAULT_CONFIG };
    this.configPaths = [];

    // 2. 加载用户配置 (~/.clawdcode/config.json)
    const userConfigPath = this.getUserConfigPath();
    await this.loadConfigFile(userConfigPath);

    // 3. 加载项目配置 (./.clawdcode/config.json)
    const projectConfigPath = path.join(
      projectPath || process.cwd(),
      '.clawdcode',
      'config.json'
    );
    await this.loadConfigFile(projectConfigPath);

    // 4. 应用环境变量
    this.applyEnvironmentVariables();
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
   * 
   * @param configPath - 配置文件路径
   * @returns 是否成功加载
   */
  private async loadConfigFile(configPath: string): Promise<boolean> {
    try {
      // 检查文件是否存在
      if (!fs.existsSync(configPath)) {
        return false;
      }

      // 读取并解析 JSON
      const content = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(content);
      
      // 使用 Zod 验证（partial 允许部分字段）
      const validated = ConfigSchema.partial().parse(parsed);

      // 深度合并配置
      this.config = this.mergeConfig(this.config, validated);
      this.configPaths.push(configPath);

      return true;
    } catch (error) {
      console.warn(
        `Warning: Failed to load config from ${configPath}:`,
        (error as Error).message
      );
      return false;
    }
  }

  /**
   * 应用环境变量
   * 
   * 支持的环境变量：
   * - OPENAI_API_KEY
   * - OPENAI_BASE_URL
   * - OPENAI_MODEL
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
   * 
   * @param args - CLI 参数
   */
  applyCliArgs(args: Partial<ModelConfig>): void {
    this.config.default = this.config.default || {};
    const defaultConfig = this.config.default;

    // 只有提供了值才覆盖
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
   * 
   * @param base - 基础配置
   * @param override - 覆盖配置
   * @returns 合并后的配置
   */
  private mergeConfig(base: Config, override: Partial<Config>): Config {
    const merged: Config = { ...base };

    // 合并 default 配置
    if (override.default || base.default) {
      merged.default = {
        ...base.default,
        ...override.default,
      };
    }

    // 合并 models 配置（直接覆盖）
    if (override.models) {
      merged.models = override.models;
    }

    // 合并 UI 配置
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

    // 其他字段直接覆盖
    if (override.defaultPermissionMode) {
      merged.defaultPermissionMode = override.defaultPermissionMode;
    }
    if (override.toolWhitelist) {
      merged.toolWhitelist = override.toolWhitelist;
    }
    if (override.toolBlacklist) {
      merged.toolBlacklist = override.toolBlacklist;
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
   * 创建默认配置文件
   * 
   * @returns 创建的配置文件路径
   */
  async createDefaultConfig(): Promise<string> {
    const configDir = this.getUserConfigDir();
    const configPath = this.getUserConfigPath();

    // 创建目录（如果不存在）
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // 默认配置模板（不包含敏感信息）
    const defaultConfig: Config = {
      default: {
        model: 'gpt-4',
        // apiKey: 'your-api-key',  // 需要用户自己填写
        // baseURL: 'https://api.openai.com/v1',
      },
      ui: {
        theme: 'dark',
      },
    };

    const content = JSON.stringify(defaultConfig, null, 2);
    fs.writeFileSync(configPath, content, 'utf-8');

    return configPath;
  }

  /**
   * 验证配置是否完整
   */
  isConfigValid(): boolean {
    return !!this.config.default?.apiKey;
  }
}

// 导出单例
export const configManager = ConfigManager.getInstance();
```

**代码说明**：

| 方法 | 说明 |
|------|------|
| `getInstance()` | 单例模式获取实例 |
| `initialize()` | 加载所有配置源 |
| `loadConfigFile()` | 加载单个配置文件 |
| `applyEnvironmentVariables()` | 应用环境变量 |
| `applyCliArgs()` | 应用 CLI 参数 |
| `mergeConfig()` | 深度合并配置 |
| `createDefaultConfig()` | 创建默认配置文件 |

### 3.5.3 创建模块导出

**文件位置**：`src/config/index.ts`

```typescript
/**
 * Config 模块导出
 */

export { ConfigManager, configManager } from './ConfigManager.js';
export {
  ConfigSchema,
  ModelConfigSchema,
  UIConfigSchema,
  PermissionConfigSchema,
  DEFAULT_CONFIG,
} from './types.js';
export type { Config, ModelConfig, UIConfig, PermissionConfig } from './types.js';
```

---

## 3.6 版本检查服务

### 3.6.1 创建版本检查服务

**文件位置**：`src/services/VersionChecker.ts`

```typescript
/**
 * VersionChecker - 版本检查服务
 * 
 * 功能：
 * - 启动时并行检查是否有新版本
 * - 缓存机制（1小时 TTL）
 * - 跳过版本功能（Skip until next version）
 * 
 * 设计原则：
 * - 不阻塞启动流程
 * - 静默处理网络错误
 * - 尊重用户的跳过选择
 */

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

// ========== 从 package.json 读取配置 ==========

interface PackageJson {
  name: string;
  version: string;
  repository?: { type?: string; url?: string } | string;
  homepage?: string;
}

/**
 * 同步读取 package.json
 */
function readPackageJsonSync(): PackageJson {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  
  const possiblePaths = [
    path.resolve(__dirname, '../package.json'),
    path.resolve(__dirname, '../../package.json'),
  ];

  for (const pkgPath of possiblePaths) {
    try {
      const content = fs.readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(content) as PackageJson;
      if (pkg.name === 'clawdcode') {
        return pkg;
      }
    } catch {
      // 继续尝试下一个路径
    }
  }

  return { name: 'clawdcode', version: '0.1.0' };
}

const packageJson = readPackageJsonSync();

// ========== 配置常量 ==========

const PACKAGE_NAME = packageJson.name;
const CURRENT_VERSION = packageJson.version;
const DEFAULT_NPM_REGISTRY_URL = 'https://registry.npmjs.org';
const CACHE_TTL = 60 * 60 * 1000; // 1 小时
const CACHE_DIR = path.join(os.homedir(), `.${PACKAGE_NAME}`);
const CACHE_FILE = path.join(CACHE_DIR, 'version-cache.json');

// ========== 类型定义 ==========

/**
 * 版本检查结果
 */
export interface VersionCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  hasUpdate: boolean;
  shouldPrompt: boolean;  // 是否应该显示提示（考虑 skip 设置）
  releaseNotesUrl: string;
  error?: string;
}

/**
 * 版本缓存
 */
interface VersionCache {
  latestVersion: string;
  checkedAt: number;
  skipUntilVersion?: string;  // 用户选择跳过的版本
}

// ========== 辅助函数 ==========

/**
 * 从用户 .npmrc 读取 registry 配置
 */
async function getNpmRegistry(): Promise<string> {
  const npmrcLocations = [
    path.join(process.cwd(), '.npmrc'),
    path.join(os.homedir(), '.npmrc'),
  ];

  for (const npmrcPath of npmrcLocations) {
    try {
      const content = await fsPromises.readFile(npmrcPath, 'utf-8');
      const match = content.match(/^\s*registry\s*=\s*(.+?)\s*$/m);
      if (match && match[1]) {
        let registry = match[1].trim();
        if (registry.endsWith('/')) {
          registry = registry.slice(0, -1);
        }
        return registry;
      }
    } catch {
      // 继续尝试下一个
    }
  }

  return DEFAULT_NPM_REGISTRY_URL;
}

/**
 * 读取缓存
 */
async function readCache(): Promise<VersionCache | null> {
  try {
    const content = await fsPromises.readFile(CACHE_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * 写入缓存
 */
async function writeCache(cache: VersionCache): Promise<void> {
  try {
    await fsPromises.mkdir(CACHE_DIR, { recursive: true });
    await fsPromises.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (error) {
    // 缓存写入失败不影响主流程
    console.error('[VersionChecker] Failed to write cache:', error);
  }
}

/**
 * 检查缓存是否有效
 */
function isCacheValid(cache: VersionCache): boolean {
  return Date.now() - cache.checkedAt < CACHE_TTL;
}

/**
 * 简单的 semver 比较
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.replace(/^v/, '').split('.').map(Number);
  const partsB = b.replace(/^v/, '').split('.').map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }
  return 0;
}

/**
 * 从 npm registry 获取最新版本
 */
async function fetchLatestVersion(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时

    const registryUrl = await getNpmRegistry();
    
    const response = await fetch(`${registryUrl}/${PACKAGE_NAME}/latest`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as { version?: string };
    return data.version || null;
  } catch {
    // 网络错误、超时等，静默失败
    return null;
  }
}

/**
 * 获取 release notes URL
 */
function getReleaseNotesUrl(): string {
  const repoUrl = typeof packageJson.repository === 'string'
    ? packageJson.repository
    : packageJson.repository?.url;
  
  if (repoUrl) {
    const match = repoUrl.match(/github\.com[/:]([^/]+\/[^/.]+)/);
    if (match) {
      return `https://github.com/${match[1]}/releases`;
    }
  }
  
  return `https://www.npmjs.com/package/${PACKAGE_NAME}`;
}

// ========== 核心功能 ==========

/**
 * 检查版本更新
 * 
 * @param forceCheck - 是否强制检查（忽略缓存）
 */
export async function checkVersion(forceCheck = false): Promise<VersionCheckResult> {
  const result: VersionCheckResult = {
    currentVersion: CURRENT_VERSION,
    latestVersion: null,
    hasUpdate: false,
    shouldPrompt: false,
    releaseNotesUrl: getReleaseNotesUrl(),
  };

  try {
    // 1. 尝试读取缓存
    const cache = await readCache();

    // 2. 如果缓存有效且不强制检查，使用缓存
    if (cache && isCacheValid(cache) && !forceCheck) {
      result.latestVersion = cache.latestVersion;
    } else {
      // 3. 从 npm 获取最新版本
      const latestVersion = await fetchLatestVersion();
      
      if (latestVersion) {
        result.latestVersion = latestVersion;
        
        // 4. 更新缓存（保留 skipUntilVersion）
        await writeCache({
          latestVersion,
          checkedAt: Date.now(),
          skipUntilVersion: cache?.skipUntilVersion,
        });
      } else if (cache) {
        // 获取失败但有旧缓存，使用旧数据
        result.latestVersion = cache.latestVersion;
      }
    }

    // 5. 判断是否有更新
    if (result.latestVersion) {
      result.hasUpdate = compareVersions(result.latestVersion, CURRENT_VERSION) > 0;
    }

    // 6. 判断是否应该提示（考虑 skip 设置）
    if (result.hasUpdate && result.latestVersion) {
      const cache = await readCache();
      const skipVersion = cache?.skipUntilVersion;
      if (skipVersion) {
        // 如果最新版本大于跳过版本，则应该提示
        result.shouldPrompt = compareVersions(result.latestVersion, skipVersion) > 0;
      } else {
        result.shouldPrompt = true;
      }
    }

  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
  }

  return result;
}

/**
 * 启动时版本检查
 * 
 * @returns null 表示不需要显示更新提示
 */
export async function checkVersionOnStartup(): Promise<VersionCheckResult | null> {
  const result = await checkVersion();
  
  // 只有需要提示时才返回结果
  if (result.shouldPrompt) {
    return result;
  }
  
  return null;
}

/**
 * 设置跳过直到下一版本
 */
export async function setSkipUntilVersion(version: string): Promise<void> {
  const cache = await readCache();
  await writeCache({
    latestVersion: cache?.latestVersion || version,
    checkedAt: cache?.checkedAt || Date.now(),
    skipUntilVersion: version,
  });
}

/**
 * 获取升级命令
 */
export function getUpgradeCommand(): string {
  return `npm install -g ${PACKAGE_NAME}@latest --prefer-online`;
}

/**
 * 执行升级
 */
export async function performUpgrade(): Promise<{ success: boolean; message: string }> {
  const { spawn } = await import('child_process');

  return new Promise((resolve) => {
    const command = getUpgradeCommand();

    const child = spawn(command, {
      stdio: 'inherit',
      shell: true,
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({
          success: true,
          message: '✅ Upgrade successful! Restarting...',
        });
      } else {
        resolve({
          success: false,
          message: `❌ Upgrade failed (exit code: ${code})`,
        });
      }
    });

    child.on('error', (error) => {
      resolve({
        success: false,
        message: `❌ Upgrade failed: ${error.message}`,
      });
    });
  });
}

/**
 * 重启应用
 */
export function restartApp(): void {
  const { spawn } = require('child_process');
  
  const child = spawn(PACKAGE_NAME, process.argv.slice(2), {
    stdio: 'inherit',
    shell: true,
    detached: true,
  });

  child.unref();
  process.exit(0);
}

/**
 * 获取当前版本
 */
export function getCurrentVersion(): string {
  return CURRENT_VERSION;
}
```

### 3.6.2 创建服务模块导出

**文件位置**：`src/services/index.ts`

```typescript
/**
 * Services 模块导出
 */

export {
  checkVersion,
  checkVersionOnStartup,
  setSkipUntilVersion,
  getUpgradeCommand,
  performUpgrade,
  restartApp,
  getCurrentVersion,
} from './VersionChecker.js';

export type { VersionCheckResult } from './VersionChecker.js';
```

---

## 3.7 更新提示组件

### 3.7.1 创建 UpdatePrompt 组件

**文件位置**：`src/ui/components/UpdatePrompt.tsx`

```tsx
/**
 * UpdatePrompt - 版本更新提示组件
 * 
 * 显示可用更新，提供三个选项：
 * - Update now: 立即执行升级
 * - Skip: 跳过本次提示
 * - Skip until next version: 跳过当前版本的提示
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { VersionCheckResult } from '../../services/VersionChecker.js';
import {
  setSkipUntilVersion,
  getUpgradeCommand,
  performUpgrade,
  restartApp,
} from '../../services/VersionChecker.js';

interface UpdatePromptProps {
  versionInfo: VersionCheckResult;
  onComplete: () => void;  // 完成后的回调
}

type MenuOption = 'update' | 'skip' | 'skipUntil';

const menuOptions: { key: MenuOption; label: string }[] = [
  { key: 'update', label: 'Update now' },
  { key: 'skip', label: 'Skip' },
  { key: 'skipUntil', label: 'Skip until next version' },
];

export const UpdatePrompt: React.FC<UpdatePromptProps> = ({
  versionInfo,
  onComplete,
}) => {
  // 当前选中的菜单项索引
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  // 是否正在升级
  const [isUpdating, setIsUpdating] = useState(false);
  
  // 升级结果消息
  const [updateResult, setUpdateResult] = useState<string | null>(null);

  // 处理键盘输入
  useInput(async (input, key) => {
    // 升级中不响应输入
    if (isUpdating) return;

    // 上下键选择
    if (key.upArrow) {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : menuOptions.length - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((prev) => (prev < menuOptions.length - 1 ? prev + 1 : 0));
      return;
    }

    // 数字键快速选择
    const numKey = parseInt(input, 10);
    if (numKey >= 1 && numKey <= menuOptions.length) {
      setSelectedIndex(numKey - 1);
      return;
    }

    // Enter 确认选择
    if (key.return) {
      const selected = menuOptions[selectedIndex];
      await handleSelection(selected.key);
    }
  });

  /**
   * 处理菜单选择
   */
  const handleSelection = async (option: MenuOption) => {
    switch (option) {
      case 'update':
        // 执行升级
        setIsUpdating(true);
        const result = await performUpgrade();
        setUpdateResult(result.message);
        if (result.success) {
          // 升级成功，自动重启
          setTimeout(() => restartApp(), 1500);
        } else {
          // 升级失败，继续进入应用
          setTimeout(() => onComplete(), 2000);
        }
        break;

      case 'skip':
        // 跳过，直接进入应用
        onComplete();
        break;

      case 'skipUntil':
        // 设置跳过版本后进入应用
        if (versionInfo.latestVersion) {
          await setSkipUntilVersion(versionInfo.latestVersion);
        }
        onComplete();
        break;
    }
  };

  // 显示升级结果
  if (updateResult) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>{updateResult}</Text>
      </Box>
    );
  }

  // 显示升级中
  if (isUpdating) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="yellow">⏳ Upgrading...</Text>
        <Text color="gray">{getUpgradeCommand()}</Text>
      </Box>
    );
  }

  // 显示菜单
  return (
    <Box flexDirection="column" padding={1}>
      {/* 标题 */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          🎉 New version available!
        </Text>
      </Box>

      {/* 版本信息 */}
      <Box marginBottom={1}>
        <Text>
          <Text color="gray">{versionInfo.currentVersion}</Text>
          <Text color="gray"> → </Text>
          <Text color="green" bold>{versionInfo.latestVersion}</Text>
        </Text>
      </Box>

      {/* 菜单选项 */}
      <Box flexDirection="column" marginBottom={1}>
        {menuOptions.map((option, index) => (
          <Box key={option.key}>
            <Text color={selectedIndex === index ? 'cyan' : 'white'}>
              {selectedIndex === index ? '❯ ' : '  '}
              {index + 1}. {option.label}
            </Text>
          </Box>
        ))}
      </Box>

      {/* 提示 */}
      <Box>
        <Text color="gray">
          Use ↑↓ to navigate, Enter to select, or press 1-3
        </Text>
      </Box>
    </Box>
  );
};

export default UpdatePrompt;
```

### 3.7.2 更新组件导出

**文件位置**：`src/ui/components/index.ts`

```typescript
/**
 * UI 组件导出
 * 
 * 【第 3 章修改】：添加 UpdatePrompt 导出
 */

export { ErrorBoundary } from './ErrorBoundary.js';
export { UpdatePrompt } from './UpdatePrompt.js';
```

---

## 3.8 更新主入口文件

### 3.8.1 完整的 main.tsx

**文件位置**：`src/main.tsx`

```tsx
#!/usr/bin/env node
/**
 * ClawdCode CLI - 主入口
 *
 * 【第 3 章】完整的启动流程：
 * 1. 早期解析 --debug 参数（确保日志可用）
 * 2. 启动版本检查（不等待，与后续流程并行）
 * 3. 创建 yargs CLI 实例
 * 4. 注册全局选项和命令
 * 5. 执行中间件链（validatePermissions → loadConfiguration → validateOutput）
 * 6. 执行默认命令 → 启动 React UI（传递 versionCheckPromise）
 *
 * 配置加载优先级（从低到高）：
 * 1. 默认配置
 * 2. 用户配置 (~/.clawdcode/config.json)
 * 3. 项目配置 (./.clawdcode/config.json)
 * 4. 环境变量 (OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL)
 * 5. CLI 参数 (--api-key, --base-url, --model)
 */

import React from 'react';
import { render } from 'ink';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { App } from './ui/App.js';
import { configManager } from './config/index.js';
import { cliConfig, globalOptions, middlewareChain } from './cli/index.js';
import { checkVersionOnStartup } from './services/index.js';
import type { CliArguments } from './cli/types.js';
import type { VersionCheckResult } from './services/VersionChecker.js';

// ========== 全局状态 ==========
let isDebugMode = false;
let versionCheckPromise: Promise<VersionCheckResult | null> | undefined;

/**
 * 早期解析 --debug 参数
 *
 * 为什么要早期解析？
 * - Logger 在各模块中被创建
 * - 如果等 yargs 解析完再设置 debug，部分初始化日志会丢失
 * - 早期解析确保所有日志都能正确输出
 */
function parseDebugEarly(): void {
  const rawArgs = hideBin(process.argv);
  const debugIndex = rawArgs.indexOf('--debug');
  const shortDebugIndex = rawArgs.indexOf('-d');

  if (debugIndex !== -1 || shortDebugIndex !== -1) {
    isDebugMode = true;
    console.log('[DEBUG] Debug mode enabled via early parsing');
  }
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  // 1. 早期解析 --debug
  parseDebugEarly();

  // 2. 启动版本检查（不等待，与后续流程并行执行）
  versionCheckPromise = checkVersionOnStartup();
  if (isDebugMode) {
    console.log('[DEBUG] Version check started (running in parallel)');
  }

  // 3. 创建 yargs CLI 实例
  const cli = yargs(hideBin(process.argv))
    .scriptName(cliConfig.scriptName)
    .usage(cliConfig.usage)
    .version(cliConfig.version)

    // 4. 注册全局选项
    .options(globalOptions)

    // 5. 注册中间件
    .middleware(middlewareChain)

    // 6. 示例
    .example('$0', 'Start interactive mode')
    .example('$0 "帮我分析这个项目"', 'Start with an initial message')
    .example('$0 --model gpt-4', 'Use a specific model')
    .example('$0 --debug', 'Enable debug mode')
    .example('$0 --init', 'Create default config file')

    // 7. 帮助和版本
    .help()
    .alias('h', 'help')
    .alias('v', 'version')

    // 8. 错误处理
    .fail((msg, err, yargsInstance) => {
      if (err) {
        console.error('💥 An error occurred:');
        console.error(err.message);
        if (isDebugMode && err.stack) {
          console.error('\nStack trace:');
          console.error(err.stack);
        }
        process.exit(1);
      }

      if (msg) {
        console.error('❌ Invalid arguments:');
        console.error(msg);
        console.error('');
        yargsInstance.showHelp();
        process.exit(1);
      }
    })

    // 9. 严格模式（禁止未知选项）
    .strict()

    // 10. 默认命令（$0）
    .command(
      '$0 [message..]',
      'Start interactive mode',
      (yargs) => {
        return yargs.positional('message', {
          type: 'string',
          describe: 'Initial message to send (can be multiple words)',
          array: true,
        });
      },
      async (argv) => {
        const args = argv as CliArguments;

        // 处理 --init 命令
        if (args.init) {
          const configPath = await configManager.createDefaultConfig();
          console.log(`✅ Created default config at: ${configPath}`);
          console.log('');
          console.log('Please edit the file and add your API key:');
          console.log(`  vim ${configPath}`);
          process.exit(0);
        }

        // 获取最终配置
        const modelConfig = configManager.getDefaultModel();

        // 检查 API Key
        if (!modelConfig.apiKey) {
          console.error('Error: API key is required');
          console.error('');
          console.error('Configuration options (in priority order):');
          console.error('');
          console.error('  1. Config file (~/.clawdcode/config.json):');
          console.error('     clawdcode --init  # Create default config');
          console.error('');
          console.error('  2. Environment variable:');
          console.error('     export OPENAI_API_KEY=sk-...');
          console.error('');
          console.error('  3. CLI argument:');
          console.error('     clawdcode --api-key sk-...');
          console.error('');

          // 显示已加载的配置文件
          const loadedPaths = configManager.getLoadedConfigPaths();
          if (loadedPaths.length > 0) {
            console.error('Loaded config files:');
            loadedPaths.forEach((p) => console.error(`  - ${p}`));
          }

          process.exit(1);
        }

        // 获取初始消息（支持多个单词）
        const messageArray = argv.message as string[] | undefined;
        const initialMessage =
          messageArray && messageArray.length > 0
            ? messageArray.join(' ')
            : undefined;

        if (isDebugMode && initialMessage) {
          console.log('[DEBUG] Initial message:', initialMessage);
        }

        // 启动 Ink 应用
        render(
          <App
            apiKey={modelConfig.apiKey}
            baseURL={modelConfig.baseURL}
            model={modelConfig.model}
            initialMessage={initialMessage}
            debug={args.debug}
            permissionMode={args.permissionMode}
            versionCheckPromise={versionCheckPromise}
          />,
          {
            exitOnCtrlC: true,
          },
        );
      },
    );

  // 11. 解析参数
  await cli.parse();
}

// 运行主函数
main().catch((error) => {
  console.error('Fatal error:', error.message);
  if (isDebugMode && error.stack) {
    console.error('\nStack trace:');
    console.error(error.stack);
  }
  process.exit(1);
});
```

---

## 3.9 更新 App.tsx

### 3.9.1 添加版本检查支持

**文件位置**：`src/ui/App.tsx`

在第 2 章的基础上，添加版本检查和 UpdatePrompt 支持。

**主要修改**：

1. 添加 `versionCheckPromise` 属性
2. 创建 `AppWrapper` 组件处理版本检查
3. 在显示 `MainInterface` 前检查是否需要显示更新提示

```tsx
/**
 * App.tsx - 主 UI 组件
 * 
 * 【第 3 章修改】：添加版本检查和 UpdatePrompt 支持
 * 
 * 启动流程：
 * 1. AppWrapper 等待版本检查完成
 * 2. 如果有新版本 → 显示 UpdatePrompt
 * 3. 用户跳过或无更新 → 初始化应用 → 显示主界面
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { UpdatePrompt } from './components/UpdatePrompt.js';
import type { PermissionMode } from '../cli/types.js';
import type { VersionCheckResult } from '../services/VersionChecker.js';

// ... (MainInterface 组件保持不变，参考第 2 章)

// ========== 新增 AppProps ==========

export interface AppProps {
  apiKey: string;
  baseURL?: string;
  model?: string;
  initialMessage?: string;
  debug?: boolean;
  permissionMode?: PermissionMode;
  // 【新增】版本检查 Promise
  versionCheckPromise?: Promise<VersionCheckResult | null>;
}

// ========== 新增 AppWrapper 组件 ==========

/**
 * AppWrapper - 处理版本检查和初始化流程
 */
const AppWrapper: React.FC<AppProps> = (props) => {
  const { versionCheckPromise, permissionMode, ...mainProps } = props;
  
  const [isReady, setIsReady] = useState(false);
  const [versionInfo, setVersionInfo] = useState<VersionCheckResult | null>(null);
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);

  // 初始化应用
  const initializeApp = useCallback(() => {
    if (props.debug) {
      console.log('[DEBUG] Initializing application...');
    }
    setIsReady(true);
  }, [props.debug]);

  // 启动流程
  useEffect(() => {
    const initialize = async () => {
      // 1. 等待版本检查完成
      if (versionCheckPromise) {
        try {
          const versionResult = await versionCheckPromise;
          if (versionResult && versionResult.shouldPrompt) {
            // 有新版本需要提示
            setVersionInfo(versionResult);
            setShowUpdatePrompt(true);
            return;
          }
        } catch (error) {
          // 版本检查失败，继续启动
          if (props.debug) {
            console.log('[DEBUG] Version check failed:', error);
          }
        }
      }

      // 2. 无需更新，直接初始化
      initializeApp();
    };

    initialize();
  }, [versionCheckPromise, initializeApp, props.debug]);

  // 显示版本更新提示
  if (showUpdatePrompt && versionInfo) {
    return (
      <UpdatePrompt
        versionInfo={versionInfo}
        onComplete={() => {
          setShowUpdatePrompt(false);
          initializeApp();
        }}
      />
    );
  }

  // 等待初始化完成
  if (!isReady) {
    return (
      <Box padding={1}>
        <Text color="yellow">
          <Spinner type="dots" />
        </Text>
        <Text color="yellow"> Starting ClawdCode...</Text>
      </Box>
    );
  }

  // 显示主界面
  return <MainInterface {...mainProps} />;
};

// ========== 导出 ==========

/**
 * App - 带有 ErrorBoundary 的主组件
 */
export const App: React.FC<AppProps> = (props) => {
  return (
    <ErrorBoundary>
      <AppWrapper {...props} />
    </ErrorBoundary>
  );
};
```

---

## 3.10 使用方式

### 3.10.1 基本使用

```bash
# 创建配置文件
clawdcode --init

# 启动交互模式
clawdcode

# 带初始消息启动
clawdcode "帮我分析这个项目的结构"

# 使用特定模型
clawdcode --model gpt-4-turbo

# 启用调试模式
clawdcode --debug
```

### 3.10.2 查看帮助

```bash
clawdcode --help
```

输出：

```
clawdcode [message] [options]

Debug Options:
  -d, --debug         Enable debug mode                              [boolean] [default: false]

AI Options:
      --api-key       API key for the LLM service                    [string]
      --base-url      Base URL for the API                           [string]
  -m, --model         Model to use for the current session           [string]
      --max-turns     Maximum conversation turns                     [number]

Security Options:
      --permission-mode  Permission mode             [string] [choices: "default", "autoEdit", "yolo"]
      --yolo            Auto-approve all operations                   [boolean] [default: false]
      --allowed-tools   List of tools to allow                        [array]
      --disallowed-tools List of tools to disallow                    [array]

Session Options:
  -c, --continue      Continue the most recent conversation          [boolean] [default: false]
  -r, --resume        Resume a specific conversation by ID           [string]

Output Options:
  -p, --print         Print response and exit                        [boolean] [default: false]
      --output-format Output format                    [string] [choices: "text", "json"] [default: "text"]

Config Options:
      --init          Create default configuration file              [boolean] [default: false]

Options:
  -h, --help     Show help                                           [boolean]
  -v, --version  Show version number                                 [boolean]

Examples:
  clawdcode                           Start interactive mode
  clawdcode "帮我分析这个项目"          Start with an initial message
  clawdcode --model gpt-4             Use a specific model
  clawdcode --debug                   Enable debug mode
  clawdcode --init                    Create default config file
```

---

## 3.11 本章小结

### 完成的内容

| 模块 | 文件 | 功能 |
|------|------|------|
| CLI 类型 | `src/cli/types.ts` | 定义所有 CLI 相关类型 |
| CLI 配置 | `src/cli/config.ts` | yargs 选项定义，版本读取 |
| 中间件 | `src/cli/middleware.ts` | 参数验证，配置加载 |
| 配置管理 | `src/config/ConfigManager.ts` | 多源配置合并 |
| 版本检查 | `src/services/VersionChecker.ts` | 并行版本检查，缓存机制 |
| 更新提示 | `src/ui/components/UpdatePrompt.tsx` | 交互式更新菜单 |
| 主入口 | `src/main.tsx` | 完整启动流程 |

### 技术亮点

| 亮点 | 说明 |
|------|------|
| 早期参数解析 | 确保 debug 日志不丢失 |
| 并行版本检查 | 不阻塞启动速度 |
| 中间件链模式 | 关注点分离，易于维护 |
| 配置优先级链 | 灵活的配置覆盖机制 |
| 缓存 + 跳过机制 | 避免重复打扰用户 |
| 从 package.json 读取 | Single Source of Truth |

### 配置加载优先级

```
默认值 < 用户配置 < 项目配置 < 环境变量 < CLI 参数
```

---

## 3.12 本章遗留项

::: info 以下功能将在后续章节实现
本章建立了 CLI 框架，部分高级功能需要其他模块支持。
:::

| 功能 | 说明 | 计划章节 |
|------|------|----------|
| **Zustand Store 集成** | `initializeStoreState`、`appActions()` | 第 11 章 |
| **运行时配置合并** | `mergeRuntimeConfig` | 第 11 章 |
| **子命令 `mcp`** | MCP 服务器管理 | 第 10 章 |
| **子命令 `doctor`** | 诊断命令 | 第 12 章 |
| **子命令 `update`** | 更新命令 | 第 12 章 |
| **HookManager** | Hooks 管理器 | 第 12 章 |
| **McpRegistry** | MCP 注册表 | 第 10 章 |
| **registerCleanup** | 优雅退出清理 | 第 12 章 |

### 当前状态

本章实现的 CLI 框架是**完整可用**的：

- ✅ yargs 命令行解析
- ✅ 中间件链（权限验证、配置加载、输出验证）
- ✅ ConfigManager 配置管理
- ✅ VersionChecker 版本检查
- ✅ UpdatePrompt 更新提示组件
- ✅ 完整启动流程

---

## 下一章预告

在 **第四章** 中，我们将：
1. 实现完整的 Agent 类
2. 实现 Agentic Loop 核心循环
3. 添加工具调用支持
4. 实现上下文管理

这将让我们的 Agent 具备真正的"执行能力"！
