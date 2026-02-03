/**
 * Services 模块导出
 */

// VersionChecker
export {
  checkVersion,
  checkVersionOnStartup,
  setSkipUntilVersion,
  clearSkipVersion,
  getUpgradeCommand,
  performUpgrade,
  getCurrentVersion,
} from './VersionChecker.js';

export type { VersionCheckResult } from './VersionChecker.js';

// ChatService
export {
  OpenAIChatService,
  createChatService,
} from './ChatService.js';

export type { ChatServiceConfig } from './ChatService.js';
