# 第 12a 章：Slash Commands 系统

> 本章实现 Slash Commands 系统，提供用户与 Agent 交互的快捷方式。

## 12a.1 概述

Slash Commands 是以 `/` 开头的快捷命令，让用户可以快速执行常用操作：

```plaintext
/help      - Show available commands
/clear     - Clear conversation history
/compact   - Compact context manually
/theme     - Switch theme
/model     - Manage model configuration
/mcp       - Show MCP server status
/status    - Show session status
/version   - Show version info
/copy      - Copy code block to clipboard
/thinking  - Toggle thinking block expansion
```

## 12a.2 类型定义

### 核心类型

```typescript
// src/slash-commands/types.ts

/**
 * 命令分类
 */
export type CommandCategory = 
  | 'general'      // 通用命令
  | 'session'      // 会话相关
  | 'config'       // 配置相关
  | 'git'          // Git 相关
  | 'mcp'          // MCP 相关
  | 'custom';      // 自定义命令

/**
 * Slash 命令上下文
 */
export interface SlashCommandContext {
  cwd: string;           // 当前工作目录
  sessionId?: string;    // 会话 ID
  messages?: any[];      // 消息历史
}

/**
 * Slash 命令结果
 */
export interface SlashCommandResult {
  success: boolean;
  type?: 'success' | 'error' | 'info' | 'silent';
  content?: string;        // Markdown 内容
  message?: string;        // 简短提示
  error?: string;          // 错误信息
  shouldContinue?: boolean;
  sendToAgent?: boolean;   // 是否将 content 发送给 Agent 执行
  data?: any;
}

/**
 * Slash 命令定义
 */
export interface SlashCommand {
  name: string;
  aliases?: string[];
  description: string;
  fullDescription?: string;
  usage?: string;
  category?: CommandCategory;
  examples?: string[];
  handler: (args: string, context: SlashCommandContext) => Promise<SlashCommandResult>;
}

/**
 * 命令建议（用于模糊匹配）
 */
export interface CommandSuggestion {
  command: string;       // 完整命令（含 /）
  description: string;
  matchScore?: number;   // 匹配分数 (0-100)
}
```

### 自定义命令类型

```typescript
/**
 * 自定义命令 Frontmatter 配置
 */
export interface CustomCommandConfig {
  description?: string;           // AI 调用必需
  argumentHint?: string;          // 参数提示
  allowedTools?: string[];        // 限制可用工具
  model?: string;                 // 指定模型
  disableModelInvocation?: boolean; // 禁止 AI 调用
}

/**
 * 自定义命令
 */
export interface CustomCommand {
  name: string;
  namespace?: string;             // 命名空间（子目录）
  config: CustomCommandConfig;
  content: string;                // Markdown 正文
  path: string;                   // 文件路径
  source: 'user' | 'project';
  sourceDir: 'claude' | 'clawdcode';
}
```

## 12a.3 命令注册中心

```typescript
// src/slash-commands/index.ts

// 全局命令注册表
const commandRegistry: SlashCommandRegistry = {};

/**
 * 获取命令（支持别名）
 */
export function getCommand(name: string): SlashCommand | undefined {
  const normalizedName = name.toLowerCase();
  
  // 直接匹配
  if (commandRegistry[normalizedName]) {
    return commandRegistry[normalizedName];
  }
  
  // 按别名查找
  for (const cmd of Object.values(commandRegistry)) {
    if (cmd.aliases?.includes(normalizedName)) {
      return cmd;
    }
  }
  
  return undefined;
}

/**
 * 执行 slash 命令
 */
export async function executeSlashCommand(
  input: string,
  context: SlashCommandContext
): Promise<SlashCommandResult> {
  const parsed = parseSlashCommand(input);
  if (!parsed) {
    return { success: false, type: 'error', error: '无效的命令格式' };
  }
  
  const { name, args } = parsed;
  const command = getCommand(name);
  
  if (!command) {
    // 模糊匹配建议
    const suggestions = getFuzzyCommandSuggestions(name);
    let errorMsg = `未知命令: /${name}`;
    
    if (suggestions.length > 0) {
      errorMsg += `\n\n你是否想输入：\n`;
      for (const s of suggestions.slice(0, 3)) {
        errorMsg += `- \`${s.command}\` - ${s.description}\n`;
      }
    }
    
    return { success: false, type: 'error', error: errorMsg };
  }
  
  return await command.handler(args, context);
}
```

## 12a.4 模糊匹配

使用 `fuse.js` 实现智能命令补全：

```typescript
import Fuse from 'fuse.js';

export function getFuzzyCommandSuggestions(input: string): CommandSuggestion[] {
  const query = (input.startsWith('/') ? input.slice(1) : input).trim().toLowerCase();
  
  const searchableCommands = Object.values(commandRegistry).map((cmd) => ({
    name: cmd.name,
    description: cmd.description,
    aliases: cmd.aliases || [],
  }));
  
  // 精确前缀匹配优先
  const prefixMatches = searchableCommands.filter(
    (cmd) => cmd.name.startsWith(query) || cmd.aliases.some((a) => a.startsWith(query))
  );
  
  if (prefixMatches.length > 0) {
    return prefixMatches.map((item) => ({
      command: `/${item.name}`,
      description: item.description,
      matchScore: 90,
    }));
  }
  
  // Fuse.js 模糊匹配
  const fuse = new Fuse(searchableCommands, {
    keys: [
      { name: 'name', weight: 3 },
      { name: 'aliases', weight: 2.5 },
      { name: 'description', weight: 0.5 },
    ],
    threshold: 0.4,
    includeScore: true,
  });
  
  return fuse.search(query)
    .map((result) => ({
      command: `/${result.item.name}`,
      description: result.item.description,
      matchScore: Math.round((1 - (result.score ?? 1)) * 100),
    }))
    .filter((s) => (s.matchScore || 0) >= 40);
}
```

## 12a.5 内置命令

> **风格指南**：所有内置命令输出采用简洁英文，无 emoji，geek style。

### /help - 帮助命令

```typescript
export const helpCommand: SlashCommand = {
  name: 'help',
  aliases: ['?', 'h'],
  description: 'Show available commands',
  category: 'general',

  async handler(args: string): Promise<SlashCommandResult> {
    // 查看特定命令的帮助
    if (args.trim()) {
      const cmd = getCommand(args.trim());
      if (cmd) { /* 返回命令详情 */ }
    }
    
    // 按分类显示所有命令（使用简洁英文分类名）
    const categoryNames: Record<string, string> = {
      general: 'General', session: 'Session', config: 'Config',
      mcp: 'MCP', custom: 'Custom',
    };
  },
};
```

### /clear - 清除历史

```typescript
export const clearCommand: SlashCommand = {
  name: 'clear',
  aliases: ['cls'],
  description: 'Clear conversation history',
  category: 'session',

  async handler(): Promise<SlashCommandResult> {
    sessionActions().clearMessages();
    return { success: true, message: 'conversation cleared' };
  },
};
```

### /theme - 主题切换

```typescript
export const themeCommand: SlashCommand = {
  name: 'theme',
  aliases: ['t'],
  description: 'Show or switch theme',
  category: 'config',

  async handler(args: string): Promise<SlashCommandResult> {
    // ...
  },
};
```

### /copy - 复制代码块

```typescript
export const copyCommand: SlashCommand = {
  name: 'copy',
  aliases: ['cp'],
  description: 'Copy code block to clipboard',
  usage: '/copy [n | list]',
  category: 'general',

  async handler(args: string, context: SlashCommandContext): Promise<SlashCommandResult> {
    // /copy       → 复制最后一个代码块
    // /copy 2     → 复制倒数第 2 个代码块
    // /copy list  → 列出所有代码块供选择
  },
};
```

**功能**：
- `/copy` — 复制最后一个代码块到系统剪贴板
- `/copy N` — 复制倒数第 N 个代码块
- `/copy list` (或 `/copy ls`) — 列出所有代码块（最新在前），显示编号

**平台支持**：macOS (`pbcopy`)、Linux (`xclip`/`xsel`)、Windows (`clip`)。

### /thinking - 思考块展开

```typescript
export const thinkingCommand: SlashCommand = {
  name: 'thinking',
  description: 'Toggle thinking block expansion',
  category: 'general',

  async handler(): Promise<SlashCommandResult> {
    appActions().toggleShowAllThinking();
    const current = getState().showAllThinking;
    return { success: true, message: current ? 'thinking: expanded' : 'thinking: collapsed' };
  },
};
```

## 12a.6 自定义命令系统

### 目录结构

```plaintext
项目级命令（可 Git 共享）：
  .clawdcode/commands/
  .claude/commands/

用户级命令（全局可用）：
  ~/.clawdcode/commands/
  ~/.claude/commands/
```

### 命令文件格式

```markdown
---
description: 运行测试并分析失败原因
argument-hint: [测试文件或模式]
allowed-tools:
  - Bash(npm:*)
  - Read
  - Glob
---

请运行测试并分析结果。

## 测试范围

$ARGUMENTS

## 执行要求

1. 运行 `npm test $ARGUMENTS`
2. 分析失败的测试用例
3. 提供修复建议
```

### 动态内容语法

| 语法 | 说明 | 示例 |
|------|------|------|
| `$ARGUMENTS` | 全部参数 | `/test foo bar` → `foo bar` |
| `$1`, `$2`, ... | 位置参数 | `/greet Alice` → `$1=Alice` |
| `!`command`` | Bash 嵌入 | `!`git branch --show-current`` |
| `@path/to/file` | 文件引用 | `@package.json` |

### CustomCommandLoader

```typescript
export class CustomCommandLoader {
  async discover(workspaceRoot: string): Promise<CustomCommandDiscoveryResult> {
    // 按优先级扫描目录
    const directories = [
      { path: '~/.clawdcode/commands', source: 'user', priority: 1 },
      { path: '~/.claude/commands', source: 'user', priority: 2 },
      { path: '.clawdcode/commands', source: 'project', priority: 3 },
      { path: '.claude/commands', source: 'project', priority: 4 },
    ];
    
    // 后面的覆盖前面的同名命令
  }

  private parseFrontmatter(content: string): { config: CustomCommandConfig; body: string } {
    // 解析 YAML Frontmatter
  }
}
```

### CustomCommandExecutor

```typescript
export class CustomCommandExecutor {
  async execute(command: CustomCommand, context: CustomCommandExecutionContext): Promise<string> {
    let content = command.content;
    
    // 1. 参数插值
    content = this.interpolateArgs(content, context.args);
    
    // 2. Bash 嵌入执行
    content = await this.executeBashEmbeds(content, context);
    
    // 3. 文件引用替换
    content = await this.resolveFileReferences(content, context.workspaceRoot);
    
    return content;
  }
}
```

## 12a.7 UI 集成

### 初始化自定义命令

在应用启动时调用 `initializeCustomCommands` 加载自定义命令：

```typescript
// src/ui/components/ClawdInterface.tsx

// 在 Agent 初始化后
const { initializeCustomCommands } = await import('../../slash-commands/index.js');
const customCmdResult = await initializeCustomCommands(process.cwd());

if (customCmdResult.count > 0) {
  console.log('Loaded', customCmdResult.count, 'custom commands');
}
```

### 命令补全建议

输入 `/` 开头时，自动显示模糊匹配的命令建议。采用极简风格：

```
  ... 2 more above
  > /help - Show available commands
    /history - Show command history
    /theme - Show or switch theme
  ... 3 more below
  ─ tab · ↑↓ · esc
╭──────────────────────────────────────────╮
│ > /hel                                   │
╰──────────────────────────────────────────╯
```

**交互方式：**

| 按键 | 功能 |
|------|------|
| `↑` / `↓` | 上下选择建议 |
| `Tab` | 补全选中的命令 |
| `Enter` | 补全并执行（如果有建议） |
| `Esc` | 关闭建议列表 |

### CommandSuggestions 组件

```typescript
// src/ui/components/input/CommandSuggestions.tsx

const MAX_VISIBLE = 10;  // 默认显示 10 个（从 5 增加）

export const CommandSuggestions: React.FC<CommandSuggestionsProps> = ({
  suggestions, selectedIndex, visible,
}) => {
  // 无 border、无 emoji，`> ` 为选中指示器
  // 上下溢出提示：`... N more above/below`
  // 底部简洁提示：`─ tab · ↑↓ · esc`
};
```

### InputArea 补全逻辑

```typescript
// src/ui/components/input/InputArea.tsx

// 计算命令建议
const suggestions = useMemo(() => {
  if (!input.startsWith('/') || input.includes(' ')) {
    return [];
  }
  return getCommandCompletions(input);
}, [input]);

// Tab 补全
const handleTabComplete = useCallback(() => {
  if (suggestions.length > 0 && showSuggestions) {
    const selected = suggestions[selectedIndex];
    onChange(selected.command + ' ');
    setShowSuggestions(false);
  }
}, [suggestions, selectedIndex]);

// 上下选择
useInput((char, key) => {
  if (key.tab) handleTabComplete();
  if (key.escape) setShowSuggestions(false);
});
```

### ClawdInterface 处理 Slash Commands

```typescript
const handleSubmit = useCallback(async (value: string) => {
  if (!value.trim()) return;
  
  // 检查是否是 slash 命令
  if (isSlashCommand(value)) {
    sessionActions().addUserMessage(value);
    sessionActions().setThinking(true);
    
    try {
      const result = await executeSlashCommand(value, {
        cwd: process.cwd(),
        sessionId,
        messages,
      });
      
      // 显示命令结果
      if (result.content) {
        sessionActions().addAssistantMessage(result.content);
      } else if (result.message) {
        sessionActions().addAssistantMessage(result.message);
      } else if (result.error) {
        sessionActions().addAssistantMessage(`❌ ${result.error}`);
      }
    } finally {
      sessionActions().setThinking(false);
    }
    return;
  }
  
  // 正常消息处理...
}, [/* deps */]);
```

## 12a.8 测试方法

```bash
# 启动应用
bun run dev
```

### 测试命令补全

1. 输入 `/` → 显示所有命令建议
2. 输入 `/hel` → 显示 `/help` 建议
3. 按 `↓` → 选择下一个建议
4. 按 `Tab` → 补全选中的命令
5. 按 `Esc` → 关闭建议列表

### 测试内置命令

```
/help         # 显示所有命令
/help clear   # 显示 clear 命令详情
/version      # 显示版本信息
/status       # 显示会话状态
/theme        # 显示当前主题
/theme dark   # 切换到 dark 主题
/mcp          # 显示 MCP 服务器状态
/mcp tools    # 显示 MCP 工具列表
/clear        # 清除对话历史
```

### 测试模糊匹配

```
/hel    # 应该建议 /help
/clr    # 应该建议 /clear
/th     # 应该建议 /theme
```

### 预期结果

- 输入 `/` 时显示建议列表
- ↑↓ 可以切换选中项
- Tab 补全后自动添加空格
- 命令执行后显示结果

## 12a.9 新增文件

| 文件 | 说明 |
|------|------|
| `src/slash-commands/types.ts` | 类型定义（更新） |
| `src/slash-commands/index.ts` | 命令注册中心（更新） |
| `src/slash-commands/builtinCommands.ts` | 内置命令 |
| `src/slash-commands/custom/CustomCommandLoader.ts` | 自定义命令加载器 |
| `src/slash-commands/custom/CustomCommandExecutor.ts` | 自定义命令执行器 |
| `src/slash-commands/custom/CustomCommandRegistry.ts` | 自定义命令注册中心 |
| `src/slash-commands/custom/index.ts` | 模块导出 |
| `src/ui/components/input/CommandSuggestions.tsx` | 命令补全建议组件 |
| `src/ui/components/input/InputArea.tsx` | 输入区域（更新，添加补全） |

## 12a.10 技术亮点

1. **模糊匹配**
   - 使用 `fuse.js` 实现智能补全
   - 前缀匹配优先级最高
   - 支持别名搜索

2. **命令补全 UI**
   - 输入 `/` 时自动显示建议
   - ↑↓ 选择 + Tab 补全
   - 滚动窗口：选中项始终可见
   - 上下方显示 `↑/↓` 省略提示

3. **自定义命令**
   - Markdown 文件定义命令
   - YAML Frontmatter 配置元数据
   - 动态内容插值（参数、Bash、文件）

4. **多目录支持**
   - 用户级 + 项目级命令
   - 后者覆盖前者（优先级）
   - 命名空间隔离（子目录）

5. **Claude Code 兼容**
   - 支持 `.claude/commands/` 目录
   - 相同的 Frontmatter 格式
   - 相同的动态内容语法

## 12a.11 已实现的新功能

- [x] `/copy` 命令 — 复制代码块到剪贴板，支持 `/copy list` 选择
- [x] `/thinking` 命令 — 全局切换思考块展开/折叠
- [x] `sendToAgent` — 自定义命令结果可自动发送给 Agent 执行
- [x] 命令建议 UI 极简化 — 无 emoji、`MAX_VISIBLE=10`、geek style
- [x] 内置命令输出英文化 — 所有输出简洁英文

## 12a.12 TODO

以下功能待后续实现：

- [ ] SlashCommand 工具（让 AI 调用自定义命令）
- [ ] /git 命令（AI Code Review、智能 Commit）
- [ ] /init 命令（生成 CLAWDCODE.md）
