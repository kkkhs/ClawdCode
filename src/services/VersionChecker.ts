/**
 * VersionChecker - 版本检查服务
 * 
 * 功能：
 * - 启动时并行检查是否有新版本
 * - 缓存机制（1小时 TTL）
 * - 跳过版本功能（Skip until next version）
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

// ========== 从 package.json 读取配置 ==========

interface PackageJson {
  name: string;
  version: string;
  repository?: {
    type?: string;
    url?: string;
  } | string;
  homepage?: string;
}

// 获取 package.json 路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJsonPath = path.resolve(__dirname, '../../package.json');

// 同步读取 package.json（仅在模块加载时执行一次）
let packageJson: PackageJson;
try {
  const content = await fs.readFile(packageJsonPath, 'utf-8');
  packageJson = JSON.parse(content) as PackageJson;
} catch {
  // 如果读取失败，使用默认值
  packageJson = { name: 'clawdcode', version: '0.1.0' };
}

/**
 * 从 package.json 获取 release notes URL
 * 优先级：repository.url -> homepage -> 默认值
 */
function getReleaseNotesUrl(): string {
  // 从 repository.url 提取 GitHub URL
  const repoUrl = typeof packageJson.repository === 'string'
    ? packageJson.repository
    : packageJson.repository?.url;
  
  if (repoUrl) {
    // 转换 git+https://github.com/xxx/yyy.git -> https://github.com/xxx/yyy/releases
    const match = repoUrl.match(/github\.com[/:]([^/]+\/[^/.]+)/);
    if (match) {
      return `https://github.com/${match[1]}/releases`;
    }
  }
  
  // 从 homepage 提取
  if (packageJson.homepage) {
    const homepageMatch = packageJson.homepage.match(/github\.com\/([^/#]+\/[^/#]+)/);
    if (homepageMatch) {
      return `https://github.com/${homepageMatch[1]}/releases`;
    }
  }
  
  // 默认值
  return `https://www.npmjs.com/package/${PACKAGE_NAME}`;
}

// ========== 配置常量 ==========

const PACKAGE_NAME = packageJson.name;
const CURRENT_VERSION = packageJson.version;
const DEFAULT_NPM_REGISTRY_URL = 'https://registry.npmjs.org';
const CACHE_TTL = 60 * 60 * 1000; // 1 小时
const CACHE_DIR = path.join(os.homedir(), `.${PACKAGE_NAME}`);
const CACHE_FILE = path.join(CACHE_DIR, 'version-cache.json');

// ========== 读取用户 npm 配置 ==========

/**
 * 从用户 .npmrc 读取 registry 配置
 * 优先级：项目 .npmrc > 用户 .npmrc > 默认值
 */
async function getNpmRegistry(): Promise<string> {
  const npmrcLocations = [
    path.join(process.cwd(), '.npmrc'),           // 项目级
    path.join(os.homedir(), '.npmrc'),            // 用户级
  ];

  for (const npmrcPath of npmrcLocations) {
    try {
      const content = await fs.readFile(npmrcPath, 'utf-8');
      // 匹配 registry=https://xxx 或 registry = https://xxx
      const match = content.match(/^\s*registry\s*=\s*(.+?)\s*$/m);
      if (match && match[1]) {
        let registry = match[1].trim();
        // 移除尾部斜杠
        if (registry.endsWith('/')) {
          registry = registry.slice(0, -1);
        }
        return registry;
      }
    } catch {
      // 文件不存在或读取失败，继续尝试下一个
    }
  }

  return DEFAULT_NPM_REGISTRY_URL;
}

// ========== 类型定义 ==========

/**
 * 版本检查结果
 */
export interface VersionCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  hasUpdate: boolean;
  shouldPrompt: boolean; // 是否应该显示提示（考虑 skip 设置）
  releaseNotesUrl: string;
  error?: string;
}

/**
 * 版本缓存
 */
interface VersionCache {
  latestVersion: string;
  checkedAt: number;
  skipUntilVersion?: string; // 跳过直到此版本
}

// ========== 缓存操作 ==========

/**
 * 读取缓存
 */
async function readCache(): Promise<VersionCache | null> {
  try {
    const content = await fs.readFile(CACHE_FILE, 'utf-8');
    const cache: VersionCache = JSON.parse(content);
    return cache;
  } catch {
    return null;
  }
}

/**
 * 写入缓存
 */
async function writeCache(cache: VersionCache): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (error) {
    // 缓存写入失败不影响主流程
    console.error('[VersionChecker] Failed to write cache:', error);
  }
}

/**
 * 检查缓存是否有效
 */
function isCacheValid(cache: VersionCache): boolean {
  return Date.now() - cache.checkedAt < CACHE_TTL;
}

// ========== 版本比较 ==========

/**
 * 简单的 semver 比较
 * 返回：1 如果 a > b，-1 如果 a < b，0 如果相等
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.replace(/^v/, '').split('.').map(Number);
  const partsB = b.replace(/^v/, '').split('.').map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }
  return 0;
}

// ========== 核心功能 ==========

/**
 * 从 npm registry 获取最新版本
 */
async function fetchLatestVersion(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时

    // 从用户配置读取 registry URL
    const registryUrl = await getNpmRegistry();
    
    const response = await fetch(`${registryUrl}/${PACKAGE_NAME}/latest`, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as { version?: string };
    return data.version || null;
  } catch {
    // 网络错误、超时等，静默失败
    return null;
  }
}

/**
 * 检查版本更新
 * 
 * @param forceCheck - 是否强制检查（忽略缓存）
 */
export async function checkVersion(forceCheck = false): Promise<VersionCheckResult> {
  const result: VersionCheckResult = {
    currentVersion: CURRENT_VERSION,
    latestVersion: null,
    hasUpdate: false,
    shouldPrompt: false,
    releaseNotesUrl: getReleaseNotesUrl(),
  };

  try {
    // 1. 尝试读取缓存
    const cache = await readCache();

    // 2. 如果缓存有效且不强制检查，使用缓存
    if (cache && isCacheValid(cache) && !forceCheck) {
      result.latestVersion = cache.latestVersion;
    } else {
      // 3. 从 npm 获取最新版本
      const latestVersion = await fetchLatestVersion();
      
      if (latestVersion) {
        result.latestVersion = latestVersion;
        
        // 4. 更新缓存（保留 skipUntilVersion）
        await writeCache({
          latestVersion,
          checkedAt: Date.now(),
          skipUntilVersion: cache?.skipUntilVersion,
        });
      } else if (cache) {
        // 获取失败但有旧缓存，使用旧数据
        result.latestVersion = cache.latestVersion;
      }
    }

    // 5. 判断是否有更新
    if (result.latestVersion) {
      result.hasUpdate = compareVersions(result.latestVersion, CURRENT_VERSION) > 0;
    }

    // 6. 判断是否应该提示（考虑 skip 设置）
    if (result.hasUpdate && result.latestVersion) {
      const skipVersion = cache?.skipUntilVersion;
      if (skipVersion) {
        // 如果最新版本大于跳过版本，则应该提示
        result.shouldPrompt = compareVersions(result.latestVersion, skipVersion) > 0;
      } else {
        result.shouldPrompt = true;
      }
    }

  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
  }

  return result;
}

/**
 * 启动时版本检查
 * 
 * 返回 null 表示不需要显示更新提示
 */
export async function checkVersionOnStartup(): Promise<VersionCheckResult | null> {
  const result = await checkVersion();
  
  // 只有需要提示时才返回结果
  if (result.shouldPrompt) {
    return result;
  }
  
  return null;
}

/**
 * 设置跳过直到下一版本
 */
export async function setSkipUntilVersion(version: string): Promise<void> {
  const cache = await readCache();
  await writeCache({
    latestVersion: cache?.latestVersion || version,
    checkedAt: cache?.checkedAt || Date.now(),
    skipUntilVersion: version,
  });
}

/**
 * 清除跳过设置
 */
export async function clearSkipVersion(): Promise<void> {
  const cache = await readCache();
  if (cache) {
    await writeCache({
      latestVersion: cache.latestVersion,
      checkedAt: cache.checkedAt,
      // 不设置 skipUntilVersion
    });
  }
}

/**
 * 获取升级命令
 */
export function getUpgradeCommand(): string {
  return `npm install -g ${PACKAGE_NAME}@latest`;
}

/**
 * 执行升级
 */
export async function performUpgrade(): Promise<{ success: boolean; message: string }> {
  const { spawn } = await import('child_process');

  return new Promise((resolve) => {
    const command = getUpgradeCommand();

    const child = spawn(command, {
      stdio: 'inherit',
      shell: true,
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({
          success: true,
          message: '✅ Upgrade successful! Please restart clawdcode.',
        });
      } else {
        resolve({
          success: false,
          message: `❌ Upgrade failed (exit code: ${code})`,
        });
      }
    });

    child.on('error', (error) => {
      resolve({
        success: false,
        message: `❌ Upgrade failed: ${error.message}`,
      });
    });
  });
}

/**
 * 获取当前版本
 */
export function getCurrentVersion(): string {
  return CURRENT_VERSION;
}
