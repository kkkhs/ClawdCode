/**
 * 配置类型定义
 */

import { z } from 'zod';

/**
 * 模型配置 Schema（所有字段可选，方便合并）
 * 
 * 使用 OpenAI SDK，兼容所有 OpenAI 格式的 API（OpenAI、Azure、Ark 等）
 */
export const ModelConfigSchema = z.object({
  name: z.string().optional(),
  apiKey: z.string().optional(),
  baseURL: z.string().optional(),
  model: z.string().optional(),
});

/**
 * UI 配置 Schema
 */
export const UIConfigSchema = z.object({
  theme: z.enum(['dark', 'light']).optional(),
});

/**
 * 权限配置 Schema
 */
export const PermissionConfigSchema = z.object({
  allow: z.array(z.string()).default([]),
  deny: z.array(z.string()).default([]),
  ask: z.array(z.string()).default([]),
});

/**
 * MCP 服务器配置 Schema
 */
export const McpServerConfigSchema = z.object({
  type: z.enum(['stdio', 'sse', 'http']),
  
  // stdio 配置
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  cwd: z.string().optional(),
  
  // sse/http 配置
  url: z.string().optional(),
  headers: z.record(z.string()).optional(),
  
  // 其他配置
  enabled: z.boolean().optional(),
  timeout: z.number().optional(),
  description: z.string().optional(),
  
  // 健康检查配置
  healthCheck: z.object({
    enabled: z.boolean(),
    intervalMs: z.number(),
    timeoutMs: z.number(),
    maxFailures: z.number(),
  }).optional(),
});

/**
 * 完整配置 Schema (config.json)
 */
export const ConfigSchema = z.object({
  // 默认模型配置
  default: ModelConfigSchema.optional(),
  
  // 多模型配置（可选）
  models: z.array(ModelConfigSchema).optional(),
  
  // UI 配置
  ui: UIConfigSchema.optional(),
  
  // 权限配置
  permissions: PermissionConfigSchema.optional(),
  
  // 默认权限模式
  defaultPermissionMode: z.enum(['default', 'autoEdit', 'yolo', 'plan']).optional(),
  
  // 工具白名单
  toolWhitelist: z.array(z.string()).optional(),
  
  // 工具黑名单
  toolBlacklist: z.array(z.string()).optional(),
  
  // MCP 服务器配置
  mcpServers: z.record(McpServerConfigSchema).optional(),
  
  // MCP 是否启用
  mcpEnabled: z.boolean().optional(),
});

// 类型导出
export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type UIConfig = z.infer<typeof UIConfigSchema>;
export type PermissionConfig = z.infer<typeof PermissionConfigSchema>;
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;

/**
 * 默认配置
 */
export const DEFAULT_CONFIG: Config = {
  default: {
    model: 'gpt-4',
  },
  ui: {
    theme: 'dark',
  },
  permissions: {
    allow: [],
    deny: [],
    ask: [],
  },
  defaultPermissionMode: 'default',
  mcpServers: {},
  mcpEnabled: true,
};
