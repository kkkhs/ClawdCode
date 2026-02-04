/**
 * Slash 命令模块
 * 
 * 提供命令注册、解析、执行和模糊匹配功能
 */

import Fuse from 'fuse.js';
import type { 
  SlashCommand, 
  SlashCommandContext, 
  SlashCommandResult,
  CommandSuggestion,
  SlashCommandRegistry,
} from './types.js';
import { builtinCommands } from './builtinCommands.js';
import { mcpCommand } from './mcpCommand.js';

// 导出类型
export * from './types.js';
export { mcpCommand } from './mcpCommand.js';
export { builtinCommands } from './builtinCommands.js';

// ==================== 命令注册表 ====================

/**
 * 全局命令注册表
 */
const commandRegistry: SlashCommandRegistry = {};

/**
 * 初始化命令注册表
 */
function initializeRegistry(): void {
  // 注册内置命令
  for (const cmd of builtinCommands) {
    commandRegistry[cmd.name] = cmd;
  }
  
  // 注册 MCP 命令
  commandRegistry[mcpCommand.name] = mcpCommand;
}

// 初始化
initializeRegistry();

// ==================== 命令查询 ====================

/**
 * 获取命令（支持别名）
 */
export function getCommand(name: string): SlashCommand | undefined {
  const normalizedName = name.toLowerCase();
  
  // 直接匹配
  if (commandRegistry[normalizedName]) {
    return commandRegistry[normalizedName];
  }
  
  // 按别名查找
  for (const cmd of Object.values(commandRegistry)) {
    if (cmd.aliases?.includes(normalizedName)) {
      return cmd;
    }
  }
  
  return undefined;
}

/**
 * 获取所有已注册的命令
 */
export function getRegisteredCommands(): SlashCommand[] {
  return Object.values(commandRegistry);
}

/**
 * 注册新命令
 */
export function registerSlashCommand(command: SlashCommand): void {
  commandRegistry[command.name] = command;
}

/**
 * 注销命令
 */
export function unregisterSlashCommand(name: string): boolean {
  if (commandRegistry[name]) {
    delete commandRegistry[name];
    return true;
  }
  return false;
}

// ==================== 命令解析与执行 ====================

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

/**
 * 执行 slash 命令
 */
export async function executeSlashCommand(
  input: string,
  context: SlashCommandContext
): Promise<SlashCommandResult> {
  const parsed = parseSlashCommand(input);
  
  if (!parsed) {
    return {
      success: false,
      type: 'error',
      error: '无效的命令格式',
    };
  }
  
  const { name, args } = parsed;
  const command = getCommand(name);
  
  if (!command) {
    // 尝试模糊匹配建议
    const suggestions = getFuzzyCommandSuggestions(name);
    let errorMsg = `未知命令: /${name}`;
    
    if (suggestions.length > 0) {
      errorMsg += `\n\n你是否想输入：\n`;
      for (const s of suggestions.slice(0, 3)) {
        errorMsg += `- \`${s.command}\` - ${s.description}\n`;
      }
    }
    
    errorMsg += `\n使用 \`/help\` 查看可用命令`;
    
    return {
      success: false,
      type: 'error',
      error: errorMsg,
    };
  }
  
  try {
    return await command.handler(args, context);
  } catch (error) {
    return {
      success: false,
      type: 'error',
      error: `命令执行失败: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ==================== 模糊匹配 ====================

/**
 * 获取模糊匹配的命令建议
 */
export function getFuzzyCommandSuggestions(input: string): CommandSuggestion[] {
  const query = (input.startsWith('/') ? input.slice(1) : input).trim().toLowerCase();
  
  const searchableCommands = Object.values(commandRegistry).map((cmd) => ({
    name: cmd.name,
    description: cmd.description,
    aliases: cmd.aliases || [],
  }));
  
  // 没有输入，返回所有命令
  if (!query) {
    return searchableCommands.map((item) => ({
      command: `/${item.name}`,
      description: item.description,
      matchScore: 50,
    }));
  }
  
  // 精确前缀匹配优先
  const prefixMatches = searchableCommands.filter(
    (cmd) => cmd.name.startsWith(query) || cmd.aliases.some((a) => a.startsWith(query))
  );
  
  if (prefixMatches.length > 0) {
    return prefixMatches.map((item) => ({
      command: `/${item.name}`,
      description: item.description,
      matchScore: 90,
    }));
  }
  
  // 使用 Fuse.js 模糊匹配
  const fuse = new Fuse(searchableCommands, {
    keys: [
      { name: 'name', weight: 3 },
      { name: 'aliases', weight: 2.5 },
      { name: 'description', weight: 0.5 },
    ],
    threshold: 0.4,
    includeScore: true,
    ignoreLocation: true,
    minMatchCharLength: 1,
  });
  
  const results = fuse.search(query);
  
  return results
    .map((result) => ({
      command: `/${result.item.name}`,
      description: result.item.description,
      matchScore: Math.round((1 - (result.score ?? 1)) * 100),
    }))
    .filter((s) => (s.matchScore || 0) >= 40);
}

/**
 * 获取命令自动补全建议
 */
export function getCommandCompletions(partialInput: string): CommandSuggestion[] {
  if (!partialInput.startsWith('/')) {
    return [];
  }
  
  const query = partialInput.slice(1).toLowerCase();
  
  if (!query) {
    // 返回所有命令
    return Object.values(commandRegistry).map((cmd) => ({
      command: `/${cmd.name}`,
      description: cmd.description,
      matchScore: 50,
    }));
  }
  
  return getFuzzyCommandSuggestions(query);
}
