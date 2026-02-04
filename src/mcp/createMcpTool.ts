/**
 * MCP Tool 转换器
 * 将 MCP 工具定义（JSON Schema）转换为 ClawdCode Tool（Zod Schema）
 */

import { z } from 'zod';
import type {
  McpToolDefinition,
  McpClientInterface,
  JSONSchemaProperty,
} from './types.js';
import { createTool } from '../tools/createTool.js';
import { ToolKind, ToolErrorType } from '../tools/types.js';

/**
 * 将 JSON Schema 转换为 Zod Schema
 */
function convertJsonSchemaToZod(jsonSchema: JSONSchemaProperty): z.ZodSchema {
  // null 或 undefined
  if (!jsonSchema || typeof jsonSchema !== 'object') {
    return z.any();
  }

  const type = Array.isArray(jsonSchema.type) ? jsonSchema.type[0] : jsonSchema.type;

  // object 类型
  if (type === 'object' || jsonSchema.properties) {
    const shape: Record<string, z.ZodSchema> = {};
    const required = jsonSchema.required || [];

    if (jsonSchema.properties) {
      for (const [key, value] of Object.entries(jsonSchema.properties)) {
        if (typeof value === 'object' && value !== null) {
          let fieldSchema = convertJsonSchemaToZod(value);

          // 非必填字段标记为可选
          if (!required.includes(key)) {
            fieldSchema = fieldSchema.optional();
          }

          shape[key] = fieldSchema;
        }
      }
    }

    return z.object(shape);
  }

  // array 类型
  if (type === 'array') {
    if (jsonSchema.items && typeof jsonSchema.items === 'object') {
      return z.array(convertJsonSchemaToZod(jsonSchema.items));
    }
    return z.array(z.any());
  }

  // string 类型
  if (type === 'string') {
    // 枚举
    if (jsonSchema.enum && jsonSchema.enum.length > 0) {
      return z.enum(jsonSchema.enum as [string, ...string[]]);
    }

    let schema = z.string();

    // 长度限制
    if (jsonSchema.minLength !== undefined) {
      schema = schema.min(jsonSchema.minLength);
    }
    if (jsonSchema.maxLength !== undefined) {
      schema = schema.max(jsonSchema.maxLength);
    }

    // 正则模式
    if (jsonSchema.pattern) {
      try {
        schema = schema.regex(new RegExp(jsonSchema.pattern));
      } catch {
        // 忽略无效的正则
      }
    }

    return schema;
  }

  // number / integer 类型
  if (type === 'number' || type === 'integer') {
    let schema = z.number();

    if (jsonSchema.minimum !== undefined) {
      schema = schema.min(jsonSchema.minimum);
    }
    if (jsonSchema.maximum !== undefined) {
      schema = schema.max(jsonSchema.maximum);
    }

    return schema;
  }

  // boolean 类型
  if (type === 'boolean') {
    return z.boolean();
  }

  // oneOf / anyOf
  if (jsonSchema.oneOf && jsonSchema.oneOf.length >= 2) {
    const schemas = jsonSchema.oneOf
      .filter((s): s is JSONSchemaProperty => typeof s === 'object' && s !== null)
      .map(s => convertJsonSchemaToZod(s));

    if (schemas.length >= 2) {
      return z.union(schemas as [z.ZodSchema, z.ZodSchema, ...z.ZodSchema[]]);
    }
  }

  if (jsonSchema.anyOf && jsonSchema.anyOf.length >= 2) {
    const schemas = jsonSchema.anyOf
      .filter((s): s is JSONSchemaProperty => typeof s === 'object' && s !== null)
      .map(s => convertJsonSchemaToZod(s));

    if (schemas.length >= 2) {
      return z.union(schemas as [z.ZodSchema, z.ZodSchema, ...z.ZodSchema[]]);
    }
  }

  // 默认 any
  return z.any();
}

/**
 * 将 MCP 工具定义转换为 ClawdCode Tool
 */
export function createMcpTool(
  mcpClient: McpClientInterface,
  serverName: string,
  toolDef: McpToolDefinition,
  customName?: string
) {
  // 1. JSON Schema → Zod Schema
  let zodSchema: z.ZodSchema;
  try {
    zodSchema = convertJsonSchemaToZod(toolDef.inputSchema);
  } catch (error) {
    console.warn(
      `[createMcpTool] Schema 转换失败，使用降级 schema: ${toolDef.name}`,
      (error as Error).message
    );
    zodSchema = z.any();  // 降级方案
  }

  // 2. 决定工具名称
  const toolName = customName || toolDef.name;

  // 3. 创建 ClawdCode Tool
  return createTool({
    name: toolName,
    displayName: `${serverName}: ${toolDef.name}`,
    kind: ToolKind.Execute,  // MCP 工具视为 Execute 类型（需要确认）
    schema: zodSchema,
    description: {
      short: toolDef.description || `MCP Tool: ${toolDef.name}`,
      long: [
        `MCP 工具，来自服务器: ${serverName}`,
        toolDef.description || '',
        '',
        '执行外部工具，需要用户确认。',
      ].filter(Boolean).join('\n'),
      important: [
        `From MCP server: ${serverName}`,
        'Executes external tools; user confirmation required',
      ],
    },
    category: 'mcp',
    tags: ['mcp', 'external', serverName],

    async execute(params) {
      try {
        const result = await mcpClient.callTool(toolDef.name, params);

        // 处理响应内容
        let llmContent = '';
        let displayContent = '';

        if (result.content && Array.isArray(result.content)) {
          for (const item of result.content) {
            if (item.type === 'text' && item.text) {
              llmContent += item.text;
              displayContent += item.text;
            } else if (item.type === 'image') {
              displayContent += `[图片: ${item.mimeType || 'unknown'}]\n`;
              llmContent += `[image: ${item.mimeType || 'unknown'}]\n`;
            } else if (item.type === 'resource') {
              displayContent += `[资源: ${item.uri || item.mimeType || 'unknown'}]\n`;
              llmContent += `[resource: ${item.uri || item.mimeType || 'unknown'}]\n`;
            }
          }
        }

        if (result.isError) {
          return {
            success: false,
            llmContent: llmContent || 'MCP tool execution failed',
            displayContent: `❌ ${displayContent || 'MCP工具执行失败'}`,
            error: {
              type: ToolErrorType.EXECUTION_ERROR,
              message: llmContent || 'MCP tool execution failed',
            },
          };
        }

        return {
          success: true,
          llmContent: llmContent || 'Execution succeeded',
          displayContent: `✅ MCP工具 ${toolDef.name} 执行成功\n${displayContent}`,
          metadata: {
            serverName,
            toolName: toolDef.name,
            mcpResult: result,
          },
        };
      } catch (error) {
        const errorMessage = (error as Error).message;
        return {
          success: false,
          llmContent: `MCP tool execution failed: ${errorMessage}`,
          displayContent: `❌ MCP工具执行失败: ${errorMessage}`,
          error: {
            type: ToolErrorType.EXECUTION_ERROR,
            message: errorMessage,
          },
        };
      }
    },
  });
}

/**
 * 批量创建 MCP 工具
 */
export function createMcpTools(
  mcpClient: McpClientInterface,
  serverName: string,
  toolDefs: McpToolDefinition[],
  namePrefix?: string
) {
  return toolDefs.map(toolDef => {
    const customName = namePrefix ? `${namePrefix}__${toolDef.name}` : undefined;
    return createMcpTool(mcpClient, serverName, toolDef, customName);
  });
}
