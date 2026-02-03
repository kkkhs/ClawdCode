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
