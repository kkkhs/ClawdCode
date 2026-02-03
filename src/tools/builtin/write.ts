/**
 * Write 工具
 * 
 * 写入/覆盖文件内容
 */

import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { createTool } from '../createTool.js';
import { ToolKind, ToolErrorType } from '../types.js';

// ========== Schema 定义 ==========

const WriteSchema = z.object({
  file_path: z.string()
    .min(1, '文件路径不能为空')
    .describe('The absolute path to the file to write'),
  contents: z.string()
    .describe('The contents to write to the file'),
});

// ========== Write 工具 ==========

export const writeTool = createTool({
  name: 'Write',
  displayName: 'File Write',
  kind: ToolKind.Write,
  schema: WriteSchema,
  
  description: {
    short: 'Writes a file to the local filesystem',
    long: 'Creates a new file or overwrites an existing file with the specified contents.',
    usageNotes: [
      'This tool will overwrite the existing file if there is one at the provided path',
      'ALWAYS prefer editing existing files in the codebase using Edit tool',
      'NEVER write new files unless explicitly required',
      'NEVER proactively create documentation files (*.md) or README files',
      'Parent directories will be created automatically if they do not exist',
    ],
    examples: [
      {
        description: 'Create a new TypeScript file',
        params: {
          file_path: '/path/to/new-file.ts',
          contents: 'export const hello = "world";',
        },
      },
    ],
    important: [
      'Only create files that are absolutely necessary',
      'Do not create README or documentation files unless explicitly requested',
    ],
  },

  category: '文件操作',
  tags: ['file', 'io', 'write', 'create'],

  // 提取签名内容（用于权限规则）
  extractSignatureContent: (params: unknown) => {
    const p = params as { file_path: string };
    return p.file_path;
  },

  // 抽象权限规则
  abstractPermissionRule: (params: unknown) => {
    const p = params as { file_path: string };
    const dir = path.dirname(p.file_path);
    return `Write:${dir}/*`;
  },

  async execute(params, context) {
    const { file_path, contents } = params;

    try {
      // 1. 检查目标是否是目录
      try {
        const stat = await fs.stat(file_path);
        if (stat.isDirectory()) {
          return {
            success: false,
            llmContent: `Error: ${file_path} is a directory, cannot write to it`,
            displayContent: `❌ 错误: ${file_path} 是目录`,
            error: {
              type: ToolErrorType.VALIDATION_ERROR,
              message: 'Path is a directory',
            },
          };
        }
      } catch {
        // 文件不存在，这是允许的
      }

      // 2. 确保父目录存在
      const dir = path.dirname(file_path);
      await fs.mkdir(dir, { recursive: true });

      // 3. TODO: 创建快照（如果文件存在）
      // 目前跳过，后续实现

      // 4. 写入文件
      await fs.writeFile(file_path, contents, 'utf8');

      // 5. 计算写入信息
      const lines = contents.split('\n').length;
      const bytes = Buffer.byteLength(contents, 'utf8');

      return {
        success: true,
        llmContent: `Successfully wrote to ${file_path} (${lines} lines, ${bytes} bytes)`,
        displayContent: `✅ 文件已写入: ${file_path} (${lines} 行)`,
        metadata: {
          file_path,
          lines,
          bytes,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      return {
        success: false,
        llmContent: `Error writing file: ${errorMessage}`,
        displayContent: `❌ 写入文件失败: ${errorMessage}`,
        error: {
          type: ToolErrorType.EXECUTION_ERROR,
          message: errorMessage,
        },
      };
    }
  },
});
