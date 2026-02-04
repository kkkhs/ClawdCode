/**
 * 文件分析器
 * 
 * 分析对话中提到的重要文件
 */

import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import type { Message } from '../agent/types.js';
import type { FileReference, FileContent } from './types.js';

export class FileAnalyzer {
  /** 最多包含的文件数量 */
  private static readonly MAX_FILES = 5;
  /** 单个文件最大行数 */
  private static readonly MAX_LINES_PER_FILE = 1000;
  /** 单个文件最大字符数 */
  private static readonly MAX_CHARS_PER_FILE = 50000;

  /**
   * 分析消息中提到的文件
   */
  static analyzeFiles(messages: Message[]): FileReference[] {
    const fileMap = new Map<string, FileReference>();

    messages.forEach((msg, index) => {
      // 从消息内容中提取文件路径
      if (msg.content) {
        const content = typeof msg.content === 'string' 
          ? msg.content 
          : JSON.stringify(msg.content);
        const contentFiles = this.extractFilePathsFromContent(content);
        contentFiles.forEach(filePath => {
          this.updateFileReference(fileMap, filePath, index, false);
        });
      }

      // 从工具调用中提取文件路径
      if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
        for (const call of msg.tool_calls) {
          const toolFiles = this.extractFilePathsFromToolCall(call);
          const wasModified = ['Write', 'Edit'].includes(call.function?.name || '');
          toolFiles.forEach(filePath => {
            this.updateFileReference(fileMap, filePath, index, wasModified);
          });
        }
      }
    });

    // 按重要性排序：1. 是否被修改 2. 提及次数 3. 最近度
    return Array.from(fileMap.values())
      .filter(ref => this.isValidFilePath(ref.path))
      .sort((a, b) => {
        if (a.wasModified !== b.wasModified) return a.wasModified ? -1 : 1;
        if (a.mentions !== b.mentions) return b.mentions - a.mentions;
        return b.lastMentioned - a.lastMentioned;
      })
      .slice(0, this.MAX_FILES);
  }

  /**
   * 从消息内容中提取文件路径
   */
  private static extractFilePathsFromContent(content: string): string[] {
    const paths: string[] = [];

    // 匹配常见的文件路径模式
    const patterns = [
      // 绝对路径
      /(?:^|\s|["'`])(\/?(?:[\w.-]+\/)+[\w.-]+\.[a-zA-Z]{1,10})(?:\s|$|["'`]|:)/gm,
      // 相对路径 ./path/to/file.ext
      /(?:^|\s|["'`])(\.\/(?:[\w.-]+\/)*[\w.-]+\.[a-zA-Z]{1,10})(?:\s|$|["'`]|:)/gm,
      // 代码块中的文件路径 ```12:15:path/to/file.ts
      /```\d+:\d+:([\w./-]+)/gm,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const filePath = match[1];
        if (filePath && !paths.includes(filePath)) {
          paths.push(filePath);
        }
      }
    }

    return paths;
  }

  /**
   * 从工具调用中提取文件路径
   */
  private static extractFilePathsFromToolCall(
    toolCall: { function?: { name?: string; arguments?: string } }
  ): string[] {
    const paths: string[] = [];

    const functionName = toolCall.function?.name;
    let args: Record<string, unknown> = {};

    try {
      if (typeof toolCall.function?.arguments === 'string') {
        args = JSON.parse(toolCall.function.arguments);
      } else if (toolCall.function?.arguments) {
        args = toolCall.function.arguments as Record<string, unknown>;
      }
    } catch {
      return paths;
    }

    // 文件操作工具
    const fileTools = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'NotebookEdit'];

    if (fileTools.includes(functionName || '')) {
      const pathKeys = ['file_path', 'path', 'notebook_path', 'filePath'];
      for (const key of pathKeys) {
        if (args[key] && typeof args[key] === 'string') {
          paths.push(args[key] as string);
        }
      }
    }

    return paths;
  }

  /**
   * 更新文件引用信息
   */
  private static updateFileReference(
    fileMap: Map<string, FileReference>,
    filePath: string,
    messageIndex: number,
    wasModified: boolean
  ): void {
    const existing = fileMap.get(filePath);

    if (existing) {
      existing.mentions++;
      existing.lastMentioned = Math.max(existing.lastMentioned, messageIndex);
      existing.wasModified = existing.wasModified || wasModified;
    } else {
      fileMap.set(filePath, {
        path: filePath,
        mentions: 1,
        lastMentioned: messageIndex,
        wasModified,
      });
    }
  }

  /**
   * 验证文件路径是否有效
   */
  private static isValidFilePath(filePath: string): boolean {
    // 排除常见的非文件路径
    const excludePatterns = [
      /^https?:\/\//,  // URL
      /^node_modules\//,  // node_modules
      /^\.git\//,  // git 目录
      /\.(png|jpg|jpeg|gif|svg|ico|webp|mp4|mp3|wav|pdf|zip|tar|gz)$/i,  // 二进制文件
    ];

    for (const pattern of excludePatterns) {
      if (pattern.test(filePath)) {
        return false;
      }
    }

    // 检查文件是否存在
    try {
      const absolutePath = path.isAbsolute(filePath) 
        ? filePath 
        : path.join(process.cwd(), filePath);
      return existsSync(absolutePath);
    } catch {
      return false;
    }
  }

  /**
   * 读取文件内容
   */
  static async readFilesContent(filePaths: string[]): Promise<FileContent[]> {
    const results: FileContent[] = [];

    for (const filePath of filePaths) {
      try {
        const absolutePath = path.isAbsolute(filePath) 
          ? filePath 
          : path.join(process.cwd(), filePath);

        if (!existsSync(absolutePath)) {
          continue;
        }

        const content = await fs.readFile(absolutePath, 'utf-8');
        const lines = content.split('\n');
        
        let truncated = false;
        let finalContent = content;

        // 检查行数限制
        if (lines.length > this.MAX_LINES_PER_FILE) {
          finalContent = lines.slice(0, this.MAX_LINES_PER_FILE).join('\n');
          truncated = true;
        }

        // 检查字符数限制
        if (finalContent.length > this.MAX_CHARS_PER_FILE) {
          finalContent = finalContent.substring(0, this.MAX_CHARS_PER_FILE);
          truncated = true;
        }

        if (truncated) {
          finalContent += '\n\n[... 内容已截断 ...]';
        }

        results.push({
          path: filePath,
          content: finalContent,
          lines: lines.length,
          truncated,
        });
      } catch (error) {
        console.warn(`[FileAnalyzer] 读取文件失败: ${filePath}`, error);
      }
    }

    return results;
  }

  /**
   * 获取文件摘要信息
   */
  static async getFileSummary(filePath: string): Promise<string | null> {
    try {
      const absolutePath = path.isAbsolute(filePath) 
        ? filePath 
        : path.join(process.cwd(), filePath);

      if (!existsSync(absolutePath)) {
        return null;
      }

      const stats = await fs.stat(absolutePath);
      const content = await fs.readFile(absolutePath, 'utf-8');
      const lines = content.split('\n');

      return `文件: ${filePath}
大小: ${this.formatFileSize(stats.size)}
行数: ${lines.length}
最后修改: ${stats.mtime.toISOString()}`;
    } catch {
      return null;
    }
  }

  /**
   * 格式化文件大小
   */
  private static formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
