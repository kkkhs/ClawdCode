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
 * 完整配置 Schema
 */
export const ConfigSchema = z.object({
  // 默认模型配置
  default: ModelConfigSchema.optional(),
  
  // 多模型配置（可选）
  models: z.array(ModelConfigSchema).optional(),
  
  // UI 配置
  ui: UIConfigSchema.optional(),
});

// 类型导出
export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type UIConfig = z.infer<typeof UIConfigSchema>;
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
};
