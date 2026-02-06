/**
 * Skills 系统类型定义
 * 
 * Skills 是一种核心扩展机制，允许通过 SKILL.md 定义专业能力和最佳实践。
 * 支持 AI 自动调用和用户手动调用两种方式。
 */

/**
 * Skill 来源
 */
export type SkillSource = 'user' | 'project' | 'builtin';

/**
 * Skill 元数据（启动时加载，占用少量 Token）
 * 
 * 用于渐进式披露的"发现阶段"，仅包含名称和描述
 */
export interface SkillMetadata {
  /** 唯一标识，小写+数字+连字符，≤64字符 */
  name: string;
  
  /** 激活描述，≤1024字符，包含"什么"和"何时使用" */
  description: string;
  
  /** 工具访问限制，如 ['Read', 'Grep', 'Bash(git:*)'] */
  allowedTools?: string[];
  
  /** 参数提示，如 '<file_path>' */
  argumentHint?: string;
  
  /** 是否支持 /skill-name 调用（默认 false） */
  userInvocable: boolean;
  
  /** 是否禁止 AI 自动调用（默认 false） */
  disableModelInvocation: boolean;
  
  /** 指定执行模型 */
  model?: string;
  
  /** 额外触发条件，补充 description */
  whenToUse?: string;
  
  /** 版本号 */
  version?: string;
  
  /** 来源 */
  source: SkillSource;
  
  /** 来源目录类型 */
  sourceDir: 'claude' | 'clawdcode';
  
  /** SKILL.md 文件路径 */
  path: string;
  
  /** Skill 目录路径 */
  basePath: string;
}

/**
 * Skill 完整内容（按需加载）
 * 
 * 用于渐进式披露的"加载阶段"
 */
export interface SkillContent {
  metadata: SkillMetadata;
  /** Markdown 正文（指令内容） */
  instructions: string;
}

/**
 * SKILL.md Frontmatter 配置
 */
export interface SkillFrontmatter {
  /** 必填：Skill 名称 */
  name: string;
  
  /** 必填：描述（AI 用于判断何时调用） */
  description: string;
  
  /** 可选：允许的工具列表 */
  'allowed-tools'?: string[];
  
  /** 可选：是否允许用户通过 /name 调用 */
  'user-invocable'?: boolean;
  
  /** 可选：是否禁止 AI 自动调用 */
  'disable-model-invocation'?: boolean;
  
  /** 可选：参数提示 */
  'argument-hint'?: string;
  
  /** 可选：指定模型 */
  model?: string;
  
  /** 可选：额外触发条件 */
  when_to_use?: string;
  
  /** 可选：版本号 */
  version?: string;
}

/**
 * 解析后的 SKILL.md 文件
 */
export interface ParsedSkillFile {
  frontmatter: SkillFrontmatter;
  body: string;
}

/**
 * Skill 发现结果
 */
export interface SkillDiscoveryResult {
  /** 加载的 Skills 数量 */
  count: number;
  /** 按来源分类的数量 */
  bySource: {
    user: number;
    project: number;
    builtin: number;
  };
  /** 错误列表 */
  errors: Array<{
    path: string;
    error: string;
  }>;
}

/**
 * Skill 工具参数
 */
export interface SkillToolParams {
  /** Skill 名称 */
  skill: string;
  /** 可选：传递给 Skill 的参数 */
  args?: string;
}

/**
 * Skill 工具结果
 */
export interface SkillToolResult {
  success: boolean;
  content?: string;
  error?: string;
}
