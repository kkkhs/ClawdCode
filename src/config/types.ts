/**
 * 配置类型定义
 * 
 * 双文件配置架构：
 * - config.json: 基础配置（API、模型、UI）
 * - settings.json: 行为配置（权限、Hooks、环境变量）
 */

import { z } from 'zod';

// ========== 枚举定义 ==========

/**
 * LLM API 提供商类型
 */
export type ProviderType = 'openai-compatible' | 'anthropic';

/**
 * 权限模式枚举
 */
export enum PermissionMode {
  DEFAULT = 'default',     // 只读自动，写入需确认
  AUTO_EDIT = 'autoEdit',  // 只读+写入自动，执行需确认
  YOLO = 'yolo',           // 完全自动（危险）
  PLAN = 'plan',           // 只读自动，其他拦截
}

// ========== Zod Schemas ==========

/**
 * 模型配置 Schema
 * 
 * 使用 OpenAI SDK，兼容所有 OpenAI 格式的 API（OpenAI、Azure、Ark 等）
 */
export const ModelConfigSchema = z.object({
  id: z.string().optional(),           // nanoid 自动生成
  name: z.string().optional(),         // 显示名称
  provider: z.enum(['openai-compatible', 'anthropic']).optional(),
  apiKey: z.string().optional(),
  baseURL: z.string().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxContextTokens: z.number().optional(),
  topP: z.number().optional(),
  topK: z.number().optional(),
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

/**
 * Hook 配置 Schema
 */
export const HookConfigSchema = z.object({
  preToolCall: z.array(z.string()).optional(),
  postToolCall: z.array(z.string()).optional(),
  preMessage: z.array(z.string()).optional(),
  postMessage: z.array(z.string()).optional(),
}).optional();

/**
 * 完整 ClawdCode 配置 Schema
 * 合并 config.json 和 settings.json 的所有配置项
 */
export const ClawdConfigSchema = z.object({
  // ===== 基础配置 (config.json) =====
  
  // 默认模型配置（向后兼容）
  default: ModelConfigSchema.optional(),
  
  // 多模型配置
  currentModelId: z.string().optional(),
  models: z.array(ModelConfigSchema).optional(),
  
  // 全局参数
  temperature: z.number().min(0).max(2).optional(),
  maxContextTokens: z.number().optional(),
  maxOutputTokens: z.number().optional(),
  stream: z.boolean().optional(),
  timeout: z.number().optional(),
  
  // UI
  ui: UIConfigSchema.optional(),
  theme: z.string().optional(),
  language: z.string().optional(),
  
  // 调试
  debug: z.union([z.string(), z.boolean()]).optional(),
  
  // MCP
  mcpEnabled: z.boolean().optional(),
  mcpServers: z.record(McpServerConfigSchema).optional(),
  
  // ===== 行为配置 (settings.json) =====
  
  // 权限
  permissions: PermissionConfigSchema.optional(),
  defaultPermissionMode: z.enum(['default', 'autoEdit', 'yolo', 'plan']).optional(),
  
  // 工具过滤
  toolWhitelist: z.array(z.string()).optional(),
  toolBlacklist: z.array(z.string()).optional(),
  
  // Hooks
  hooks: HookConfigSchema,
  
  // 环境变量
  env: z.record(z.string()).optional(),
  
  // 其他
  maxTurns: z.number().optional(),
});

/**
 * 运行时配置 Schema
 * 继承 ClawdConfig + CLI 临时字段
 */
export const RuntimeConfigSchema = ClawdConfigSchema.extend({
  // 系统提示
  systemPrompt: z.string().optional(),
  appendSystemPrompt: z.string().optional(),
  
  // 会话管理
  initialMessage: z.string().optional(),
  resumeSessionId: z.string().optional(),
  forkSession: z.boolean().optional(),
  
  // 工具过滤（CLI 临时）
  allowedTools: z.array(z.string()).optional(),
  disallowedTools: z.array(z.string()).optional(),
  
  // MCP（CLI 临时）
  mcpConfigPaths: z.array(z.string()).optional(),
  strictMcpConfig: z.boolean().optional(),
  
  // 其他
  fallbackModel: z.string().optional(),
  addDirs: z.array(z.string()).optional(),
  outputFormat: z.enum(['text', 'json', 'stream-json']).optional(),
  print: z.boolean().optional(),
});

// ========== 类型导出 ==========

export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type UIConfig = z.infer<typeof UIConfigSchema>;
export type PermissionConfig = z.infer<typeof PermissionConfigSchema>;
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;
export type HookConfig = z.infer<typeof HookConfigSchema>;
export type ClawdConfig = z.infer<typeof ClawdConfigSchema>;
export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

// 向后兼容
export type Config = ClawdConfig;

// ========== 字段路由表 ==========

export type MergeStrategy = 'replace' | 'append-dedupe' | 'deep-merge';
export type ConfigTarget = 'config' | 'settings';
export type ConfigScope = 'local' | 'project' | 'global';

export interface FieldRouting {
  target: ConfigTarget;
  defaultScope: ConfigScope;
  mergeStrategy: MergeStrategy;
  persistable: boolean;
}

/**
 * 字段路由表 - 定义每个字段的持久化行为
 */
export const FIELD_ROUTING_TABLE: Record<string, FieldRouting> = {
  // config.json 字段
  models: { target: 'config', defaultScope: 'global', mergeStrategy: 'replace', persistable: true },
  currentModelId: { target: 'config', defaultScope: 'global', mergeStrategy: 'replace', persistable: true },
  theme: { target: 'config', defaultScope: 'global', mergeStrategy: 'replace', persistable: true },
  language: { target: 'config', defaultScope: 'global', mergeStrategy: 'replace', persistable: true },
  mcpServers: { target: 'config', defaultScope: 'global', mergeStrategy: 'deep-merge', persistable: true },
  mcpEnabled: { target: 'config', defaultScope: 'global', mergeStrategy: 'replace', persistable: true },
  
  // settings.json 字段
  permissions: { target: 'settings', defaultScope: 'local', mergeStrategy: 'replace', persistable: true },
  defaultPermissionMode: { target: 'settings', defaultScope: 'local', mergeStrategy: 'replace', persistable: true },
  hooks: { target: 'settings', defaultScope: 'local', mergeStrategy: 'deep-merge', persistable: true },
  env: { target: 'settings', defaultScope: 'local', mergeStrategy: 'deep-merge', persistable: true },
  
  // 非持久化字段（CLI 临时参数）
  systemPrompt: { target: 'settings', defaultScope: 'local', mergeStrategy: 'replace', persistable: false },
  appendSystemPrompt: { target: 'settings', defaultScope: 'local', mergeStrategy: 'replace', persistable: false },
  initialMessage: { target: 'settings', defaultScope: 'local', mergeStrategy: 'replace', persistable: false },
  resumeSessionId: { target: 'settings', defaultScope: 'local', mergeStrategy: 'replace', persistable: false },
};

// ========== 默认配置 ==========

/**
 * 默认权限规则
 */
export const DEFAULT_PERMISSIONS: PermissionConfig = {
  allow: [
    // 安全的系统信息命令
    'Bash(pwd)',
    'Bash(whoami)',
    'Bash(hostname)',
    'Bash(uname *)',
    'Bash(date)',
    'Bash(echo *)',
    // 目录列表
    'Bash(ls *)',
    'Bash(tree *)',
    // Git 只读命令
    'Bash(git status)',
    'Bash(git log *)',
    'Bash(git diff *)',
    'Bash(git branch *)',
    // 包管理器只读命令
    'Bash(npm list *)',
    'Bash(npm view *)',
    'Bash(bun *)',
  ],
  ask: [
    // 高风险命令（需要确认）
    'Bash(curl *)',
    'Bash(wget *)',
    'Bash(rm -rf *)',
    'Bash(rm -r *)',
  ],
  deny: [
    // 敏感文件
    'Read(./.env)',
    'Read(./.env.*)',
    // 危险命令
    'Bash(rm -rf /)',
    'Bash(sudo *)',
    'Bash(chmod 777 *)',
    // Shell 嵌套
    'Bash(bash *)',
    'Bash(sh *)',
    'Bash(eval *)',
  ],
};

/**
 * 默认配置
 */
export const DEFAULT_CONFIG: ClawdConfig = {
  default: {
    model: 'gpt-4',
  },
  temperature: 0.7,
  maxContextTokens: 200000,
  maxOutputTokens: 16384,
  stream: true,
  timeout: 60000,
  ui: {
    theme: 'dark',
  },
  theme: 'dark',
  language: 'en',
  mcpEnabled: true,
  mcpServers: {},
  permissions: DEFAULT_PERMISSIONS,
  defaultPermissionMode: 'default',
  maxTurns: 100,
};
