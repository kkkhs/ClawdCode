/**
 * 工具参数验证 Schema
 * 
 * 使用 Zod 定义通用的参数验证模式
 */

import { z } from 'zod';

/**
 * 工具参数 Schema 集合
 */
export const ToolSchemas = {
  /**
   * 文件路径验证
   */
  filePath: (options?: { description?: string }) =>
    z.string()
      .min(1, '文件路径不能为空')
      .describe(options?.description || '文件路径'),

  /**
   * 绝对路径验证
   */
  absolutePath: (options?: { description?: string }) =>
    z.string()
      .min(1, '路径不能为空')
      .refine(
        (path) => path.startsWith('/') || path.startsWith('~'),
        '必须是绝对路径（以 / 或 ~ 开头）'
      )
      .describe(options?.description || '绝对路径'),

  /**
   * 行号验证
   */
  lineNumber: (options?: { description?: string }) =>
    z.number()
      .int('必须是整数')
      .min(0, '行号不能为负')
      .describe(options?.description || '行号（从 0 开始）'),

  /**
   * 行数限制
   */
  lineLimit: (options?: { description?: string; max?: number }) =>
    z.number()
      .int('必须是整数')
      .min(1, '至少读取 1 行')
      .max(options?.max || 10000, `最多读取 ${options?.max || 10000} 行`)
      .describe(options?.description || '读取行数'),

  /**
   * 编码格式
   */
  encoding: () =>
    z.enum(['utf8', 'utf-8', 'ascii', 'base64', 'binary', 'hex'])
      .default('utf8')
      .describe('文件编码格式'),

  /**
   * Glob 模式
   */
  globPattern: (options?: { description?: string }) =>
    z.string()
      .min(1, '模式不能为空')
      .describe(options?.description || 'Glob 匹配模式'),

  /**
   * 正则表达式模式
   */
  regexPattern: (options?: { description?: string }) =>
    z.string()
      .min(1, '模式不能为空')
      .describe(options?.description || '正则表达式模式'),

  /**
   * 命令验证
   */
  command: (options?: { description?: string }) =>
    z.string()
      .min(1, '命令不能为空')
      .describe(options?.description || 'Shell 命令'),

  /**
   * 超时时间（毫秒）
   */
  timeout: (options?: { max?: number; default?: number }) =>
    z.number()
      .int()
      .min(0)
      .max(options?.max || 600000)
      .default(options?.default || 30000)
      .describe('超时时间（毫秒）'),

  /**
   * 布尔值（带默认值）
   */
  booleanWithDefault: (defaultValue: boolean, description?: string) =>
    z.boolean()
      .default(defaultValue)
      .describe(description || '布尔选项'),
};

/**
 * 创建可选的 Schema
 */
export function optional<T extends z.ZodType>(schema: T): z.ZodOptional<T> {
  return schema.optional();
}
