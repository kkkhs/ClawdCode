/**
 * 上下文管理模块
 */

// 类型导出
export * from './types.js';

// 核心类导出
export { ContextManager } from './ContextManager.js';
export { TokenCounter } from './TokenCounter.js';
export { CompactionService } from './CompactionService.js';
export { FileAnalyzer } from './FileAnalyzer.js';

// 存储层导出
export {
  MemoryStore,
  PersistentStore,
  CacheStore,
  JSONLStore,
  getStorageRoot,
  getProjectStoragePath,
  getSessionFilePath,
  escapeProjectPath,
  detectGitBranch,
  detectGitRemote,
  getLatestSessionFile,
} from './storage/index.js';
