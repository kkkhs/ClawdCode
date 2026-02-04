/**
 * CustomCommandLoader - 自定义命令加载器
 * 
 * 从 Markdown 文件加载自定义命令：
 * - 解析 YAML Frontmatter
 * - 提取命令内容
 * - 支持多目录扫描
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type {
  CustomCommand,
  CustomCommandConfig,
  CustomCommandSource,
  CustomCommandSourceDir,
  CustomCommandDiscoveryResult,
} from '../types.js';

/**
 * 命令目录配置
 */
interface CommandDirectory {
  path: string;
  source: CustomCommandSource;
  sourceDir: CustomCommandSourceDir;
  priority: number;
}

/**
 * 自定义命令加载器
 */
export class CustomCommandLoader {
  /**
   * 发现并加载所有自定义命令
   */
  async discover(workspaceRoot: string): Promise<CustomCommandDiscoveryResult> {
    const commands: CustomCommand[] = [];
    const warnings: string[] = [];
    const scannedDirs: string[] = [];

    // 定义扫描目录（按优先级排序，后面的覆盖前面的）
    const directories: CommandDirectory[] = [
      // 用户级命令（最低优先级）
      {
        path: path.join(os.homedir(), '.clawdcode', 'commands'),
        source: 'user',
        sourceDir: 'clawdcode',
        priority: 1,
      },
      {
        path: path.join(os.homedir(), '.claude', 'commands'),
        source: 'user',
        sourceDir: 'claude',
        priority: 2,
      },
      // 项目级命令（最高优先级）
      {
        path: path.join(workspaceRoot, '.clawdcode', 'commands'),
        source: 'project',
        sourceDir: 'clawdcode',
        priority: 3,
      },
      {
        path: path.join(workspaceRoot, '.claude', 'commands'),
        source: 'project',
        sourceDir: 'claude',
        priority: 4,
      },
    ];

    // 扫描每个目录
    for (const dir of directories) {
      if (!fs.existsSync(dir.path)) {
        continue;
      }

      scannedDirs.push(dir.path);

      try {
        const discovered = await this.scanDirectory(dir.path, dir.source, dir.sourceDir);
        commands.push(...discovered.commands);
        warnings.push(...discovered.warnings);
      } catch (error) {
        warnings.push(`扫描目录失败 ${dir.path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return { commands, warnings, scannedDirs };
  }

  /**
   * 扫描单个目录
   */
  private async scanDirectory(
    dirPath: string,
    source: CustomCommandSource,
    sourceDir: CustomCommandSourceDir,
    namespace?: string
  ): Promise<{ commands: CustomCommand[]; warnings: string[] }> {
    const commands: CustomCommand[] = [];
    const warnings: string[] = [];

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // 递归扫描子目录（创建命名空间）
        const subNamespace = namespace ? `${namespace}/${entry.name}` : entry.name;
        const subResult = await this.scanDirectory(fullPath, source, sourceDir, subNamespace);
        commands.push(...subResult.commands);
        warnings.push(...subResult.warnings);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        // 加载 Markdown 命令文件
        try {
          const command = await this.loadCommandFile(fullPath, source, sourceDir, namespace);
          if (command) {
            commands.push(command);
          }
        } catch (error) {
          warnings.push(`加载命令失败 ${fullPath}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    return { commands, warnings };
  }

  /**
   * 加载单个命令文件
   */
  private async loadCommandFile(
    filePath: string,
    source: CustomCommandSource,
    sourceDir: CustomCommandSourceDir,
    namespace?: string
  ): Promise<CustomCommand | null> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const { config, body } = this.parseFrontmatter(content);

    // 从文件名提取命令名
    const fileName = path.basename(filePath, '.md');
    const name = fileName.toLowerCase();

    // 跳过空内容
    if (!body.trim()) {
      return null;
    }

    return {
      name,
      namespace,
      config,
      content: body,
      path: filePath,
      source,
      sourceDir,
    };
  }

  /**
   * 解析 YAML Frontmatter
   */
  private parseFrontmatter(content: string): { config: CustomCommandConfig; body: string } {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    if (!match) {
      return { config: {}, body: content };
    }

    const [, frontmatter, body] = match;
    const config = this.parseYamlSimple(frontmatter);

    return { config, body };
  }

  /**
   * 简单的 YAML 解析（不依赖外部库）
   */
  private parseYamlSimple(yaml: string): CustomCommandConfig {
    const config: CustomCommandConfig = {};
    const lines = yaml.split('\n');

    let currentKey: string | null = null;
    let arrayBuffer: string[] = [];
    let inArray = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // 数组项
      if (trimmed.startsWith('- ')) {
        if (inArray && currentKey) {
          arrayBuffer.push(trimmed.slice(2).trim());
        }
        continue;
      }

      // 保存之前的数组
      if (inArray && currentKey && arrayBuffer.length > 0) {
        (config as any)[this.toCamelCase(currentKey)] = arrayBuffer;
        arrayBuffer = [];
        inArray = false;
      }

      // 键值对
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex !== -1) {
        const key = trimmed.slice(0, colonIndex).trim();
        const value = trimmed.slice(colonIndex + 1).trim();

        currentKey = key;

        if (value === '') {
          // 可能是数组开始
          inArray = true;
          arrayBuffer = [];
        } else {
          // 普通值
          const camelKey = this.toCamelCase(key);
          if (value === 'true') {
            (config as any)[camelKey] = true;
          } else if (value === 'false') {
            (config as any)[camelKey] = false;
          } else {
            (config as any)[camelKey] = value;
          }
        }
      }
    }

    // 处理最后的数组
    if (inArray && currentKey && arrayBuffer.length > 0) {
      (config as any)[this.toCamelCase(currentKey)] = arrayBuffer;
    }

    return config;
  }

  /**
   * 将 kebab-case 转换为 camelCase
   */
  private toCamelCase(str: string): string {
    return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }
}
