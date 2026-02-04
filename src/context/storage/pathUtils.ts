/**
 * 路径工具函数
 * 
 * 处理项目隔离存储的路径计算
 */

import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';

/**
 * 获取存储根目录
 */
export function getStorageRoot(): string {
  return path.join(os.homedir(), '.clawdcode');
}

/**
 * 转义项目路径为目录名
 * /Users/foo/project → -Users-foo-project
 */
export function escapeProjectPath(absPath: string): string {
  const normalized = path.resolve(absPath);
  // 将路径分隔符替换为 -，移除开头的 -
  return normalized.replace(/[/\\]/g, '-').replace(/^-/, '');
}

/**
 * 获取项目的存储路径
 * @returns ~/.clawdcode/projects/{escaped-path}/
 */
export function getProjectStoragePath(projectPath: string): string {
  const escaped = escapeProjectPath(projectPath);
  return path.join(getStorageRoot(), 'projects', escaped);
}

/**
 * 获取会话文件路径
 * @returns ~/.clawdcode/projects/{escaped-path}/{sessionId}.jsonl
 */
export function getSessionFilePath(projectPath: string, sessionId: string): string {
  return path.join(getProjectStoragePath(projectPath), `${sessionId}.jsonl`);
}

/**
 * 获取会话索引文件路径
 * @returns ~/.clawdcode/projects/{escaped-path}/sessions.json
 */
export function getSessionIndexPath(projectPath: string): string {
  return path.join(getProjectStoragePath(projectPath), 'sessions.json');
}

/**
 * 检测当前项目的 Git 分支
 */
export function detectGitBranch(projectPath: string): string | undefined {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return branch || undefined;
  } catch {
    return undefined;
  }
}

/**
 * 检测 Git 远程仓库
 */
export function detectGitRemote(projectPath: string): string | undefined {
  try {
    const remote = execSync('git remote get-url origin', {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return remote || undefined;
  } catch {
    return undefined;
  }
}

/**
 * 获取最近的会话文件
 */
export async function getLatestSessionFile(projectPath: string): Promise<string | null> {
  const { readdir, stat } = await import('node:fs/promises');
  const storagePath = getProjectStoragePath(projectPath);
  
  try {
    const files = await readdir(storagePath);
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
    
    if (jsonlFiles.length === 0) {
      return null;
    }
    
    // 按修改时间排序
    const fileStats = await Promise.all(
      jsonlFiles.map(async (file) => {
        const filePath = path.join(storagePath, file);
        const stats = await stat(filePath);
        return { file, mtime: stats.mtime.getTime() };
      })
    );
    
    fileStats.sort((a, b) => b.mtime - a.mtime);
    return path.join(storagePath, fileStats[0].file);
  } catch {
    return null;
  }
}
