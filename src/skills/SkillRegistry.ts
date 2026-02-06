/**
 * SkillRegistry - Skills 注册中心
 * 
 * 负责扫描、加载和管理所有 Skills。
 * 支持渐进式披露：启动时只加载元数据，运行时按需加载完整内容。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { parseSkillFile, extractMetadataFields } from './SkillLoader.js';
import type {
  SkillMetadata,
  SkillContent,
  SkillSource,
  SkillDiscoveryResult,
} from './types.js';

/**
 * 内置 Skills（作为离线 fallback）
 */
const BUILTIN_SKILLS: Map<string, SkillContent> = new Map([
  // skill-creator 内置 Skill
  ['skill-creator', {
    metadata: {
      name: 'skill-creator',
      description: '帮助创建新的 Skill。当用户想要创建自定义 Skill 或询问如何编写 SKILL.md 时使用。',
      userInvocable: true,
      disableModelInvocation: false,
      source: 'builtin',
      sourceDir: 'clawdcode',
      path: '',
      basePath: '',
    },
    instructions: `# Skill Creator 指南

你是一个 Skill 创建助手。帮助用户创建新的 SKILL.md 文件。

## SKILL.md 格式

\`\`\`markdown
---
name: my-skill
description: 简短描述这个 Skill 做什么，以及何时使用它。
allowed-tools:
  - Read
  - Grep
  - Bash(git:*)
user-invocable: true
---

# Skill 标题

详细的指令内容...
\`\`\`

## 必填字段

- **name**: 1-64 字符，小写字母+数字+连字符
- **description**: ≤1024 字符，描述功能和触发时机

## 可选字段

- **allowed-tools**: 限制可用工具
- **user-invocable**: 允许 /name 调用
- **disable-model-invocation**: 禁止 AI 自动调用
- **argument-hint**: 参数提示，如 \`<file_path>\`

## 存放位置

- 项目级（Git 共享）: \`.clawdcode/skills/<name>/SKILL.md\`
- 用户级（全局）: \`~/.clawdcode/skills/<name>/SKILL.md\`

## 示例

请告诉我你想创建什么类型的 Skill，我会帮你生成完整的 SKILL.md 文件。
`,
  }],
]);

/**
 * Skills 注册中心（单例）
 */
export class SkillRegistry {
  private static instance: SkillRegistry | null = null;
  private skills: Map<string, SkillMetadata> = new Map();
  private initialized = false;
  private workspaceRoot: string = process.cwd();

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): SkillRegistry {
    if (!SkillRegistry.instance) {
      SkillRegistry.instance = new SkillRegistry();
    }
    return SkillRegistry.instance;
  }

  /**
   * 重置实例（仅用于测试）
   */
  static resetInstance(): void {
    SkillRegistry.instance = null;
  }

  /**
   * 初始化：按优先级扫描各目录
   * 
   * 优先级（低到高）：
   * 1. 内置 Skills
   * 2. ~/.claude/skills
   * 3. ~/.clawdcode/skills
   * 4. .claude/skills
   * 5. .clawdcode/skills（最高优先级）
   */
  async initialize(workspaceRoot?: string): Promise<SkillDiscoveryResult> {
    if (workspaceRoot) {
      this.workspaceRoot = workspaceRoot;
    }

    const result: SkillDiscoveryResult = {
      count: 0,
      bySource: { user: 0, project: 0, builtin: 0 },
      errors: [],
    };

    // 1. 加载内置 Skills（优先级最低）
    this.loadBuiltinSkills();
    result.bySource.builtin = BUILTIN_SKILLS.size;

    // 2. 按优先级扫描目录（后加载的覆盖先加载的）
    const homeDir = os.homedir();

    // 用户级 - claude 目录
    await this.scanDirectory(
      path.join(homeDir, '.claude', 'skills'),
      'user',
      'claude',
      result
    );

    // 用户级 - clawdcode 目录
    await this.scanDirectory(
      path.join(homeDir, '.clawdcode', 'skills'),
      'user',
      'clawdcode',
      result
    );

    // 项目级 - claude 目录
    await this.scanDirectory(
      path.join(this.workspaceRoot, '.claude', 'skills'),
      'project',
      'claude',
      result
    );

    // 项目级 - clawdcode 目录（最高优先级）
    await this.scanDirectory(
      path.join(this.workspaceRoot, '.clawdcode', 'skills'),
      'project',
      'clawdcode',
      result
    );

    result.count = this.skills.size;
    this.initialized = true;

    return result;
  }

  /**
   * 加载内置 Skills
   */
  private loadBuiltinSkills(): void {
    for (const [name, content] of BUILTIN_SKILLS) {
      this.skills.set(name, content.metadata);
    }
  }

  /**
   * 扫描目录中的 Skills
   */
  private async scanDirectory(
    dir: string,
    source: SkillSource,
    sourceDir: 'claude' | 'clawdcode',
    result: SkillDiscoveryResult
  ): Promise<void> {
    if (!fs.existsSync(dir)) {
      return;
    }

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillDir = path.join(dir, entry.name);
      const skillPath = path.join(skillDir, 'SKILL.md');

      if (!fs.existsSync(skillPath)) continue;

      try {
        const metadata = await this.loadMetadata(skillPath, source, sourceDir);
        this.skills.set(metadata.name, metadata);
        
        if (source === 'user') {
          result.bySource.user++;
        } else {
          result.bySource.project++;
        }
      } catch (error) {
        result.errors.push({
          path: skillPath,
          error: (error as Error).message,
        });
      }
    }
  }

  /**
   * 加载 Skill 元数据（仅 Frontmatter）
   */
  private async loadMetadata(
    skillPath: string,
    source: SkillSource,
    sourceDir: 'claude' | 'clawdcode'
  ): Promise<SkillMetadata> {
    const content = await fs.promises.readFile(skillPath, 'utf-8');
    const { frontmatter } = parseSkillFile(content);
    const fields = extractMetadataFields(frontmatter);

    return {
      name: frontmatter.name,
      description: frontmatter.description,
      ...fields,
      source,
      sourceDir,
      path: skillPath,
      basePath: path.dirname(skillPath),
    };
  }

  /**
   * 按需加载完整内容
   */
  async loadContent(name: string): Promise<SkillContent | null> {
    const metadata = this.skills.get(name);
    if (!metadata) {
      return null;
    }

    // 内置 Skill 直接返回
    if (metadata.source === 'builtin') {
      return BUILTIN_SKILLS.get(name) || null;
    }

    // 从文件加载
    try {
      const content = await fs.promises.readFile(metadata.path, 'utf-8');
      const { body } = parseSkillFile(content);

      return {
        metadata,
        instructions: body,
      };
    } catch {
      return null;
    }
  }

  /**
   * 获取所有 Skills 元数据
   */
  getAllSkills(): SkillMetadata[] {
    return Array.from(this.skills.values());
  }

  /**
   * 获取可被 AI 调用的 Skills
   */
  getModelInvocableSkills(): SkillMetadata[] {
    return Array.from(this.skills.values())
      .filter(skill => !skill.disableModelInvocation);
  }

  /**
   * 获取可被用户调用的 Skills
   */
  getUserInvocableSkills(): SkillMetadata[] {
    return Array.from(this.skills.values())
      .filter(skill => skill.userInvocable);
  }

  /**
   * 检查 Skill 是否存在
   */
  hasSkill(name: string): boolean {
    return this.skills.has(name);
  }

  /**
   * 获取 Skill 元数据
   */
  getSkill(name: string): SkillMetadata | undefined {
    return this.skills.get(name);
  }

  /**
   * 获取 Skills 数量
   */
  getCount(): number {
    return this.skills.size;
  }

  /**
   * 刷新：重新扫描所有目录
   */
  async refresh(): Promise<SkillDiscoveryResult> {
    this.skills.clear();
    this.initialized = false;
    return this.initialize(this.workspaceRoot);
  }

  /**
   * 生成 <available_skills> 系统提示片段
   * 
   * 仅包含可被 AI 调用的 Skills（渐进式披露的"发现阶段"）
   */
  generateAvailableSkillsList(): string {
    const skills = this.getModelInvocableSkills();
    if (skills.length === 0) {
      return '';
    }

    const lines = skills.map(skill => {
      const hint = skill.argumentHint ? ` ${skill.argumentHint}` : '';
      return `- ${skill.name}${hint}: ${skill.description}`;
    });

    return `<available_skills>
${lines.join('\n')}
</available_skills>`;
  }

  /**
   * 是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

// 导出单例获取函数
export function getSkillRegistry(): SkillRegistry {
  return SkillRegistry.getInstance();
}
