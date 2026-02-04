# 第六章：工具系统设计与实现

> **学习目标**：设计和实现完整的工具系统，包括类型定义、工具工厂、内置工具和注册表
> 
> **预计阅读时间**：60 分钟
> 
> **实践时间**：90 分钟
> 
> **前置要求**：已完成第五章的代码实现

---

## 6.1 工具系统概述

### 6.1.1 什么是工具

工具（Tool）是 Agent 与外部世界交互的桥梁：

```
LLM 推理 → 工具调用 → 工具系统 → 文件系统/Shell/网络
                              ↓
                         返回结果 → LLM
```

工具让 LLM 能够：
- 读取和修改文件
- 执行 Shell 命令
- 搜索代码库
- 获取网页内容

### 6.1.2 工具系统架构

```
src/tools/
├── types.ts          # 类型定义 (ToolKind, Tool, ToolResult)
├── createTool.ts     # 工具工厂函数
├── registry.ts       # 工具注册表
├── builtin/          # 内置工具
│   ├── read.ts       # 文件读取
│   ├── edit.ts       # 文件编辑
│   ├── write.ts      # 文件写入
│   ├── glob.ts       # 文件搜索
│   ├── grep.ts       # 内容搜索
│   ├── bash.ts       # Shell 命令
│   └── index.ts      # 导出
└── index.ts          # 模块导出
```

---

## 6.2 工具类型定义

### 6.2.1 创建类型文件

**文件位置**：`src/tools/types.ts`

```typescript
/**
 * 工具系统类型定义
 */

// ========== 工具类型枚举 ==========

/**
 * 工具类型
 * 
 * 决定工具的权限行为：
 * - ReadOnly: 只读操作，无副作用，Plan 模式可用
 * - Write: 文件写入操作，需要确认
 * - Execute: 命令执行，可能有副作用，需要确认
 */
export enum ToolKind {
  /** 只读操作，无副作用 */
  ReadOnly = 'readonly',
  /** 文件写入操作 */
  Write = 'write',
  /** 命令执行，可能有副作用 */
  Execute = 'execute',
}

// ========== 工具描述 ==========

/**
 * 工具示例
 */
export interface ToolExample {
  description: string;
  params: Record<string, unknown>;
}

/**
 * 工具描述
 * 
 * 包含多层次的描述信息，用于：
 * 1. LLM 理解工具用途（short, long）
 * 2. 帮助 LLM 正确使用（usageNotes, examples）
 * 3. 强调重要规则（important）
 */
export interface ToolDescription {
  /** 简短描述（一行），用于函数声明 */
  short: string;
  /** 详细说明 */
  long?: string;
  /** 使用注意事项 */
  usageNotes?: string[];
  /** 使用示例 */
  examples?: ToolExample[];
  /** 重要提示（会被强调） */
  important?: string[];
}

// ========== 工具错误 ==========

/**
 * 工具错误类型
 */
export enum ToolErrorType {
  /** 参数验证错误 */
  VALIDATION_ERROR = 'validation_error',
  /** 执行错误 */
  EXECUTION_ERROR = 'execution_error',
  /** 权限错误 */
  PERMISSION_ERROR = 'permission_error',
  /** 超时错误 */
  TIMEOUT_ERROR = 'timeout_error',
  /** 未知错误 */
  UNKNOWN_ERROR = 'unknown_error',
}

/**
 * 工具错误
 */
export interface ToolError {
  type: ToolErrorType;
  message: string;
  details?: unknown;
}

// ========== 工具结果 ==========

/**
 * 工具执行结果
 * 
 * 关键设计：llmContent vs displayContent 分离
 * - llmContent: 传递给 LLM 的完整内容（可能很长）
 * - displayContent: 显示给用户的简洁摘要
 * 
 * 例如：读取 1000 行文件
 * - llmContent: 完整的 1000 行内容
 * - displayContent: "✅ 读取成功 (1000 行)"
 */
export interface ToolResult {
  /** 执行是否成功 */
  success: boolean;
  /** 传递给 LLM 的内容（可能很长） */
  llmContent: string;
  /** 显示给用户的内容（简洁摘要） */
  displayContent: string;
  /** 错误信息 */
  error?: ToolError;
  /** 额外元数据 */
  metadata?: Record<string, unknown>;
}

// ========== 执行上下文 ==========

/**
 * 工具执行上下文
 */
export interface ExecutionContext {
  /** 会话 ID */
  sessionId?: string;
  /** 中断信号 */
  signal?: AbortSignal;
  /** 工作目录 */
  cwd?: string;
}

// ========== 函数声明 ==========

/**
 * LLM 函数声明（OpenAI 格式）
 * 
 * 这是传递给 LLM 的"菜单"，让 LLM 知道有哪些工具可用
 */
export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// ========== 工具调用 ==========

/**
 * 工具调用实例
 */
export interface ToolInvocation<TParams = unknown> {
  /** 工具名称 */
  toolName: string;
  /** 参数 */
  params: TParams;
  /** 调用 ID */
  callId?: string;
}

// ========== 工具接口 ==========

/**
 * 工具接口
 * 
 * 完整的工具定义，包含：
 * - 元数据（名称、类型、描述等）
 * - 核心方法（获取声明、构建实例、执行）
 * - 权限相关（签名提取、规则抽象）
 */
export interface Tool<TParams = unknown> {
  // === 基本信息 ===
  /** 工具唯一名称 */
  readonly name: string;
  /** 显示名称 */
  readonly displayName: string;
  /** 工具类型 */
  readonly kind: ToolKind;
  /** 是否只读 */
  readonly isReadOnly: boolean;
  /** 是否并发安全 */
  readonly isConcurrencySafe: boolean;
  /** 是否启用结构化输出 */
  readonly strict: boolean;
  /** 工具描述 */
  readonly description: ToolDescription;
  /** 版本 */
  readonly version: string;
  /** 分类 */
  readonly category?: string;
  /** 标签 */
  readonly tags: string[];

  // === 核心方法 ===
  /** 生成 LLM 函数声明 */
  getFunctionDeclaration(): FunctionDeclaration;
  /** 构建执行实例 */
  build(params: TParams): ToolInvocation<TParams>;
  /** 执行工具 */
  execute(params: TParams, context?: ExecutionContext): Promise<ToolResult>;

  // === 权限相关（可选） ===
  /** 提取签名内容（用于权限规则） */
  extractSignatureContent?: (params: unknown) => string;
  /** 抽象权限规则（用于权限匹配） */
  abstractPermissionRule?: (params: unknown) => string;
}
```

**代码说明**：

| 类型 | 用途 |
|------|------|
| `ToolKind` | 区分工具类型，用于权限控制 |
| `ToolDescription` | 多层次描述，帮助 LLM 正确使用 |
| `ToolResult` | 分离 LLM 内容和用户显示 |
| `Tool` | 完整的工具接口定义 |

---

## 6.3 工具工厂函数

### 6.3.1 使用 Zod 定义参数

为什么使用 Zod？

```typescript
const schema = z.object({ file_path: z.string() });

// Zod 一石三鸟：
// 1. TypeScript 类型推断
type Params = z.infer<typeof schema>;  // { file_path: string }

// 2. 运行时参数验证
schema.parse({ file_path: '/path' });  // 验证通过
schema.parse({ file_path: 123 });      // 抛出 ZodError

// 3. 自动生成 JSON Schema（传递给 LLM）
zodToJsonSchema(schema);  // { type: 'object', properties: {...} }
```

### 6.3.2 创建工厂函数

**文件位置**：`src/tools/createTool.ts`

```typescript
/**
 * 工具工厂函数
 * 
 * 使用 Zod Schema 创建类型安全的工具
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  ToolErrorType,
  type Tool,
  type ToolKind,
  type ToolDescription,
  type ToolResult,
  type ExecutionContext,
  type FunctionDeclaration,
  type ToolInvocation,
} from './types.js';

// ========== 配置类型 ==========

/**
 * 工具配置
 */
export interface ToolConfig<TSchema extends z.ZodType> {
  /** 工具唯一名称 */
  name: string;
  /** 显示名称 */
  displayName?: string;
  /** 工具类型 */
  kind: ToolKind;
  /** 参数 Schema */
  schema: TSchema;
  /** 工具描述 */
  description: ToolDescription;
  /** 执行函数 */
  execute: (
    params: z.infer<TSchema>,
    context?: ExecutionContext
  ) => Promise<ToolResult>;
  /** 版本 */
  version?: string;
  /** 分类 */
  category?: string;
  /** 标签 */
  tags?: string[];
  /** 是否只读（默认根据 kind 推断） */
  isReadOnly?: boolean;
  /** 是否并发安全（默认 true） */
  isConcurrencySafe?: boolean;
  /** 是否启用结构化输出（默认 false） */
  strict?: boolean;
  /** 提取签名内容（用于权限规则） */
  extractSignatureContent?: (params: unknown) => string;
  /** 抽象权限规则（用于权限匹配） */
  abstractPermissionRule?: (params: unknown) => string;
}

// ========== 工厂函数 ==========

/**
 * 创建工具
 * 
 * @example
 * ```typescript
 * const readTool = createTool({
 *   name: 'Read',
 *   kind: ToolKind.ReadOnly,
 *   schema: z.object({
 *     file_path: z.string(),
 *   }),
 *   description: { short: 'Read files' },
 *   execute: async (params) => {
 *     // ...
 *   },
 * });
 * ```
 */
export function createTool<TSchema extends z.ZodType>(
  config: ToolConfig<TSchema>
): Tool<z.infer<TSchema>> {
  const {
    name,
    displayName,
    kind,
    schema,
    description,
    execute,
    version = '1.0.0',
    category,
    tags = [],
    isReadOnly,
    isConcurrencySafe = true,
    strict = false,
    extractSignatureContent,
    abstractPermissionRule,
  } = config;

  // 从 Zod Schema 生成 JSON Schema
  const jsonSchema = zodToJsonSchema(schema, {
    $refStrategy: 'none',
    target: 'openApi3',
  });

  // 提取 properties 和 required
  const schemaObj = jsonSchema as {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };

  return {
    name,
    displayName: displayName || name,
    kind,
    isReadOnly: isReadOnly ?? kind === 'readonly',
    isConcurrencySafe,
    strict,
    description,
    version,
    category,
    tags,

    /**
     * 生成 LLM 函数声明
     */
    getFunctionDeclaration(): FunctionDeclaration {
      return {
        name,
        description: buildFullDescription(description),
        parameters: {
          type: 'object',
          properties: schemaObj.properties || {},
          required: schemaObj.required,
        },
      };
    },

    /**
     * 构建执行实例
     */
    build(params: z.infer<TSchema>): ToolInvocation<z.infer<TSchema>> {
      return {
        toolName: name,
        params,
      };
    },

    /**
     * 执行工具
     */
    async execute(
      params: z.infer<TSchema>,
      context?: ExecutionContext
    ): Promise<ToolResult> {
      try {
        // 验证参数
        const validated = schema.parse(params);
        // 执行工具
        return await execute(validated, context);
      } catch (error) {
        // 处理 Zod 验证错误
        if (error instanceof z.ZodError) {
          const messages = error.errors.map(e => 
            `${e.path.join('.')}: ${e.message}`
          ).join('; ');
          
          return {
            success: false,
            llmContent: `Parameter validation failed: ${messages}`,
            displayContent: `❌ 参数验证失败: ${messages}`,
            error: {
              type: ToolErrorType.VALIDATION_ERROR,
              message: messages,
              details: error.errors,
            },
          };
        }

        // 处理其他错误
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        return {
          success: false,
          llmContent: `Tool execution failed: ${errorMessage}`,
          displayContent: `❌ 执行失败: ${errorMessage}`,
          error: {
            type: ToolErrorType.EXECUTION_ERROR,
            message: errorMessage,
          },
        };
      }
    },

    // 可选方法
    extractSignatureContent,
    abstractPermissionRule,
  };
}

/**
 * 构建完整描述（包含 usageNotes 和 important）
 */
function buildFullDescription(desc: ToolDescription): string {
  const parts: string[] = [desc.short];

  if (desc.long) {
    parts.push(desc.long);
  }

  if (desc.usageNotes && desc.usageNotes.length > 0) {
    parts.push('\nUsage notes:');
    parts.push(...desc.usageNotes.map(note => `- ${note}`));
  }

  if (desc.important && desc.important.length > 0) {
    parts.push('\nIMPORTANT:');
    parts.push(...desc.important.map(note => `- ${note}`));
  }

  return parts.join('\n');
}
```

**代码说明**：

| 函数 | 说明 |
|------|------|
| `createTool` | 使用配置创建工具实例 |
| `buildFullDescription` | 组合多层描述为完整文本 |

---

## 6.4 内置工具实现

### 6.4.1 Read 工具 - 文件读取

**文件位置**：`src/tools/builtin/read.ts`

```typescript
/**
 * Read 工具 - 文件读取
 */

import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { createTool } from '../createTool.js';
import { ToolKind, ToolErrorType } from '../types.js';

/** 默认行数限制 */
const DEFAULT_LINE_LIMIT = 2000;

/** Read 工具 Schema */
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
      // 1. 检查文件是否存在
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

      // 2. 获取文件信息
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

      // 3. 读取文件内容
      const content = await fs.readFile(file_path, 'utf-8');
      const lines = content.split('\n');
      const totalLines = lines.length;

      // 4. 应用 offset 和 limit
      const selectedLines = lines.slice(offset, offset + effectiveLimit);
      
      // 5. 格式化输出（带行号）
      const formattedContent = selectedLines
        .map((line, i) => {
          const lineNum = (offset + i + 1).toString().padStart(6, ' ');
          return `${lineNum}|${line}`;
        })
        .join('\n');

      // 6. 计算是否有更多内容
      const hasMore = offset + effectiveLimit < totalLines;
      const fileName = path.basename(file_path);

      // 7. 构建摘要信息
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
```

### 6.4.2 Edit 工具 - 字符串替换编辑

**文件位置**：`src/tools/builtin/edit.ts`

```typescript
/**
 * Edit 工具
 * 
 * 使用字符串替换方式编辑文件
 * 
 * 设计选择：字符串替换 vs 行号编辑
 * - 字符串替换更可靠（行号可能因并发修改而失效）
 * - 强制唯一性检查，避免误修改
 */

import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { createTool } from '../createTool.js';
import { ToolKind, ToolErrorType } from '../types.js';

const EditSchema = z.object({
  file_path: z.string()
    .min(1, '文件路径不能为空')
    .describe('The absolute path to the file to modify'),
  old_string: z.string()
    .describe('The text to replace (must be unique in the file unless replace_all is true)'),
  new_string: z.string()
    .describe('The text to replace it with'),
  replace_all: z.boolean()
    .default(false)
    .describe('If true, replace all occurrences of old_string'),
});

export const editTool = createTool({
  name: 'Edit',
  displayName: 'File Edit',
  kind: ToolKind.Write,
  schema: EditSchema,
  
  description: {
    short: 'Performs exact string replacements in files',
    long: 'Edits files by replacing specified text with new text. Requires the old_string to be unique unless replace_all is true.',
    usageNotes: [
      'You MUST use the Read tool first before editing a file',
      'The edit will FAIL if old_string is not unique in the file',
      'Use replace_all=true for renaming variables across the file',
      'Preserve exact indentation (tabs/spaces) as it appears',
      'If you want to create a new file, use the Write tool instead',
    ],
    examples: [
      {
        description: 'Replace a function name',
        params: {
          file_path: '/path/to/file.ts',
          old_string: 'function oldName(',
          new_string: 'function newName(',
        },
      },
      {
        description: 'Replace all occurrences of a variable',
        params: {
          file_path: '/path/to/file.ts',
          old_string: 'oldVar',
          new_string: 'newVar',
          replace_all: true,
        },
      },
    ],
    important: [
      'NEVER guess file contents - always Read first',
      'If old_string is not found, the edit will fail',
      'If multiple matches found without replace_all, provide more context',
    ],
  },

  category: '文件操作',
  tags: ['file', 'io', 'write', 'edit'],

  // 提取签名内容（用于权限规则）
  extractSignatureContent: (params: unknown) => {
    const p = params as { file_path: string };
    return p.file_path;
  },

  // 抽象权限规则
  abstractPermissionRule: (params: unknown) => {
    const p = params as { file_path: string };
    const dir = path.dirname(p.file_path);
    return `Edit:${dir}/*`;
  },

  async execute(params, context) {
    const { file_path, old_string, new_string, replace_all } = params;

    try {
      // 1. 检查文件是否存在
      try {
        const stat = await fs.stat(file_path);
        if (stat.isDirectory()) {
          return {
            success: false,
            llmContent: `Error: ${file_path} is a directory, not a file`,
            displayContent: `❌ 错误: ${file_path} 是目录而非文件`,
            error: {
              type: ToolErrorType.VALIDATION_ERROR,
              message: 'Path is a directory',
            },
          };
        }
      } catch (error) {
        return {
          success: false,
          llmContent: `Error: File not found: ${file_path}`,
          displayContent: `❌ 文件不存在: ${file_path}`,
          error: {
            type: ToolErrorType.VALIDATION_ERROR,
            message: 'File not found',
          },
        };
      }

      // 2. 读取文件内容
      const content = await fs.readFile(file_path, 'utf8');

      // 3. old_string 和 new_string 相同检查
      if (old_string === new_string) {
        return {
          success: false,
          llmContent: 'Error: old_string and new_string are identical',
          displayContent: '❌ old_string 和 new_string 相同',
          error: {
            type: ToolErrorType.VALIDATION_ERROR,
            message: 'old_string and new_string are identical',
          },
        };
      }

      // 4. 检查 old_string 是否存在
      const matchCount = content.split(old_string).length - 1;
      
      if (matchCount === 0) {
        return {
          success: false,
          llmContent: `Error: old_string not found in file. Make sure you have read the file first and the content is up to date.`,
          displayContent: `❌ 未找到要替换的内容`,
          error: {
            type: ToolErrorType.VALIDATION_ERROR,
            message: 'old_string not found in file',
          },
        };
      }

      // 5. 多重匹配检查（非 replace_all 模式）
      if (matchCount > 1 && !replace_all) {
        return {
          success: false,
          llmContent: `Error: Multiple matches (${matchCount}) found for old_string. Either:
1. Provide more context in old_string to make it unique
2. Set replace_all=true to replace all occurrences`,
          displayContent: `❌ 找到 ${matchCount} 个匹配，请提供更多上下文或使用 replace_all`,
          error: {
            type: ToolErrorType.VALIDATION_ERROR,
            message: `Multiple matches (${matchCount}) found`,
          },
        };
      }

      // 6. 执行替换
      const newContent = replace_all
        ? content.replaceAll(old_string, new_string)
        : content.replace(old_string, new_string);

      // 7. 写入文件
      await fs.writeFile(file_path, newContent, 'utf8');

      // 8. 计算替换数量
      const replacements = replace_all ? matchCount : 1;

      return {
        success: true,
        llmContent: `Successfully edited ${file_path} (${replacements} replacement${replacements > 1 ? 's' : ''})`,
        displayContent: `✅ 文件已编辑: ${file_path} (${replacements} 处替换)`,
        metadata: {
          file_path,
          replacements,
          old_string_preview: old_string.length > 50 
            ? old_string.substring(0, 50) + '...' 
            : old_string,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      return {
        success: false,
        llmContent: `Error editing file: ${errorMessage}`,
        displayContent: `❌ 编辑文件失败: ${errorMessage}`,
        error: {
          type: ToolErrorType.EXECUTION_ERROR,
          message: errorMessage,
        },
      };
    }
  },
});
```

### 6.4.3 Write 工具 - 文件写入

**文件位置**：`src/tools/builtin/write.ts`

```typescript
/**
 * Write 工具 - 文件写入
 */

import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { createTool } from '../createTool.js';
import { ToolKind, ToolErrorType } from '../types.js';

const WriteSchema = z.object({
  file_path: z.string()
    .min(1, '文件路径不能为空')
    .describe('The absolute path to the file to write'),
  contents: z.string()
    .describe('The contents to write to the file'),
});

export const writeTool = createTool({
  name: 'Write',
  displayName: 'File Write',
  kind: ToolKind.Write,
  schema: WriteSchema,
  
  description: {
    short: 'Writes a file to the local filesystem',
    long: 'Creates or overwrites a file with the specified contents. Use this for creating new files.',
    usageNotes: [
      'This tool will overwrite the existing file if there is one at the provided path',
      'ALWAYS prefer editing existing files in the codebase using Edit tool',
      'NEVER write new files unless explicitly required',
      'NEVER proactively create documentation files (*.md) unless requested',
      'Parent directories will be created automatically if they do not exist',
    ],
    important: [
      'Prefer Edit over Write for modifying existing files',
      'Do not create unnecessary files',
    ],
  },

  category: '文件操作',
  tags: ['file', 'io', 'write'],

  extractSignatureContent: (params: unknown) => {
    const p = params as { file_path: string };
    return p.file_path;
  },

  abstractPermissionRule: (params: unknown) => {
    const p = params as { file_path: string };
    const dir = path.dirname(p.file_path);
    return `Write:${dir}/*`;
  },

  async execute(params, context) {
    const { file_path, contents } = params;

    try {
      // 1. 确保父目录存在
      const dir = path.dirname(file_path);
      await fs.mkdir(dir, { recursive: true });

      // 2. 检查是否是覆盖已有文件
      let isOverwrite = false;
      try {
        await fs.access(file_path);
        isOverwrite = true;
      } catch {
        // 文件不存在，是新建
      }

      // 3. 写入文件
      await fs.writeFile(file_path, contents, 'utf8');

      // 4. 计算行数
      const lineCount = contents.split('\n').length;

      return {
        success: true,
        llmContent: `Successfully ${isOverwrite ? 'overwrote' : 'created'} ${file_path} (${lineCount} lines)`,
        displayContent: `✅ ${isOverwrite ? '覆盖' : '创建'}文件: ${file_path} (${lineCount} 行)`,
        metadata: {
          file_path,
          is_overwrite: isOverwrite,
          line_count: lineCount,
          byte_count: Buffer.byteLength(contents, 'utf8'),
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
```

### 6.4.4 Glob 工具 - 文件搜索

**文件位置**：`src/tools/builtin/glob.ts`

```typescript
/**
 * Glob 工具 - 文件模式匹配搜索
 */

import { glob } from 'glob';
import path from 'path';
import { z } from 'zod';
import { createTool } from '../createTool.js';
import { ToolKind, ToolErrorType } from '../types.js';

const GlobSchema = z.object({
  pattern: z.string()
    .min(1, '模式不能为空')
    .describe('The glob pattern to match files against (e.g., "**/*.ts")'),
  path: z.string()
    .optional()
    .describe('The directory to search in (defaults to current working directory)'),
});

export const globTool = createTool({
  name: 'Glob',
  displayName: 'File Search',
  kind: ToolKind.ReadOnly,
  schema: GlobSchema,
  
  description: {
    short: 'Find files matching a glob pattern',
    long: 'Searches for files matching the specified glob pattern. Fast and efficient for large codebases.',
    usageNotes: [
      'Patterns not starting with "**/" are automatically prepended with "**/"',
      'Returns matching file paths sorted by modification time',
      'Use this tool when you need to find files by name patterns',
    ],
    examples: [
      {
        description: 'Find all TypeScript files',
        params: { pattern: '**/*.ts' },
      },
      {
        description: 'Find all test files',
        params: { pattern: '**/test/*.ts' },
      },
    ],
  },

  category: '搜索',
  tags: ['search', 'file', 'glob'],

  async execute(params, context) {
    const { pattern, path: searchPath } = params;
    const cwd = searchPath || context?.cwd || process.cwd();

    try {
      // 执行 glob 搜索
      const files = await glob(pattern, {
        cwd,
        nodir: true,
        ignore: ['**/node_modules/**', '**/.git/**'],
      });

      // 格式化结果
      const fileList = files.map(f => path.relative(cwd, path.join(cwd, f)));

      if (fileList.length === 0) {
        return {
          success: true,
          llmContent: `No files found matching pattern: ${pattern}`,
          displayContent: `⚠️ 未找到匹配 "${pattern}" 的文件`,
          metadata: { pattern, count: 0 },
        };
      }

      return {
        success: true,
        llmContent: fileList.join('\n'),
        displayContent: `✅ 找到 ${fileList.length} 个文件`,
        metadata: {
          pattern,
          count: fileList.length,
          cwd,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      return {
        success: false,
        llmContent: `Glob search failed: ${errorMessage}`,
        displayContent: `❌ 搜索失败: ${errorMessage}`,
        error: {
          type: ToolErrorType.EXECUTION_ERROR,
          message: errorMessage,
        },
      };
    }
  },
});
```

### 6.4.5 Grep 工具 - 内容搜索

**文件位置**：`src/tools/builtin/grep.ts`

```typescript
/**
 * Grep 工具 - 文件内容搜索
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';
import { createTool } from '../createTool.js';
import { ToolKind, ToolErrorType } from '../types.js';

const execAsync = promisify(exec);

const GrepSchema = z.object({
  pattern: z.string()
    .min(1, '搜索模式不能为空')
    .describe('The regular expression pattern to search for'),
  path: z.string()
    .optional()
    .describe('The directory or file to search in'),
  include: z.string()
    .optional()
    .describe('File pattern to include (e.g., "*.ts")'),
});

export const grepTool = createTool({
  name: 'Grep',
  displayName: 'Content Search',
  kind: ToolKind.ReadOnly,
  schema: GrepSchema,
  
  description: {
    short: 'Search file contents using regex',
    long: 'A powerful search tool built on ripgrep for fast content searching.',
    usageNotes: [
      'Supports full regex syntax',
      'Use include parameter to filter by file type',
      'Results are capped to prevent overwhelming output',
      'Prefer this over bash grep for better performance',
    ],
    examples: [
      {
        description: 'Search for a function',
        params: { pattern: 'function\\s+\\w+' },
      },
      {
        description: 'Search in TypeScript files only',
        params: { pattern: 'import', include: '*.ts' },
      },
    ],
  },

  category: '搜索',
  tags: ['search', 'grep', 'regex'],

  async execute(params, context) {
    const { pattern, path: searchPath, include } = params;
    const cwd = searchPath || context?.cwd || process.cwd();

    try {
      // 构建 ripgrep 命令
      let cmd = `rg --line-number --no-heading "${pattern}"`;
      if (include) {
        cmd += ` --glob "${include}"`;
      }
      cmd += ` --max-count 100`; // 限制结果数量

      const { stdout, stderr } = await execAsync(cmd, {
        cwd,
        maxBuffer: 5 * 1024 * 1024, // 5MB
      });

      const lines = stdout.trim().split('\n').filter(Boolean);

      if (lines.length === 0) {
        return {
          success: true,
          llmContent: `No matches found for pattern: ${pattern}`,
          displayContent: `⚠️ 未找到匹配 "${pattern}" 的内容`,
          metadata: { pattern, count: 0 },
        };
      }

      return {
        success: true,
        llmContent: stdout,
        displayContent: `✅ 找到 ${lines.length} 处匹配`,
        metadata: {
          pattern,
          count: lines.length,
        },
      };
    } catch (error: unknown) {
      // ripgrep 在没有匹配时返回 exit code 1
      const execError = error as { code?: number; stdout?: string };
      if (execError.code === 1 && !execError.stdout) {
        return {
          success: true,
          llmContent: `No matches found for pattern: ${pattern}`,
          displayContent: `⚠️ 未找到匹配 "${pattern}" 的内容`,
          metadata: { pattern, count: 0 },
        };
      }

      const errorMessage = error instanceof Error ? error.message : '未知错误';
      return {
        success: false,
        llmContent: `Search failed: ${errorMessage}`,
        displayContent: `❌ 搜索失败: ${errorMessage}`,
        error: {
          type: ToolErrorType.EXECUTION_ERROR,
          message: errorMessage,
        },
      };
    }
  },
});
```

### 6.4.6 Bash 工具 - Shell 命令

**文件位置**：`src/tools/builtin/bash.ts`

```typescript
/**
 * Bash 工具 - Shell 命令执行
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';
import { createTool } from '../createTool.js';
import { ToolKind, ToolErrorType } from '../types.js';

const execAsync = promisify(exec);

const BashSchema = z.object({
  command: z.string()
    .min(1, '命令不能为空')
    .describe('The shell command to execute'),
  description: z.string()
    .optional()
    .describe('A brief description of what the command does (for logging)'),
  timeout: z.number()
    .max(600000)
    .default(120000)
    .describe('Timeout in milliseconds (max 10 minutes, default 2 minutes)'),
  working_directory: z.string()
    .optional()
    .describe('The working directory to execute the command in'),
});

export const bashTool = createTool({
  name: 'Bash',
  displayName: 'Shell Command',
  kind: ToolKind.Execute,
  schema: BashSchema,
  
  // Bash 不是并发安全的（可能修改共享状态）
  isConcurrencySafe: false,
  
  description: {
    short: 'Executes bash commands in a shell session',
    long: 'Executes shell commands and returns the output. Use this for system operations, git commands, package management, etc.',
    usageNotes: [
      'Avoid using for file operations - use dedicated tools (Read, Write, Edit) instead',
      'Do not use cat/head/tail to read files - use the Read tool',
      'Do not use sed/awk to edit files - use the Edit tool',
      'Use && to chain dependent commands',
      'Always quote file paths that contain spaces',
    ],
    examples: [
      {
        description: 'Run npm install',
        params: { command: 'npm install', description: 'Install dependencies' },
      },
      {
        description: 'Check git status',
        params: { command: 'git status' },
      },
    ],
    important: [
      'NEVER use git commands with -i flag (interactive mode)',
      'NEVER run destructive commands like rm -rf / without explicit request',
      'NEVER use echo to communicate - output text directly',
      'Avoid long-running processes that block',
    ],
  },

  category: 'Shell',
  tags: ['shell', 'bash', 'command', 'execute'],

  extractSignatureContent: (params: unknown) => {
    const p = params as { command: string };
    return p.command;
  },

  async execute(params, context) {
    const { command, description, timeout, working_directory } = params;

    // 危险命令检查
    const dangerousPatterns = [
      /rm\s+-rf\s+\/(?!\w)/,  // rm -rf / (但允许 rm -rf /path/to/dir)
      />\s*\/dev\/sd[a-z]/,   // 写入磁盘设备
      /mkfs\./,               // 格式化文件系统
      /dd\s+if=.*of=\/dev/,   // dd 写入设备
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        return {
          success: false,
          llmContent: `Error: Potentially dangerous command detected: ${command}`,
          displayContent: `❌ 检测到危险命令，已阻止执行`,
          error: {
            type: ToolErrorType.PERMISSION_ERROR,
            message: 'Dangerous command blocked',
          },
        };
      }
    }

    try {
      // 执行命令
      const options = {
        timeout,
        cwd: working_directory || context?.cwd || process.cwd(),
        maxBuffer: 10 * 1024 * 1024, // 10MB
        shell: '/bin/bash',
      };

      const { stdout, stderr } = await execAsync(command, options);

      // 组合输出
      const output = [
        stdout ? stdout.trim() : '',
        stderr ? `[stderr]\n${stderr.trim()}` : '',
      ].filter(Boolean).join('\n\n');

      return {
        success: true,
        llmContent: output || '(no output)',
        displayContent: description 
          ? `✅ ${description}` 
          : `✅ 命令执行成功: ${command.length > 50 ? command.substring(0, 50) + '...' : command}`,
        metadata: {
          command,
          exit_code: 0,
          working_directory: options.cwd,
        },
      };
    } catch (error: unknown) {
      const execError = error as {
        code?: number | string;
        killed?: boolean;
        signal?: string;
        stdout?: string;
        stderr?: string;
        message?: string;
      };

      // 超时处理
      if (execError.killed && execError.signal === 'SIGTERM') {
        return {
          success: false,
          llmContent: `Command timed out after ${timeout}ms: ${command}`,
          displayContent: `❌ 命令超时 (${timeout}ms)`,
          error: {
            type: ToolErrorType.TIMEOUT_ERROR,
            message: 'Command timed out',
          },
        };
      }

      // 命令执行失败
      const exitCode = typeof execError.code === 'number' ? execError.code : 1;
      const stderr = execError.stderr || execError.message || '未知错误';
      const stdout = execError.stdout || '';

      const output = [
        stdout ? stdout.trim() : '',
        stderr ? stderr.trim() : '',
      ].filter(Boolean).join('\n\n');

      return {
        success: false,
        llmContent: `Command failed with exit code ${exitCode}:\n${output}`,
        displayContent: `❌ 命令执行失败 (exit ${exitCode})`,
        error: {
          type: ToolErrorType.EXECUTION_ERROR,
          message: stderr,
          details: { exit_code: exitCode },
        },
        metadata: {
          command,
          exit_code: exitCode,
        },
      };
    }
  },
});
```

### 6.4.7 内置工具导出

**文件位置**：`src/tools/builtin/index.ts`

```typescript
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
```

---

## 6.5 工具注册表

### 6.5.1 创建注册表

**文件位置**：`src/tools/registry.ts`

```typescript
/**
 * 工具注册表
 * 
 * 管理所有工具的注册、查询和分类
 */

import { EventEmitter } from 'events';
import type { Tool, FunctionDeclaration } from './types.js';

/**
 * 工具注册事件
 */
export interface ToolRegisteredEvent {
  type: 'builtin' | 'mcp';
  tool: Tool;
}

/**
 * 工具注册表
 */
export class ToolRegistry extends EventEmitter {
  /** 内置工具 */
  private tools = new Map<string, Tool>();
  
  /** MCP 工具 */
  private mcpTools = new Map<string, Tool>();
  
  /** 分类索引 */
  private categories = new Map<string, Set<string>>();
  
  /** 标签索引 */
  private tagIndex = new Map<string, Set<string>>();

  /**
   * 注册内置工具
   */
  register(tool: Tool): void {
    if (this.tools.has(tool.name) || this.mcpTools.has(tool.name)) {
      throw new Error(`工具 '${tool.name}' 已注册`);
    }
    
    this.tools.set(tool.name, tool);
    this.updateIndexes(tool);
    this.emit('toolRegistered', { type: 'builtin', tool } as ToolRegisteredEvent);
  }

  /**
   * 注册 MCP 工具
   */
  registerMcpTool(tool: Tool): void {
    if (this.tools.has(tool.name) || this.mcpTools.has(tool.name)) {
      throw new Error(`工具 '${tool.name}' 已注册`);
    }
    
    this.mcpTools.set(tool.name, tool);
    this.updateIndexes(tool);
    this.emit('toolRegistered', { type: 'mcp', tool } as ToolRegisteredEvent);
  }

  /**
   * 批量注册工具
   */
  registerAll(tools: Tool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * 注销 MCP 工具
   */
  unregisterMcpTool(name: string): boolean {
    const tool = this.mcpTools.get(name);
    if (!tool) return false;

    this.mcpTools.delete(name);
    this.removeFromIndexes(tool);
    this.emit('toolUnregistered', { type: 'mcp', tool });
    return true;
  }

  /**
   * 获取工具（内置或 MCP）
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name) || this.mcpTools.get(name);
  }

  /**
   * 检查工具是否存在
   */
  has(name: string): boolean {
    return this.tools.has(name) || this.mcpTools.has(name);
  }

  /**
   * 获取所有工具（内置 + MCP）
   */
  getAll(): Tool[] {
    return [...this.tools.values(), ...this.mcpTools.values()];
  }

  /**
   * 获取只读工具
   */
  getReadOnlyTools(): Tool[] {
    return this.getAll().filter(tool => tool.isReadOnly);
  }

  /**
   * 获取写工具
   */
  getWriteTools(): Tool[] {
    return this.getAll().filter(tool => !tool.isReadOnly);
  }

  /**
   * 获取函数声明（用于传递给 LLM）
   */
  getFunctionDeclarations(): FunctionDeclaration[] {
    return this.getAll().map(tool => tool.getFunctionDeclaration());
  }

  /**
   * 根据权限模式获取函数声明
   * 
   * Plan 模式只返回只读工具
   */
  getFunctionDeclarationsByMode(mode?: string): FunctionDeclaration[] {
    if (mode === 'plan') {
      return this.getReadOnlyTools().map(t => t.getFunctionDeclaration());
    }
    return this.getFunctionDeclarations();
  }

  /**
   * 搜索工具
   */
  search(query: string): Tool[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter(tool => 
      tool.name.toLowerCase().includes(lowerQuery) ||
      tool.displayName.toLowerCase().includes(lowerQuery) ||
      tool.description.short.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * 获取工具数量
   */
  get size(): number {
    return this.tools.size + this.mcpTools.size;
  }

  /**
   * 更新索引
   */
  private updateIndexes(tool: Tool): void {
    // 更新分类索引
    if (tool.category) {
      if (!this.categories.has(tool.category)) {
        this.categories.set(tool.category, new Set());
      }
      this.categories.get(tool.category)!.add(tool.name);
    }

    // 更新标签索引
    for (const tag of tool.tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(tool.name);
    }
  }

  /**
   * 从索引中移除
   */
  private removeFromIndexes(tool: Tool): void {
    if (tool.category) {
      const categorySet = this.categories.get(tool.category);
      if (categorySet) {
        categorySet.delete(tool.name);
        if (categorySet.size === 0) {
          this.categories.delete(tool.category);
        }
      }
    }

    for (const tag of tool.tags) {
      const tagSet = this.tagIndex.get(tag);
      if (tagSet) {
        tagSet.delete(tool.name);
        if (tagSet.size === 0) {
          this.tagIndex.delete(tag);
        }
      }
    }
  }
}

/**
 * 创建工具注册表实例
 */
export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry();
}
```

---

## 6.6 模块导出

**文件位置**：`src/tools/index.ts`

```typescript
/**
 * 工具系统模块导出
 */

// 类型
export { ToolKind, ToolErrorType } from './types.js';
export type {
  Tool,
  ToolDescription,
  ToolExample,
  ToolError,
  ToolResult,
  ToolInvocation,
  ExecutionContext,
  FunctionDeclaration,
} from './types.js';

// 工具工厂
export { createTool } from './createTool.js';
export type { ToolConfig } from './createTool.js';

// 注册表
export { ToolRegistry, createToolRegistry } from './registry.js';
export type { ToolRegisteredEvent } from './registry.js';

// 内置工具
export {
  readTool,
  editTool,
  writeTool,
  globTool,
  grepTool,
  bashTool,
  getBuiltinTools,
} from './builtin/index.js';
```

---

## 6.7 集成到 Agent

### 6.7.1 更新 Agent 初始化

回到 `src/agent/Agent.ts`，更新初始化代码：

```typescript
// 【第 6 章新增】导入工具系统
import {
  ToolRegistry,
  createToolRegistry,
  getBuiltinTools,
} from '../tools/index.js';

export class Agent {
  // ...原有代码...
  
  // 【新增】工具系统
  private toolRegistry!: ToolRegistry;

  private async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // 1. 构建系统提示词
      // ...原有代码...

      // 2. 创建 ChatService
      // ...原有代码...

      // 3. 【新增】初始化工具系统
      this.toolRegistry = createToolRegistry();
      
      // 注册内置工具
      const builtinTools = getBuiltinTools();
      for (const tool of builtinTools) {
        this.toolRegistry.register(tool);
      }

      this.isInitialized = true;
    } catch (error) {
      // ...原有代码...
    }
  }

  // 【新增】获取工具注册表
  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }
}
```

### 6.7.2 更新 executeLoop 获取工具

```typescript
private async executeLoop(...): Promise<LoopResult> {
  // ...准备阶段...

  // 【修改】获取工具定义
  const mode = context.permissionMode === 'plan' ? 'plan' : undefined;
  const functionDeclarations = this.toolRegistry.getFunctionDeclarationsByMode(mode);
  const tools: ToolDefinition[] = functionDeclarations.map(fn => ({
    type: 'function' as const,
    function: {
      name: fn.name,
      description: fn.description,
      parameters: fn.parameters as ToolDefinition['function']['parameters'],
    },
  }));

  // ...核心循环...
}
```

### 6.7.3 更新 executeToolCall 执行工具

```typescript
private async executeToolCall(
  toolCall: ToolCall,
  context: ChatContext
): Promise<ToolResult> {
  // 1. 解析参数
  let params: Record<string, unknown>;
  try {
    params = JSON.parse(toolCall.function.arguments);
  } catch {
    return {
      success: false,
      error: `Invalid tool arguments: ${toolCall.function.arguments}`,
      displayContent: `❌ 无效的工具参数`,
      llmContent: `Error: Failed to parse tool arguments as JSON.`,
    };
  }

  // 2. 获取工具
  const tool = this.toolRegistry.get(toolCall.function.name);
  if (!tool) {
    return {
      success: false,
      error: `Unknown tool: ${toolCall.function.name}`,
      displayContent: `❌ 未知工具: ${toolCall.function.name}`,
      llmContent: `Error: Tool '${toolCall.function.name}' not found.`,
    };
  }

  // 3. 执行工具
  const result = await tool.execute(params, {
    sessionId: context.sessionId,
    signal: context.signal,
    cwd: process.cwd(),
  });

  // 4. 转换结果格式
  return {
    success: result.success,
    displayContent: result.displayContent,
    llmContent: result.llmContent,
    error: result.error?.message,
    metadata: result.metadata,
  };
}
```

---

## 6.8 内置工具清单

| 工具 | 类型 | 用途 |
|------|------|------|
| **文件工具** | | |
| `Read` | ReadOnly | 读取文件内容 |
| `Edit` | Write | 字符串替换编辑 |
| `Write` | Write | 写入/覆盖文件 |
| **搜索工具** | | |
| `Glob` | ReadOnly | 文件模式匹配 |
| `Grep` | ReadOnly | 文本内容搜索 |
| **Shell 工具** | | |
| `Bash` | Execute | 执行 Shell 命令 |

---

## 6.9 常见问题

### Q1: LLM 是怎么决定用什么工具的？

**A: 函数声明 + 描述匹配 + 训练强化**

1. `getFunctionDeclaration()` 为 LLM 提供"菜单"
2. 用户说"帮我看看 main.ts" → LLM 匹配到 Read 工具的描述
3. RLHF 训练让 LLM 学会何时调用、如何调用

### Q2: Tools / MCP / Function Call 有什么区别？

| 概念 | 层级 | 说明 |
|------|------|------|
| **Function Call** | 协议层 | OpenAI/Anthropic 定义的 API 机制 |
| **Tool** | 抽象层 | 对 Function Call 的封装 |
| **MCP** | 标准化层 | Anthropic 提出的工具互操作协议 |

---

## 6.10 本章小结

### 完成的内容

| 文件 | 内容 |
|------|------|
| `src/tools/types.ts` | 工具类型定义 |
| `src/tools/createTool.ts` | 工具工厂函数 |
| `src/tools/registry.ts` | 工具注册表 |
| `src/tools/builtin/*.ts` | 6 个内置工具 |

### 技术亮点

| 亮点 | 说明 |
|------|------|
| **Zod 一石三鸟** | 类型推断 + 运行时验证 + JSON Schema |
| **llmContent vs displayContent** | LLM 需要完整信息，用户只需摘要 |
| **ToolKind 权限分类** | Plan 模式只暴露 ReadOnly 工具 |
| **工厂函数强制规范** | 确保所有工具都有完整元数据 |

---

## 下一章预告

在 **第七章** 中，我们将：
1. 实现执行管道（ExecutionPipeline）
2. 实现七阶段执行流程
3. 实现权限控制系统
4. 实现确认提示交互

这将让工具执行更加安全可控！
