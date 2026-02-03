# 第六章：工具系统设计与实现

> 工具（Tool）是 Agent 与外部世界交互的桥梁。LLM 通过工具可以读写文件、执行命令、搜索代码。

## 6.1 工具系统概述

### 6.1.1 什么是工具

```
LLM 推理 → 工具调用 → 工具系统 → 文件系统/Shell/网络
                              ↓
                         返回结果 → LLM
```

工具让 LLM 能够：
- 读取和修改文件
- 执行 Shell 命令
- 搜索代码库
- 获取网页内容

### 6.1.2 工具系统架构

```
src/tools/
├── types.ts          # 类型定义 (ToolKind, Tool, ToolResult, ToolInvocation)
├── schemas.ts        # Zod 验证模式
├── createTool.ts     # 工具工厂函数
├── registry.ts       # 工具注册表 (支持 MCP 工具)
├── builtin/          # 内置工具
│   ├── read.ts       # 文件读取
│   ├── edit.ts       # 文件编辑
│   ├── write.ts      # 文件写入
│   ├── glob.ts       # 文件搜索
│   ├── grep.ts       # 内容搜索
│   ├── bash.ts       # Shell 命令
│   └── index.ts      # 导出
└── index.ts          # 导出
```

## 6.2 工具类型定义

### 6.2.1 ToolKind 枚举

```typescript
export enum ToolKind {
  ReadOnly = 'readonly',  // 只读操作，无副作用
  Write = 'write',        // 文件写入操作
  Execute = 'execute',    // 命令执行，可能有副作用
}
```

| 类型 | 工具示例 | 说明 |
|------|----------|------|
| ReadOnly | Read, Glob, Grep | 不修改系统状态 |
| Write | Edit, Write | 修改文件内容 |
| Execute | Bash | 执行命令 |

### 6.2.2 ToolResult 接口

```typescript
export interface ToolResult {
  success: boolean;
  llmContent: string;      // 给 LLM 看的完整内容
  displayContent: string;  // 给用户看的简洁摘要
  error?: ToolError;
  metadata?: Record<string, unknown>;
}
```

**为什么分离 llmContent 和 displayContent？**

- `llmContent`：完整的 1000 行文件内容
- `displayContent`：`✅ 成功读取文件: app.ts (1000 行)`

### 6.2.3 Tool 接口

```typescript
export interface Tool<TParams = unknown> {
  // 基本信息
  readonly name: string;
  readonly displayName: string;
  readonly kind: ToolKind;
  readonly isReadOnly: boolean;
  readonly isConcurrencySafe: boolean;  // 是否并发安全
  readonly strict: boolean;              // 是否启用结构化输出
  readonly description: ToolDescription;
  readonly version: string;
  readonly category?: string;
  readonly tags: string[];
  
  // 核心方法
  getFunctionDeclaration(): FunctionDeclaration;
  build(params: TParams): ToolInvocation<TParams>;  // 构建执行实例
  execute(params: TParams, context?: ExecutionContext): Promise<ToolResult>;
  
  // 权限相关（可选）
  extractSignatureContent?: (params: TParams) => string;
  abstractPermissionRule?: (params: TParams) => string;
}
```

## 6.3 工具工厂函数

### 6.3.1 createTool 函数

使用 Zod Schema 定义参数，自动生成 JSON Schema：

```typescript
export function createTool<TSchema extends z.ZodType>(
  config: ToolConfig<TSchema>
): Tool<z.infer<TSchema>> {
  const jsonSchema = zodToJsonSchema(config.schema);
  
  return {
    name: config.name,
    kind: config.kind,
    isReadOnly: config.kind === ToolKind.ReadOnly,
    description: config.description,
    
    getFunctionDeclaration() {
      return {
        name: config.name,
        description: config.description.short,
        parameters: jsonSchema,
      };
    },
    
    async execute(params, context) {
      const validated = config.schema.parse(params);
      return config.execute(validated, context);
    },
  };
}
```

### 6.3.2 使用 Zod Schema

```typescript
const ReadSchema = z.object({
  file_path: z.string().min(1),
  offset: z.number().optional(),
  limit: z.number().optional(),
});

// 类型自动推断
type ReadParams = z.infer<typeof ReadSchema>;
```

## 6.4 内置工具

### 6.4.1 Read 工具

```typescript
export const readTool = createTool({
  name: 'Read',
  kind: ToolKind.ReadOnly,
  
  schema: z.object({
    file_path: z.string().min(1),
    offset: z.number().int().min(0).optional(),
    limit: z.number().int().min(1).max(10000).optional(),
  }),
  
  description: {
    short: 'Read files from the local filesystem',
    usageNotes: [
      'file_path must be an absolute path',
      'By default, reads up to 2000 lines',
    ],
  },
  
  async execute(params) {
    const content = await fs.readFile(params.file_path, 'utf-8');
    // 处理 offset/limit...
    return {
      success: true,
      llmContent: content,
      displayContent: `✅ 读取文件: ${params.file_path}`,
    };
  },
});
```

### 6.4.2 Glob 工具

```typescript
export const globTool = createTool({
  name: 'Glob',
  kind: ToolKind.ReadOnly,
  
  schema: z.object({
    pattern: z.string().min(1),
    path: z.string().optional(),
  }),
  
  description: {
    short: 'Find files matching a glob pattern',
  },
  
  async execute(params) {
    const files = await glob(params.pattern, { cwd: params.path });
    return {
      success: true,
      llmContent: files.join('\n'),
      displayContent: `✅ 找到 ${files.length} 个文件`,
    };
  },
});
```

### 6.4.3 Grep 工具

```typescript
export const grepTool = createTool({
  name: 'Grep',
  kind: ToolKind.ReadOnly,
  
  schema: z.object({
    pattern: z.string().min(1),
    path: z.string().optional(),
    include: z.string().optional(),
  }),
  
  description: {
    short: 'Search file contents using regex',
  },
  
  async execute(params) {
    // 使用 ripgrep 或降级到 JS 实现
    const results = await searchContent(params);
    return {
      success: true,
      llmContent: results,
      displayContent: `✅ 搜索完成`,
    };
  },
});
```

### 6.4.4 Edit 工具

字符串替换编辑工具：

```typescript
export const editTool = createTool({
  name: 'Edit',
  kind: ToolKind.Write,
  
  schema: z.object({
    file_path: z.string().min(1),
    old_string: z.string(),
    new_string: z.string(),
    replace_all: z.boolean().default(false),
  }),
  
  description: {
    short: 'Performs exact string replacements in files',
    important: ['You must Read the file first before editing'],
  },
  
  async execute(params) {
    const content = await fs.readFile(params.file_path, 'utf8');
    
    // 多重匹配检查
    const matchCount = content.split(params.old_string).length - 1;
    if (matchCount > 1 && !params.replace_all) {
      return { success: false, ... }; // 强制唯一性
    }
    
    const newContent = params.replace_all
      ? content.replaceAll(params.old_string, params.new_string)
      : content.replace(params.old_string, params.new_string);
    
    await fs.writeFile(params.file_path, newContent, 'utf8');
    return { success: true, ... };
  },
});
```

### 6.4.5 Write 工具

文件写入工具：

```typescript
export const writeTool = createTool({
  name: 'Write',
  kind: ToolKind.Write,
  
  schema: z.object({
    file_path: z.string().min(1),
    contents: z.string(),
  }),
  
  description: {
    short: 'Writes a file to the local filesystem',
    usageNotes: ['Will overwrite existing file', 'Prefer Edit for modifications'],
  },
  
  async execute(params) {
    await fs.mkdir(path.dirname(params.file_path), { recursive: true });
    await fs.writeFile(params.file_path, params.contents, 'utf8');
    return { success: true, ... };
  },
});
```

### 6.4.6 Bash 工具

Shell 命令执行工具：

```typescript
export const bashTool = createTool({
  name: 'Bash',
  kind: ToolKind.Execute,
  isConcurrencySafe: false,  // 可能修改共享状态
  
  schema: z.object({
    command: z.string().min(1),
    description: z.string().optional(),
    timeout: z.number().max(600000).default(120000),
    working_directory: z.string().optional(),
  }),
  
  description: {
    short: 'Executes bash commands in a shell session',
    important: ['Avoid file operations - use dedicated tools instead'],
  },
  
  async execute(params) {
    const { stdout, stderr } = await exec(params.command, {
      timeout: params.timeout,
      cwd: params.working_directory,
    });
    return { success: true, llmContent: stdout, ... };
  },
});
```

### 6.4.7 内置工具清单

| 工具 | 类型 | 用途 |
|------|------|------|
| **文件工具** | | |
| Read | ReadOnly | 读取文件内容 |
| Edit | Write | 字符串替换编辑 |
| Write | Write | 写入/覆盖文件 |
| **搜索工具** | | |
| Glob | ReadOnly | 文件模式匹配 |
| Grep | ReadOnly | 文本内容搜索 |
| **Shell 工具** | | |
| Bash | Execute | 执行 Shell 命令 |

## 6.5 工具注册表

### 6.5.1 ToolRegistry 类

```typescript
export class ToolRegistry extends EventEmitter {
  private tools = new Map<string, Tool>();      // 内置工具
  private mcpTools = new Map<string, Tool>();   // MCP 工具
  
  // 注册内置工具
  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
    this.emit('toolRegistered', { type: 'builtin', tool });
  }
  
  // 注册 MCP 工具
  registerMcpTool(tool: Tool): void {
    this.mcpTools.set(tool.name, tool);
    this.emit('toolRegistered', { type: 'mcp', tool });
  }
  
  // 注销 MCP 工具
  unregisterMcpTool(name: string): boolean {
    return this.mcpTools.delete(name);
  }
  
  // 获取工具（内置或 MCP）
  get(name: string): Tool | undefined {
    return this.tools.get(name) || this.mcpTools.get(name);
  }
  
  // 获取所有工具
  getAll(): Tool[] {
    return [...this.tools.values(), ...this.mcpTools.values()];
  }
  
  // Plan 模式：只返回只读工具
  getFunctionDeclarationsByMode(mode?: string): FunctionDeclaration[] {
    if (mode === 'plan') {
      return this.getReadOnlyTools().map(t => t.getFunctionDeclaration());
    }
    return this.getAll().map(t => t.getFunctionDeclaration());
  }
}
```

### 6.5.2 工具分类索引

```typescript
// 按分类获取工具
registry.getByCategory('文件操作');  // [Read, Edit, Write]

// 按标签获取工具
registry.getByTag('file');           // [Read, Edit, Write, Glob]

// 模糊搜索
registry.search('file');             // 搜索名称/描述
```

## 6.6 测试方法

### 运行工具系统测试

```bash
bun run test:tools
```

### 预期输出

```
=== 工具系统测试 ===

1. 创建工具注册表并注册内置工具
   已注册 6 个工具: Read, Edit, Write, Glob, Grep, Bash
   - 内置工具: 6
   - MCP 工具: 0

3. 测试只读/写入工具过滤
   只读工具: Read, Glob, Grep
   写入工具: Edit, Write, Bash

7. 测试 Edit 工具
   结果: ✅ 成功
   多重匹配: ✅ 正确拒绝

9. 测试 Bash 工具
   结果: ✅ 成功
   输出: Hello from Bash

12. 测试 MCP 工具注册
    MCP 工具注册: ✅
    注销后: ✅ 已移除

=== 测试完成 ===
```

### 测试项说明

| 测试项 | 验证内容 |
|--------|----------|
| 工具注册 | 注册表正确存储内置和 MCP 工具 |
| 工具获取 | 按名称获取工具 |
| 只读/写入过滤 | 正确过滤不同类型工具 |
| Plan 模式 | 只返回只读工具的函数声明 |
| Read 执行 | 文件读取功能 |
| Edit 执行 | 字符串替换、多重匹配检查 |
| Write 执行 | 文件写入、目录创建 |
| Bash 执行 | 命令执行、失败处理 |
| Glob 执行 | 文件搜索功能 |
| Grep 执行 | 内容搜索功能 |
| MCP 注册 | MCP 工具动态注册/注销 |
| build 方法 | 构建执行实例 |
| 参数验证 | Zod Schema 验证 |

---

## 技术亮点

### 1. Zod Schema 一石三鸟

```typescript
const schema = z.object({ file_path: z.string() });
// 1. TypeScript 类型推断
// 2. 运行时参数验证
// 3. 自动生成 JSON Schema
```

### 2. llmContent vs displayContent 分离

```typescript
llmContent: '1000 行文件内容...'
displayContent: '✅ 读取成功 (1000 行)'
```

**为什么**：LLM 需要完整信息，用户只需要摘要。

### 3. ToolKind 权限分类

```typescript
enum ToolKind {
  ReadOnly,  // Plan 模式可用
  Write,     // 需要确认
  Execute,   // 需要确认
}
```

**为什么**：权限控制的基础，Plan 模式只暴露 ReadOnly 工具。

### 4. 工厂函数强制规范

```typescript
createTool({
  name: 'Read',        // 必须
  schema: z.object(), // 必须
  description: {},    // 必须
  execute: async () => {} // 必须
});
```

**为什么**：确保所有工具都有完整的元数据和验证。

---

## 6.7 常见问题

### Q1: LLM 是怎么决定用什么工具的？

LLM 不是"真正理解"工具，而是通过以下机制做出选择：

**A. 函数声明（Function Declaration）**

`getFunctionDeclaration()` 方法为 LLM 提供"菜单"：

```typescript
{
  name: "Read",
  description: "读取文件内容。当需要查看代码、配置或文档时使用此工具。",
  parameters: {
    type: "object",
    properties: {
      file_path: { type: "string", description: "文件的绝对路径" }
    },
    required: ["file_path"]
  }
}
```

**B. 匹配过程**

1. **描述匹配**：用户说"帮我看看 main.ts" → LLM 匹配到 Read 工具的描述
2. **参数推断**：从上下文提取 `file_path = "src/main.ts"`
3. **训练强化**：RLHF 训练让 LLM 学会何时调用、如何调用

**C. System Prompt 引导**

```
当用户提到文件时，优先使用 Read 查看内容，而不是猜测。
修改文件前必须先 Read。
```

### Q2: Tools / Skills / MCP / Function Call 有什么区别？

| 概念 | 层级 | 定义 | 类比 |
|------|------|------|------|
| **Function Call** | 协议层 | OpenAI/Anthropic 定义的 API 机制，让 LLM 输出结构化调用 | HTTP 协议 |
| **Tool** | 抽象层 | 对 Function Call 的封装：定义 + 验证 + 执行 + 结果格式化 | REST API 端点 |
| **MCP** | 标准化层 | Anthropic 提出的工具互操作协议，让外部服务暴露工具 | USB 标准 |
| **Skill** | 组合层 | 更高级的概念，可能包含多个 Tool 的组合逻辑 | SDK/Library |

**层级关系**：

```
Function Calling (LLM API 原生能力)
    └── Tool (单一能力封装)
            ├── Built-in Tools (Read, Write, Bash...)
            └── MCP Tools (外部服务提供，遵循 MCP 协议)
                    └── Skill (多工具组合，如 "代码重构")
```

**实际例子**：

- **Function Call**：Claude API 返回 `{"type": "tool_use", "name": "Read", "input": {...}}`
- **Tool**：我们的 `readTool` 对象，包含 schema、execute 函数
- **MCP Tool**：通过 MCP 协议连接的 GitHub、Jira 等外部工具
- **Skill**：假设的 "RefactorCode" skill = Read → Analyze → Edit → Test

在我们的实现中，`ToolRegistry` 分别管理 built-in 和 MCP 工具，体现了这种分层设计。
