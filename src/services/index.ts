/**
 * Services 模块导出
 */

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
