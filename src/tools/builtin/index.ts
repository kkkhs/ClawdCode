/**
 * 内置工具导出
 */

// 文件工具
export { readTool } from './read.js';
export { editTool } from './edit.js';
export { writeTool } from './write.js';

// 搜索工具
export { globTool } from './glob.js';
export { grepTool } from './grep.js';

// Shell 工具
export { bashTool } from './bash.js';

import { readTool } from './read.js';
import { editTool } from './edit.js';
import { writeTool } from './write.js';
import { globTool } from './glob.js';
import { grepTool } from './grep.js';
import { bashTool } from './bash.js';
import type { Tool } from '../types.js';

/**
 * 获取所有内置工具
 */
export function getBuiltinTools(): Tool[] {
  return [
    // 文件工具
    readTool,
    editTool,
    writeTool,
    // 搜索工具
    globTool,
    grepTool,
    // Shell 工具
    bashTool,
  ];
}
