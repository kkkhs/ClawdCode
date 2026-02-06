# 第 12d 章：Skills 系统

> 本章实现 Skills 系统，让 Agent 具备可扩展的专业能力。

## 12d.1 什么是 Skills？

Skills 是 ClawdCode 的核心扩展机制，允许通过 Markdown 文件（`SKILL.md`）定义专业能力、工作流规范和最佳实践。

**与 Slash Commands 的区别**：

| 特性 | Slash Commands | Skills |
|------|----------------|--------|
| 定义方式 | 单个 .md 文件 | SKILL.md 文件夹 |
| 调用方式 | 仅用户 `/command` | AI 自动 + 用户手动 |
| Token 消耗 | 执行时加载 | **渐进式披露** |
| 适用场景 | 快捷操作 | 专业能力/最佳实践 |

**调用方式**：

- **AI 自动调用**：Agent 根据 `description` 自动判断何时使用
- **用户手动调用**：通过 `/skills` 命令查看和管理

## 12d.2 核心机制：渐进式披露

为平衡上下文窗口和能力扩展，Skills 采用**渐进式披露（Progressive Disclosure）**：

```
┌─────────────────────────────────────────────────────────────┐
│ 1. 发现阶段                                                  │
│    系统提示仅包含 Skill 名称 + 描述（几乎不消耗 Token）         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. 决策阶段                                                  │
│    Agent 匹配用户请求 → 判断需要某个 Skill                    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. 加载阶段                                                  │
│    调用 Skill 工具 → 加载完整 SKILL.md → 注入上下文           │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. 执行阶段                                                  │
│    Agent 遵循 Skill 指令完成任务                             │
└─────────────────────────────────────────────────────────────┘
```

## 12d.3 为什么 Skill 是一个 Tool？

这是 Skills 系统的核心设计决策。

### Agent 与外部世界交互的唯一方式是 Tools

```
┌─────────────────────────────────────────────────────────┐
│                         LLM                             │
│  只能：1. 输出文本  2. 调用 Tools (Function Calls)       │
└─────────────────────────────────────────────────────────┘
                           ↓
              ┌────────────────────────┐
              │      Tool Calls        │
              │  - Read (读文件)        │
              │  - Bash (执行命令)      │
              │  - Skill (加载技能) ←   │  
              └────────────────────────┘
```

**Agent 无法"主动"做任何事**，它只能：
1. 输出文本给用户
2. 调用 Tools 与系统交互

因此，Skill 的"激活"本质上是 Agent **主动请求获取更多上下文**，这必须通过 Tool 机制实现。

### Tool 与 Function Call 的关系

Tool 在发送给 LLM API 时，会转换成 **Function Call** 格式：

```typescript
// ClawdCode 中定义的 Tool
const skillTool = createTool({
  name: 'Skill',
  schema: z.object({
    skill: z.string(),
    args: z.string().optional(),
  }),
  // ...
});

// 转换后发送给 OpenAI API 的格式
{
  "tools": [{
    "type": "function",
    "function": {
      "name": "Skill",
      "description": "Load a skill for specialized instructions",
      "parameters": {
        "type": "object",
        "properties": {
          "skill": { "type": "string" },
          "args": { "type": "string" }
        },
        "required": ["skill"]
      }
    }
  }]
}

// LLM 返回的 Function Call
{
  "tool_calls": [{
    "id": "call_abc123",
    "type": "function",
    "function": {
      "name": "Skill",
      "arguments": "{\"skill\": \"code-review\"}"
    }
  }]
}
```

这个流程：

```
Tool 定义 (Zod Schema)
        ↓ zodToJsonSchema()
JSON Schema (OpenAI tools 格式)
        ↓ API 请求
LLM 决策
        ↓ API 响应
Function Call (tool_calls)
        ↓ 解析 arguments
执行 Tool.execute()
        ↓
返回结果给 LLM
```

### 渐进式披露的实现机制

```
系统提示（启动时）:
┌─────────────────────────────────────────────────────────┐
│ # Available Skills                                      │
│ - code-review: 审查代码质量...                           │  ← 仅名称+描述
│ - commit-message: 生成 commit...                        │     (~100 tokens)
│                                                         │
│ When a request matches a skill, use the Skill tool.     │
└─────────────────────────────────────────────────────────┘

用户: "帮我审查这个 PR"

Agent 思考: 匹配到 code-review skill，需要加载完整指令
         ↓
Agent 调用: Skill(skill="code-review")  ← 这是一个 Tool Call
         ↓
Tool 返回: 完整的 SKILL.md 内容 (~2000 tokens)
         ↓
Agent: 现在有了完整指令，开始执行...
```

### 为什么不直接把 Skill 内容放进系统提示？

| 方案 | Token 消耗 | 问题 |
|------|-----------|------|
| 全部放入系统提示 | 10 Skills × 2000 = **20,000 tokens** | 浪费，大多数不会用到 |
| 渐进式披露 | 10 × 50 + 按需 = **500 + 2000** | 高效，仅加载需要的 |

### 类比：查字典

把 Skill Tool 想象成**查字典**：

- **系统提示** = 字典目录（只有词条名）
- **Skill Tool** = 翻到具体页面（获取完整解释）
- **Agent** = 学生（根据需要查阅）

这样 Agent 的"书包"（上下文窗口）不用装整本字典，只需带目录，按需查阅。

## 12d.4 目录结构与优先级

Skills 按以下优先级扫描（后加载覆盖先加载）：

| 优先级 | 范围 | 路径 | 说明 |
|--------|------|------|------|
| **最高** | 项目级 | `.clawdcode/skills/` | 项目专用，可 Git 共享 |
| ↑ | 项目级 | `.claude/skills/` | 兼容 Claude Code |
| ↑ | 用户级 | `~/.clawdcode/skills/` | 个人全局 Skills |
| ↑ | 用户级 | `~/.claude/skills/` | 兼容 Claude Code |
| **最低** | 内置 | (Built-in) | 内置 Skills |

**目录结构**：

```
.clawdcode/skills/
├── code-review/              # Skill 名称（目录名）
│   ├── SKILL.md              # [必需] 核心指令
│   └── REFERENCE.md          # [可选] 参考文档
└── commit-message/
    └── SKILL.md
```

## 12d.5 SKILL.md 规范

`SKILL.md` 由 **YAML Frontmatter** + **Markdown 正文** 组成：

```markdown
---
name: code-review
description: 审查代码质量和安全漏洞。在用户请求 Code Review 时使用。
allowed-tools:
  - Read
  - Grep
  - Bash(git:*)
user-invocable: true
argument-hint: <file_path>
---

# Code Review 指南

你是一位资深代码审查专家。

## 1. 获取变更

```bash
git diff HEAD~1 --stat
```

## 2. 审查重点

- **安全性**：SQL 注入、XSS
- **性能**：N+1 查询
- **可读性**：命名清晰

## 3. 输出格式

| 文件 | 问题 | 严重程度 | 建议 |
|------|------|----------|------|
```

**元数据字段**：

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | ✅ | 唯一标识，小写+数字+连字符，≤64 字符 |
| `description` | ✅ | ≤1024 字符，描述功能和触发时机 |
| `allowed-tools` | ❌ | 允许的工具，如 `Bash(git:*)` |
| `user-invocable` | ❌ | 是否支持用户调用（默认 false） |
| `disable-model-invocation` | ❌ | 禁止 AI 自动调用（默认 false） |
| `argument-hint` | ❌ | 参数提示，如 `<file_path>` |
| `model` | ❌ | 指定执行模型 |
| `when_to_use` | ❌ | 额外触发条件 |

## 12d.6 类型定义

```typescript
// src/skills/types.ts

/** Skill 来源 */
export type SkillSource = 'user' | 'project' | 'builtin';

/** Skill 元数据（启动时加载） */
export interface SkillMetadata {
  name: string;
  description: string;
  allowedTools?: string[];
  argumentHint?: string;
  userInvocable: boolean;
  disableModelInvocation: boolean;
  model?: string;
  whenToUse?: string;
  source: SkillSource;
  path: string;
  basePath: string;
}

/** Skill 完整内容（按需加载） */
export interface SkillContent {
  metadata: SkillMetadata;
  instructions: string;
}
```

## 12d.7 核心实现

### SkillLoader

解析 SKILL.md 文件：

```typescript
// src/skills/SkillLoader.ts

export function parseSkillFile(content: string): ParsedSkillFile {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    throw new Error('Invalid SKILL.md: missing frontmatter');
  }

  const frontmatter = yaml.parse(match[1]);
  
  // 验证必填字段
  if (!isValidSkillName(frontmatter.name)) {
    throw new Error('Invalid skill name');
  }

  return { frontmatter, body: match[2].trim() };
}
```

### SkillRegistry

单例注册中心：

```typescript
// src/skills/SkillRegistry.ts

export class SkillRegistry {
  private static instance: SkillRegistry | null = null;
  private skills: Map<string, SkillMetadata> = new Map();

  /** 初始化：按优先级扫描目录 */
  async initialize(workspaceRoot?: string): Promise<SkillDiscoveryResult> {
    this.loadBuiltinSkills();
    
    // 按优先级扫描（后加载覆盖先加载）
    await this.scanDirectory('~/.claude/skills', 'user');
    await this.scanDirectory('~/.clawdcode/skills', 'user');
    await this.scanDirectory('.claude/skills', 'project');
    await this.scanDirectory('.clawdcode/skills', 'project');
    
    return { count: this.skills.size, /* ... */ };
  }

  /** 按需加载完整内容 */
  async loadContent(name: string): Promise<SkillContent | null> {
    const metadata = this.skills.get(name);
    if (!metadata) return null;

    const content = await fs.readFile(metadata.path, 'utf-8');
    const { body } = parseSkillFile(content);

    return { metadata, instructions: body };
  }

  /** 生成系统提示中的 Skills 列表 */
  generateAvailableSkillsList(): string {
    const skills = this.getModelInvocableSkills();
    return skills.map(s => `- ${s.name}: ${s.description}`).join('\n');
  }
}
```

### Skill 工具

Agent 通过此工具加载 Skill：

```typescript
// src/tools/builtin/skill.ts

export const skillTool = createTool({
  name: 'Skill',
  kind: ToolKind.ReadOnly,
  schema: z.object({
    skill: z.string().describe('The skill name to load'),
    args: z.string().optional(),
  }),

  description: {
    short: 'Load a skill for specialized instructions',
    long: `Load a skill to get specialized instructions for a task.
Use when a user request matches an available skill's description.`,
  },

  execute: async ({ skill, args }) => {
    const registry = getSkillRegistry();
    const content = await registry.loadContent(skill);

    if (!content) {
      return {
        success: false,
        llmContent: `Skill "${skill}" not found`,
        displayContent: `Skill not found: ${skill}`,
      };
    }

    let result = `## Skill: ${content.metadata.name}\n\n`;
    result += content.instructions;
    if (args) result += `\n\n## Arguments\n\n${args}`;

    return {
      success: true,
      llmContent: result,
      displayContent: `✓ Loaded skill: ${content.metadata.name}`,
    };
  },
});
```

## 12d.8 系统提示集成

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

## 12d.9 `/skills` 管理命令

```typescript
// src/slash-commands/builtinCommands.ts

export const skillsCommand: SlashCommand = {
  name: 'skills',
  aliases: ['sk'],
  description: '查看和管理 Skills',
  category: 'skills',
  usage: '/skills [name|refresh]',
};
```

**用法**：

| 命令 | 说明 |
|------|------|
| `/skills` | 列出所有 Skills（按来源分组） |
| `/skills <name>` | 查看特定 Skill 详情 |
| `/skills refresh` | 重新扫描并加载 Skills |

**输出示例**：

```
## 🧠 Skills (3)

### 📦 内置
- `skill-creator` - Create new Skills

### 👤 用户级
- `commit-message` ⚡ - Generate commit messages

### 📁 项目级
- `code-review` - Code review guidelines

---
💡 使用 `/skills <name>` 查看详情 | ⚡ = 用户可调用
```

## 12d.10 内置 Skills

ClawdCode 内置一个 `skill-creator` Skill，帮助用户创建新的 Skills：

```typescript
const BUILTIN_SKILLS = new Map([
  ['skill-creator', {
    metadata: {
      name: 'skill-creator',
      description: 'Create new Skills for ClawdCode',
      source: 'builtin',
      userInvocable: false,
      disableModelInvocation: false,
    },
    instructions: `# Skill Creator Guide

Help users create new SKILL.md files following the specification...`,
  }],
]);
```

## 12d.11 示例：Commit Message Skill

创建 `.clawdcode/skills/commit-message/SKILL.md`：

```markdown
---
name: commit-message
description: 生成 Conventional Commits 格式的 commit message。
allowed-tools:
  - Bash(git:*)
  - Read
user-invocable: true
---

# Commit Message 生成指南

## 1. 获取变更

```bash
git diff --cached --stat
git diff --cached
```

## 2. Conventional Commits 格式

```
<type>(<scope>): <subject>
```

**type**：feat | fix | docs | style | refactor | test | chore

## 3. 规则

- subject ≤ 50 字符
- 祈使语气（"add" 而非 "added"）
- 不以句号结尾
```

**使用**：

```bash
# AI 自动识别
> 帮我提交代码

# 查看详情
> /skills commit-message
```

## 12d.12 最佳实践

1. **描述要清晰**

   ```yaml
   # ❌ Bad
   description: "Code helper."
   
   # ✅ Good
   description: "审查代码质量。在用户请求 Code Review 时使用。"
   ```

2. **最小权限原则**

   ```yaml
   allowed-tools:
     - Read
     - Grep
     - Bash(git:*)  # 仅允许 git 命令
   ```

3. **团队共享**：将 `.clawdcode/skills/` 提交到 Git

4. **选择调用方式**：
   - 频繁使用：`user-invocable: true`
   - 仅手动触发：`disable-model-invocation: true`

## 12d.13 Skills vs Subagents

| 场景 | 推荐 | 原因 |
|------|------|------|
| 特定方法/步骤 | Skills | 提供指南 |
| 独立子任务 | Subagents | 完整执行 |
| 代码审查实践 | Skills | 指导如何审查 |
| 并行多任务 | Subagents | 独立执行 |

**简单记忆**：
- **Skills** = "告诉我怎么做"（方法论）
- **Subagents** = "帮我去做"（执行者）

## 12d.14 测试方法

### 1. 创建测试 Skill

```bash
mkdir -p ~/.clawdcode/skills/test-skill

cat > ~/.clawdcode/skills/test-skill/SKILL.md << 'EOF'
---
name: test-skill
description: A test skill for verification
---

# Test Skill

When activated, respond: "Test skill loaded!"
EOF
```

### 2. 启动并验证

```bash
node dist/main.js --debug
```

应显示：`[DEBUG] Loaded N skills`

### 3. 测试命令

```
/skills              # 应列出 test-skill
/skills test-skill   # 应显示详情
/skills refresh      # 重新加载
```

### 4. 测试 AI 调用

```
> 请使用 test-skill
```

AI 应调用 Skill 工具并遵循指令。

### 5. 清理

```bash
rm -rf ~/.clawdcode/skills/test-skill
```

## 12d.15 修改的文件

| 文件 | 说明 |
|------|------|
| `src/skills/types.ts` | 类型定义 |
| `src/skills/SkillLoader.ts` | SKILL.md 解析器 |
| `src/skills/SkillRegistry.ts` | 注册中心 |
| `src/skills/index.ts` | 模块导出 |
| `src/tools/builtin/skill.ts` | Skill 工具 |
| `src/prompts/builder.ts` | 系统提示注入 |
| `src/slash-commands/builtinCommands.ts` | `/skills` 命令 |
| `src/slash-commands/types.ts` | 添加 skills 分类 |
| `src/ui/components/ClawdInterface.tsx` | 初始化 Skills |

## 12d.16 TODO

- [ ] SkillInstaller 自动下载官方 Skills
- [ ] User-invocable Skills 自动生成 Slash Commands
- [ ] Skill 权限验证（allowed-tools 检查）
