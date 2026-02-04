/**
 * CLI 类型定义
 */

import type { Arguments } from 'yargs';

/**
 * 权限模式
 */
export type PermissionMode = 'default' | 'autoEdit' | 'yolo';

/**
 * CLI 参数接口
 */
export interface CliArguments extends Arguments {
  // 调试选项
  debug?: boolean;

  // AI 选项
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  maxTurns?: number;

  // 安全选项
  permissionMode?: PermissionMode;
  yolo?: boolean;
  allowedTools?: string[];
  disallowedTools?: string[];

  // 会话选项
  continue?: boolean;
  resume?: string | boolean;

  // 输出选项
  print?: boolean;
  outputFormat?: 'text' | 'json';

  // 命令相关
  init?: boolean;

  // 位置参数（初始消息）
  message?: string;
}

/**
 * 中间件函数类型
 * 使用泛型以兼容 yargs 的类型系统
 */
export type MiddlewareFunction<T = CliArguments> = (
  argv: T
) => void | Promise<void>;

/**
 * App Props - 传递给 UI 组件的属性
 */
export interface AppProps {
  apiKey: string;
  baseURL?: string;
  model?: string;
  initialMessage?: string;
  debug?: boolean;
  permissionMode?: PermissionMode;
  resumeSessionId?: string;
}
