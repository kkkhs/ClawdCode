/**
 * CLI 配置 - yargs 选项定义
 */

import type { Options } from 'yargs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * 同步读取 package.json 版本
 * 尝试多个可能的路径以适应不同环境（开发/打包/全局安装）
 * 
 * 注意：不使用 process.cwd()，因为用户运行 clawdcode 时
 * 工作目录是他们的项目目录，不是 clawdcode 安装目录
 */
function readVersionSync(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  
  const possiblePaths = [
    path.resolve(__dirname, '../package.json'),     // 打包后/全局安装: dist/ -> root
    path.resolve(__dirname, '../../package.json'),  // 开发环境: src/cli/ -> root
  ];

  for (const pkgPath of possiblePaths) {
    try {
      const content = fs.readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(content) as { name?: string; version?: string };
      if (pkg.name === 'clawdcode' && pkg.version) {
        return pkg.version;
      }
    } catch {
      // 继续尝试下一个路径
    }
  }

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
 * 分组：
 * - Debug Options: 调试相关
 * - AI Options: 模型和 AI 相关
 * - Security Options: 权限和安全相关
 * - Session Options: 会话管理相关
 * - Output Options: 输出格式相关
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
    string: true,
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

  // ========== UI Options ==========
  theme: {
    alias: 't',
    type: 'string',
    choices: ['default', 'light', 'dark', 'ocean', 'forest', 'sunset'] as const,
    describe: 'Color theme for the UI (overrides saved preference)',
    group: 'UI Options:',
  },

  // ========== Config Options ==========
  init: {
    type: 'boolean',
    describe: 'Create default configuration file',
    default: false,
    group: 'Config Options:',
  },
} satisfies Record<string, Options>;
