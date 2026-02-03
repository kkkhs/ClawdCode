/**
 * Read 工具 - 文件读取
 */

import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { createTool } from '../createTool.js';
import { ToolKind, ToolErrorType } from '../types.js';

/**
 * 默认行数限制
 */
const DEFAULT_LINE_LIMIT = 2000;

/**
 * Read 工具 Schema
 */
const ReadSchema = z.object({
  file_path: z.string()
    .min(1, '文件路径不能为空')
    .describe('The absolute path to the file to read'),
  
  offset: z.number()
    .int()
    .min(0)
    .optional()
    .describe('The line number to start reading from (0-based)'),
  
  limit: z.number()
    .int()
    .min(1)
    .max(10000)
    .optional()
    .describe('The number of lines to read'),
});

/**
 * Read 工具
 */
export const readTool = createTool({
  name: 'Read',
  displayName: 'File Read',
  kind: ToolKind.ReadOnly,
  schema: ReadSchema,

  description: {
    short: 'Reads a file from the local filesystem',
    long: `Reads a file from the local filesystem. You can access any file directly by using this tool.
If the User provides a path to a file assume that path is valid.`,
    usageNotes: [
      'The file_path parameter must be an absolute path, not a relative path',
      `By default, it reads up to ${DEFAULT_LINE_LIMIT} lines starting from the beginning`,
      'You can optionally specify a line offset and limit for long files',
      'Lines in the output are numbered starting at 1',
      'You can call multiple Read tools in parallel to read multiple files at once',
    ],
    examples: [
      {
        description: 'Read entire file',
        params: { file_path: '/path/to/file.ts' },
      },
      {
        description: 'Read with offset and limit',
        params: { file_path: '/path/to/file.ts', offset: 100, limit: 50 },
      },
    ],
    important: [
      'file_path must be an absolute path',
      'Prefer reading the whole file by not providing offset/limit',
    ],
  },

  category: '文件操作',
  tags: ['file', 'read', 'io'],

  async execute(params, context) {
    const { file_path, offset = 0, limit } = params;
    const effectiveLimit = limit ?? DEFAULT_LINE_LIMIT;

    try {
      // 检查文件是否存在
      try {
        await fs.access(file_path);
      } catch {
        return {
          success: false,
          llmContent: `File not found: ${file_path}`,
          displayContent: `❌ 文件不存在: ${file_path}`,
          error: {
            type: ToolErrorType.EXECUTION_ERROR,
            message: 'File not found',
          },
        };
      }

      // 获取文件信息
      const stat = await fs.stat(file_path);
      
      // 检查是否为目录
      if (stat.isDirectory()) {
        return {
          success: false,
          llmContent: `Path is a directory, not a file: ${file_path}`,
          displayContent: `❌ 路径是目录而非文件: ${file_path}`,
          error: {
            type: ToolErrorType.VALIDATION_ERROR,
            message: 'Path is a directory',
          },
        };
      }

      // 读取文件内容
      const content = await fs.readFile(file_path, 'utf-8');
      const lines = content.split('\n');
      const totalLines = lines.length;

      // 应用 offset 和 limit
      const selectedLines = lines.slice(offset, offset + effectiveLimit);
      
      // 格式化输出（带行号）
      const formattedContent = selectedLines
        .map((line, i) => {
          const lineNum = (offset + i + 1).toString().padStart(6, ' ');
          return `${lineNum}|${line}`;
        })
        .join('\n');

      // 计算是否有更多内容
      const hasMore = offset + effectiveLimit < totalLines;
      const fileName = path.basename(file_path);

      // 构建摘要信息
      let summary = `✅ 读取文件: ${fileName}`;
      if (offset > 0 || limit) {
        summary += ` (行 ${offset + 1}-${Math.min(offset + effectiveLimit, totalLines)}/${totalLines})`;
      } else {
        summary += ` (${totalLines} 行)`;
      }
      if (hasMore) {
        summary += ` [还有更多...]`;
      }

      return {
        success: true,
        llmContent: formattedContent,
        displayContent: summary,
        metadata: {
          file_path,
          total_lines: totalLines,
          lines_read: selectedLines.length,
          offset,
          has_more: hasMore,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      return {
        success: false,
        llmContent: `Failed to read file: ${errorMessage}`,
        displayContent: `❌ 读取文件失败: ${errorMessage}`,
        error: {
          type: ToolErrorType.EXECUTION_ERROR,
          message: errorMessage,
        },
      };
    }
  },
});
