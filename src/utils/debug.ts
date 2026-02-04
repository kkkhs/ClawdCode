/**
 * Debug 日志工具
 * 
 * 使用 globalThis 共享 debug 状态，由 main.tsx 的 parseDebugEarly() 设置
 */

/** 设置全局 debug 状态（由 main.tsx parseDebugEarly 调用） */
export function setGlobalDebug(enabled: boolean): void {
  (globalThis as any).__CLAWDCODE_DEBUG__ = enabled;
}

/** 获取全局 debug 状态 */
export function isDebugEnabled(): boolean {
  return (globalThis as any).__CLAWDCODE_DEBUG__ === true;
}

/**
 * 创建带前缀的调试日志函数
 */
export function createDebugLogger(prefix: string) {
  return {
    log: (...args: unknown[]) => {
      if (isDebugEnabled()) {
        console.log(`[${prefix}]`, ...args);
      }
    },
    warn: (...args: unknown[]) => {
      if (isDebugEnabled()) {
        console.warn(`[${prefix}]`, ...args);
      }
    },
    error: (...args: unknown[]) => {
      // 错误始终输出
      console.error(`[${prefix}]`, ...args);
    },
  };
}

// 预定义的 logger
export const agentDebug = createDebugLogger('Agent');
export const mcpDebug = createDebugLogger('MCP');
export const mcpClientDebug = (name: string) => createDebugLogger(`McpClient:${name}`);
export const mcpRegistryDebug = createDebugLogger('McpRegistry');
