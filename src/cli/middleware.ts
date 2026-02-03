/**
 * CLI 中间件
 * 
 * 中间件在命令执行前运行，用于：
 * - 验证参数
 * - 加载配置
 * - 设置全局状态
 */

import type { CliArguments } from './types.js';
import { configManager } from '../config/index.js';

/**
 * 验证权限相关参数
 * 
 * 职责：
 * 1. 处理 --yolo 快捷方式
 * 2. 检测工具列表冲突
 */
export const validatePermissions = (argv: CliArguments): void => {
  // 1. 处理 --yolo 快捷方式 → --permission-mode=yolo
  if (argv.yolo) {
    if (argv.permissionMode && argv.permissionMode !== 'yolo') {
      throw new Error(
        'Cannot use both --yolo and --permission-mode with different values'
      );
    }
    argv.permissionMode = 'yolo';
  }

  // 2. 验证工具列表冲突
  if (Array.isArray(argv.allowedTools) && Array.isArray(argv.disallowedTools)) {
    const allowedSet = new Set(argv.allowedTools);
    const intersection = argv.disallowedTools.filter(tool => allowedSet.has(tool));
    
    if (intersection.length > 0) {
      throw new Error(
        `Tools cannot be both allowed and disallowed: ${intersection.join(', ')}`
      );
    }
  }
};

/**
 * 加载配置
 * 
 * 职责：
 * 1. 初始化 ConfigManager
 * 2. 应用 CLI 参数
 * 3. 验证会话选项
 */
export const loadConfiguration = async (argv: CliArguments): Promise<void> => {
  // 跳过 --init 命令的配置加载
  if (argv.init) {
    return;
  }

  try {
    // 1. 初始化 ConfigManager（加载配置文件 + 环境变量）
    await configManager.initialize();

    // 2. 应用 CLI 参数（最高优先级）
    configManager.applyCliArgs({
      apiKey: argv.apiKey,
      baseURL: argv.baseUrl,
      model: argv.model,
    });

    if (argv.debug) {
      console.log('[CLI] Configuration loaded successfully');
      const paths = configManager.getLoadedConfigPaths();
      if (paths.length > 0) {
        console.log('[CLI] Loaded config files:', paths);
      }
    }
  } catch (error) {
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
 * 验证输出选项
 * 
 * 职责：
 * 1. 验证输出格式组合
 */
export const validateOutput = (argv: CliArguments): void => {
  // 验证输出格式只能与 --print 一起使用
  if (argv.outputFormat && argv.outputFormat !== 'text' && !argv.print) {
    throw new Error('--output-format can only be used with --print flag');
  }
};

/**
 * 中间件链（按顺序执行）
 * 使用 any[] 类型以兼容 yargs 的复杂泛型系统
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const middlewareChain: any[] = [
  validatePermissions,
  loadConfiguration,
  validateOutput,
];
