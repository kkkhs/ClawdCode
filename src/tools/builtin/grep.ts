/**
 * Grep 工具 - 内容搜索
 */

import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import { z } from 'zod';
import { createTool } from '../createTool.js';
import { ToolKind, ToolErrorType } from '../types.js';

/**
 * 默认忽略模式
 */
const DEFAULT_IGNORE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/coverage/**',
  '**/*.min.js',
  '**/*.bundle.js',
];

/**
 * 最大结果数
 */
const MAX_RESULTS = 100;

/**
 * Grep 工具 Schema
 */
const GrepSchema = z.object({
  pattern: z.string()
    .min(1, '搜索模式不能为空')
    .describe('The regular expression pattern to search for'),
  
  path: z.string()
    .optional()
    .describe('Directory to search in (defaults to current working directory)'),
  
  include: z.string()
    .optional()
    .describe('Glob pattern to filter files (e.g., "*.ts" for TypeScript files)'),
  
  case_sensitive: z.boolean()
    .default(true)
    .describe('Whether the search is case sensitive'),
});

/**
 * 搜索结果
 */
interface SearchMatch {
  file: string;
  line: number;
  content: string;
}

/**
 * 在文件中搜索
 */
async function searchInFile(
  filePath: string,
  regex: RegExp
): Promise<SearchMatch[]> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const matches: SearchMatch[] = [];

    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        matches.push({
          file: filePath,
          line: i + 1,
          content: lines[i].trim(),
        });
      }
    }

    return matches;
  } catch {
    // 忽略无法读取的文件
    return [];
  }
}

/**
 * Grep 工具
 */
export const grepTool = createTool({
  name: 'Grep',
  displayName: 'Content Search',
  kind: ToolKind.ReadOnly,
  schema: GrepSchema,

  description: {
    short: 'Search file contents using regular expressions',
    long: `A powerful search tool for finding patterns in file contents.
Supports full regex syntax and can filter files by glob pattern.`,
    usageNotes: [
      'Uses JavaScript regex syntax',
      'Common patterns: "function\\s+\\w+" for function definitions',
      'Use include parameter to filter files: "*.ts" for TypeScript only',
      'Results are limited to 100 matches for performance',
      'Automatically ignores node_modules, .git, dist directories',
    ],
    examples: [
      {
        description: 'Search for function definitions',
        params: { pattern: 'function\\s+\\w+' },
      },
      {
        description: 'Search in TypeScript files only',
        params: { pattern: 'export', include: '*.ts' },
      },
      {
        description: 'Case-insensitive search',
        params: { pattern: 'todo', case_sensitive: false },
      },
    ],
  },

  category: '搜索',
  tags: ['search', 'grep', 'regex'],

  async execute(params, context) {
    const { pattern, path: searchPath, include, case_sensitive } = params;
    
    // 默认搜索目录
    const cwd = searchPath || context?.cwd || process.cwd();

    try {
      // 创建正则表达式
      let regex: RegExp;
      try {
        regex = new RegExp(pattern, case_sensitive ? 'g' : 'gi');
      } catch (e) {
        return {
          success: false,
          llmContent: `Invalid regex pattern: ${pattern}`,
          displayContent: `❌ 无效的正则表达式: ${pattern}`,
          error: {
            type: ToolErrorType.VALIDATION_ERROR,
            message: 'Invalid regex pattern',
          },
        };
      }

      // 获取要搜索的文件列表
      const filePattern = include 
        ? (include.startsWith('**/') ? include : `**/${include}`)
        : '**/*';
      
      const files = await glob(filePattern, {
        cwd,
        ignore: DEFAULT_IGNORE,
        nodir: true,
        absolute: true,
      });

      // 过滤二进制文件（简单判断）
      const textExtensions = [
        '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
        '.json', '.md', '.txt', '.yaml', '.yml',
        '.html', '.css', '.scss', '.less',
        '.py', '.rb', '.go', '.rs', '.java',
        '.c', '.cpp', '.h', '.hpp',
        '.sh', '.bash', '.zsh',
        '.xml', '.svg',
      ];
      
      const textFiles = files.filter(f => 
        textExtensions.some(ext => f.endsWith(ext))
      );

      // 搜索所有文件
      const allMatches: SearchMatch[] = [];
      
      for (const file of textFiles) {
        if (allMatches.length >= MAX_RESULTS) break;
        
        const matches = await searchInFile(file, regex);
        allMatches.push(...matches);
        
        if (allMatches.length >= MAX_RESULTS) {
          allMatches.length = MAX_RESULTS;
          break;
        }
      }

      if (allMatches.length === 0) {
        return {
          success: true,
          llmContent: 'No matches found.',
          displayContent: `🔍 未找到匹配内容: ${pattern}`,
          metadata: {
            pattern,
            cwd,
            files_searched: textFiles.length,
            matches: 0,
          },
        };
      }

      // 格式化输出
      const formattedMatches = allMatches
        .map(m => {
          const relPath = path.relative(cwd, m.file);
          return `${relPath}:${m.line}: ${m.content}`;
        })
        .join('\n');

      const truncated = allMatches.length >= MAX_RESULTS;
      let summary = `✅ 找到 ${allMatches.length} 个匹配`;
      if (truncated) {
        summary += ` (已截断，可能有更多)`;
      }

      return {
        success: true,
        llmContent: formattedMatches,
        displayContent: summary,
        metadata: {
          pattern,
          cwd,
          files_searched: textFiles.length,
          matches: allMatches.length,
          truncated,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      return {
        success: false,
        llmContent: `Grep search failed: ${errorMessage}`,
        displayContent: `❌ 搜索失败: ${errorMessage}`,
        error: {
          type: ToolErrorType.EXECUTION_ERROR,
          message: errorMessage,
        },
      };
    }
  },
});
