/**
 * CustomCommandExecutor - 自定义命令执行器
 * 
 * 处理命令内容的动态替换：
 * - 参数插值 ($ARGUMENTS, $1, $2, ...)
 * - Bash 命令嵌入 (!`command`)
 * - 文件引用 (@path/to/file)
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { CustomCommand, CustomCommandExecutionContext } from '../types.js';

/**
 * 自定义命令执行器
 */
export class CustomCommandExecutor {
  /**
   * 执行自定义命令
   * 
   * 处理顺序：
   * 1. 参数插值
   * 2. Bash 命令嵌入执行
   * 3. 文件引用替换
   */
  async execute(
    command: CustomCommand,
    context: CustomCommandExecutionContext
  ): Promise<string> {
    let content = command.content;

    // 1. 参数插值
    content = this.interpolateArgs(content, context.args);

    // 2. Bash 嵌入执行
    content = await this.executeBashEmbeds(content, context);

    // 3. 文件引用替换
    content = await this.resolveFileReferences(content, context.workspaceRoot);

    return content;
  }

  /**
   * 参数插值
   * 
   * 支持：
   * - $ARGUMENTS - 全部参数（空格连接）
   * - $1, $2, ..., $9 - 位置参数
   */
  private interpolateArgs(content: string, args: string[]): string {
    // 替换 $ARGUMENTS
    content = content.replace(/\$ARGUMENTS/g, args.join(' '));

    // 替换 $1, $2, ... $9（从大到小避免 $1 匹配 $10 的问题）
    for (let i = 9; i >= 1; i--) {
      content = content.split(`$${i}`).join(args[i - 1] ?? '');
    }

    return content;
  }

  /**
   * 执行 Bash 嵌入
   * 
   * 语法：!`command`
   * - 命令在工作目录执行
   * - 30 秒超时
   * - 失败时显示错误信息
   */
  private async executeBashEmbeds(
    content: string,
    context: CustomCommandExecutionContext
  ): Promise<string> {
    const regex = /!`([^`]+)`/g;
    let result = content;

    for (const match of content.matchAll(regex)) {
      const command = match[1];
      
      try {
        // 检查中断信号
        if (context.signal?.aborted) {
          result = result.replace(match[0], '[Aborted]');
          continue;
        }

        const output = execSync(command, {
          cwd: context.workspaceRoot,
          encoding: 'utf-8',
          timeout: 30000, // 30 秒超时
          maxBuffer: 1024 * 1024, // 1MB 输出限制
        }).trim();

        result = result.replace(match[0], output);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        result = result.replace(match[0], `[Error: ${errorMessage}]`);
      }
    }

    return result;
  }

  /**
   * 文件引用替换
   * 
   * 语法：@path/to/file
   * - 路径相对于工作目录
   * - 自动用代码块包裹文件内容
   * - 文件不存在时保留原文
   */
  private async resolveFileReferences(
    content: string,
    workspaceRoot: string
  ): Promise<string> {
    // 匹配 @path/to/file 或 @./relative/path
    const regex = /@([\w./-]+(?:\/[\w./-]+|\.[\w]+))/g;
    let result = content;

    for (const match of content.matchAll(regex)) {
      const relativePath = match[1];
      const filePath = path.resolve(workspaceRoot, relativePath);

      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          const fileContent = fs.readFileSync(filePath, 'utf-8');
          const ext = path.extname(relativePath).slice(1) || 'text';
          
          // 用代码块包裹
          const codeBlock = `\`\`\`${ext}\n${fileContent}\n\`\`\``;
          result = result.replace(match[0], codeBlock);
        }
      } catch {
        // 文件不存在，保留原文
      }
    }

    return result;
  }
}
