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
