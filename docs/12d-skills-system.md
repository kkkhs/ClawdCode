# 第 12d 章：Skills 系统

> 本章实现 Skills 系统，让 Agent 具备可扩展的专业能力。

## 12d.1 概述

Skills 是一种核心扩展机制，通过 Markdown 文件（`SKILL.md`）定义专业能力和最佳实践。

**与 Slash Commands 的区别**：

| 特性 | Slash Commands | Skills |
|------|----------------|--------|
| 定义方式 | Markdown 文件 | SKILL.md 文件夹 |
| 调用方式 | 仅用户手动 | AI 自动 + 用户手动 |
| Token 消耗 | 执行时加载 | 渐进式披露 |

## 12d.2 渐进式披露

```
1. 发现阶段：系统提示仅包含 Skills 名称 + 描述
2. 激活阶段：AI 判断需要某个 Skill 时调用 Skill 工具
3. 加载阶段：按需加载完整 SKILL.md 内容
```

## 12d.3 类型定义

```typescript
// src/skills/types.ts

export interface SkillMetadata {
  name: string;                    // 唯一标识
  description: string;             // ≤1024 字符
  allowedTools?: string[];         // 工具限制
  argumentHint?: string;           // 参数提示
  userInvocable: boolean;          // /name 调用
  disableModelInvocation: boolean; // 禁止 AI 调用
  source: 'user' | 'project' | 'builtin';
  path: string;
}

export interface SkillContent {
  metadata: SkillMetadata;
  instructions: string;  // Markdown 正文
}
```

## 12d.4 目录结构与优先级

| 优先级 | 路径 | 说明 |
|--------|------|------|
| 最高 | `.clawdcode/skills/` | 项目级，可 Git 共享 |
| ↑ | `.claude/skills/` | 兼容 Claude Code |
| ↑ | `~/.clawdcode/skills/` | 用户级全局 |
| ↑ | `~/.claude/skills/` | 兼容 Claude Code |
| 最低 | (Built-in) | 内置 Skills |

## 12d.5 SKILL.md 格式

```markdown
---
name: code-review
description: 审查代码质量。在用户请求 Code Review 时使用。
allowed-tools:
  - Read
  - Grep
  - Bash(git:*)
user-invocable: true
---

# Code Review 指南

详细指令内容...
```

## 12d.6 SkillLoader

```typescript
// src/skills/SkillLoader.ts

export function parseSkillFile(content: string): ParsedSkillFile {
  // 匹配 YAML Frontmatter
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  
  // 解析 YAML
  const frontmatter = yaml.parse(match[1]);
  
  // 验证必填字段
  if (!frontmatter.name) throw new Error('Missing name');
  if (!frontmatter.description) throw new Error('Missing description');
  
  return { frontmatter, body: match[2].trim() };
}
```

## 12d.7 SkillRegistry

```typescript
// src/skills/SkillRegistry.ts

export class SkillRegistry {
  private skills: Map<string, SkillMetadata> = new Map();

  async initialize(workspaceRoot?: string): Promise<SkillDiscoveryResult> {
    // 1. 加载内置 Skills
    this.loadBuiltinSkills();
    
    // 2. 按优先级扫描目录
    await this.scanDirectory('~/.claude/skills', 'user');
    await this.scanDirectory('~/.clawdcode/skills', 'user');
    await this.scanDirectory('.claude/skills', 'project');
    await this.scanDirectory('.clawdcode/skills', 'project');
  }

  async loadContent(name: string): Promise<SkillContent | null> {
    // 按需加载完整内容
  }

  generateAvailableSkillsList(): string {
    // 生成 <available_skills> 系统提示
    return this.getModelInvocableSkills()
      .map(s => `- ${s.name}: ${s.description}`)
      .join('\n');
  }
}
```

## 12d.8 内置 Skills

```typescript
// skill-creator 内置 Skill
{
  name: 'skill-creator',
  description: '帮助创建新的 Skill。当用户想要创建自定义 Skill 时使用。',
  userInvocable: true,
  source: 'builtin',
}
```

## 12d.9 Skill 工具

```typescript
// src/tools/builtin/skill.ts

export const skillTool = createTool({
  name: 'Skill',
  description: `Load a skill to get specialized instructions for a task.`,

  parameters: z.object({
    skill: z.string().describe('The name of the skill to load'),
    args: z.string().optional(),
  }),

  execute: async ({ skill, args }) => {
    const registry = getSkillRegistry();
    const content = await registry.loadContent(skill);
    
    if (!content) {
      return { success: false, error: `Skill not found: ${skill}` };
    }

    return {
      success: true,
      output: `## Skill: ${content.metadata.name}\n\n${content.instructions}`,
    };
  },
});
```

## 12d.10 Agent 集成

### 系统提示注入

```typescript
// src/prompts/builder.ts

// 3. 可用 Skills 列表
const skillRegistry = getSkillRegistry();
if (skillRegistry.isInitialized()) {
  const skillsList = skillRegistry.generateAvailableSkillsList();
  if (skillsList) {
    parts.push(`# Available Skills\n\n${skillsList}`);
  }
}
```

### ClawdInterface 初始化

```typescript
// src/ui/components/ClawdInterface.tsx

// 5. 初始化 Skills 系统
const { initializeSkills } = await import('../../skills/index.js');
const skillsResult = await initializeSkills(process.cwd());
```

## 12d.11 新增文件

| 文件 | 说明 |
|------|------|
| `src/skills/types.ts` | 类型定义 |
| `src/skills/SkillLoader.ts` | SKILL.md 解析器 |
| `src/skills/SkillRegistry.ts` | 注册中心（扫描、加载、管理） |
| `src/skills/index.ts` | 模块导出 |
| `src/tools/builtin/skill.ts` | Skill 工具 |

## 12d.12 `/skills` 管理命令

```typescript
// src/slash-commands/builtinCommands.ts

export const skillsCommand: SlashCommand = {
  name: 'skills',
  aliases: ['sk'],
  description: '查看和管理 Skills',
  category: 'skills',
  usage: '/skills [name|refresh]',
  examples: ['/skills', '/skills commit-message', '/skills refresh'],
};
```

用法：
- `/skills` - 列出所有 Skills（按来源分组）
- `/skills <name>` - 查看特定 Skill 详情
- `/skills refresh` - 重新扫描并加载 Skills

## 12d.13 测试方法

### 1. 创建测试 Skill

```bash
# 创建用户级 skills 目录
mkdir -p ~/.clawdcode/skills/test-skill

# 创建 SKILL.md
cat > ~/.clawdcode/skills/test-skill/SKILL.md << 'EOF'
---
name: test-skill
description: A test skill for verification
user-invocable: false
---

# Test Skill Instructions

This is a test skill. When activated, respond with "Test skill loaded successfully!"

## Guidelines
1. Always acknowledge the skill was loaded
2. Follow these test instructions
EOF
```

### 2. 启动并验证

```bash
# 启动 ClawdCode
npm run dev

# 或直接运行
node dist/main.js
```

### 3. 测试 /skills 命令

```
/skills              # 应显示 test-skill 在"用户级"分组
/skills test-skill   # 应显示 Skill 详情
/skills refresh      # 应显示刷新结果
```

### 4. 测试 Skill 工具调用

向 AI 发送：
```
请使用 test-skill 这个 skill
```

AI 应该：
1. 调用 Skill 工具加载 `test-skill`
2. 根据 Skill 指令回复 "Test skill loaded successfully!"

### 5. 测试内置 Skill

```
/skills skill-creator   # 查看内置的 skill-creator 详情
```

### 6. 清理测试

```bash
rm -rf ~/.clawdcode/skills/test-skill
```

### 7. Debug 模式

```bash
node dist/main.js --debug
```

启动时会显示：
```
[DEBUG] Loaded N skills
```

## 12d.14 TODO

- [ ] SkillInstaller 自动下载官方 Skills
- [ ] User-invocable Skills 自动生成命令
