# 第十章：MCP 协议集成

MCP（Model Context Protocol）是 Anthropic 推出的开放协议，允许 AI 应用与外部工具和数据源交互。通过 MCP，你的 Coding Agent 可以连接到数据库、调用 API、操作第三方服务——而这些能力可以通过简单的配置动态添加，无需修改 Agent 代码。

本章将详细讲解 MCP 协议的原理和 ClawdCode 中的完整实现。

## 10.1 MCP 协议概述

### 什么是 MCP？

MCP（Model Context Protocol）定义了一种标准方式，让 AI 模型与外部系统进行交互：

```
┌─────────────┐     MCP 协议      ┌─────────────────┐
│   AI Agent  │ ◄──────────────► │   MCP Server    │
│  (Client)   │                   │ (工具提供者)    │
└─────────────┘                   └─────────────────┘
```

### MCP 的核心概念

| 概念 | 说明 | 示例 |
|------|------|------|
| **Server** | 提供工具和资源的服务端 | GitHub MCP Server |
| **Client** | 调用工具的客户端 | ClawdCode Agent |
| **Tool** | 服务器提供的可调用函数 | `create_issue`, `search_code` |
| **Resource** | 服务器提供的只读数据 | 文件内容、数据库记录 |
| **Transport** | 通信层（stdio/SSE/HTTP） | 进程间通信、HTTP 长连接 |

### 传输协议

MCP 支持多种传输方式：

```
┌───────────────────────────────────────────────────────────┐
│                     传输类型                               │
├─────────────────┬─────────────────┬───────────────────────┤
│     Stdio       │      SSE        │       HTTP            │
│  (进程间通信)    │ (Server-Sent    │  (Streamable HTTP)    │
│                 │   Events)       │                       │
├─────────────────┼─────────────────┼───────────────────────┤
│   本地 CLI 工具  │    Web 服务     │     云端服务          │
└─────────────────┴─────────────────┴───────────────────────┘
```

| 传输类型 | 优点 | 缺点 | 适用场景 |
|----------|------|------|----------|
| stdio | 简单、低延迟 | 仅限本地 | 本地 CLI 工具 |
| SSE | 实时推送 | 单向通信 | Web 服务 |
| HTTP | 通用性强 | 相对复杂 | 云端 API |

## 10.2 ClawdCode MCP 架构

### 组件关系图

```
┌─────────────────────── 配置层 ───────────────────────┐
│                                                      │
│  ~/.clawdcode/config.json    .clawdcode/config.json │
│         ↓                           ↓               │
│      ConfigManager ─────────────────────────────────│
│                           ↓                         │
│                    Global Store                     │
└──────────────────────────┬───────────────────────────┘
                           ↓
┌─────────────────────── 管理层 ───────────────────────┐
│                                                      │
│     Agent ──────────→ McpRegistry                   │
│      初始化           服务器注册表                    │
└──────────────────────────┬───────────────────────────┘
                           ↓
┌─────────────────────── 客户端层 ─────────────────────┐
│                                                      │
│  McpClient ──→ HealthMonitor                        │
│  连接与重试      健康检查                             │
│      │                                              │
│      └──────→ OAuthProvider                         │
│                认证                                  │
└──────────────────────────┬───────────────────────────┘
                           ↓
┌─────────────────────── 工具层 ───────────────────────┐
│                                                      │
│  createMcpTool ──────→ ToolRegistry                 │
│  Schema 转换           Blade 工具                    │
└──────────────────────────┬───────────────────────────┘
                           ↓
┌─────────────────────── 外部 ─────────────────────────┐
│                                                      │
│        MCP Servers (Stdio / SSE / HTTP)             │
└──────────────────────────────────────────────────────┘
```

### 核心文件

MCP 实现位于 `src/mcp/` 目录下，包含几个关键类：

| 文件 | 职责 |
|------|------|
| `src/mcp/types.ts` | MCP 相关类型定义 |
| `src/mcp/McpClient.ts` | 处理连接生命周期、重试逻辑、OAuth 和健康监控。封装了官方 SDK 客户端 |
| `src/mcp/McpRegistry.ts` | 管理多个 MCP 服务器的单例注册表。处理冲突解决和服务器发现 |
| `src/mcp/createMcpTool.ts` | 适配器，将 MCP 工具 (JSON Schema) 转换为 ClawdCode 工具 (Zod Schema) |
| `src/mcp/HealthMonitor.ts` | 监控服务器健康状况并触发自动重连 |
| `src/mcp/index.ts` | 模块导出 |

## 10.3 类型定义

### 连接状态

```typescript
// src/mcp/types.ts
export enum McpConnectionStatus {
  DISCONNECTED = 'disconnected',  // 未连接
  CONNECTING = 'connecting',      // 连接中
  CONNECTED = 'connected',        // 已连接
  ERROR = 'error',                // 错误
}
```

### 工具定义

```typescript
export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;  // JSON Schema
    required?: string[];
  };
}
```

### 工具调用响应

```typescript
export interface McpToolCallResponse {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;       // base64 编码的图片数据
    mimeType?: string;
  }>;
  isError?: boolean;
}
```

### 服务器配置

```typescript
// src/config/types.ts
export interface McpServerConfig {
  type: 'stdio' | 'sse' | 'http';

  // stdio 配置
  command?: string;        // 可执行命令
  args?: string[];         // 命令参数
  env?: Record<string, string>;  // 环境变量

  // sse/http 配置
  url?: string;            // 服务器 URL
  headers?: Record<string, string>;  // HTTP 头

  // OAuth 配置
  oauth?: {
    enabled: boolean;
    authorizationUrl: string;
    tokenUrl: string;
    clientId: string;
    clientSecret?: string;
    scopes?: string[];
  };

  // 健康检查配置
  healthCheck?: {
    enabled: boolean;
    intervalMs: number;
    timeoutMs: number;
    maxFailures: number;
  };
}
```

## 10.4 McpClient - MCP 客户端

`McpClient` 是对官方 `@modelcontextprotocol/sdk` 的健壮封装。

### 主要特性

- **弹性连接：** 在 `connectWithRetry` 中实现了指数退避重试逻辑
- **错误分类：** 将错误分类为 `NETWORK_TEMPORARY`（可重试）、`CONFIG_ERROR`（致命）、`AUTH_ERROR`（需用户干预）等
- **自动重连：** 在意外断开连接时自动尝试重连
- **传输支持：** 支持 `stdio`（本地进程）、`sse`（服务器发送事件）和 `http`

### 客户端实现

```typescript
// src/mcp/McpClient.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

export class McpClient extends EventEmitter {
  private status: McpConnectionStatus = McpConnectionStatus.DISCONNECTED;
  private sdkClient: Client | null = null;
  private tools = new Map<string, McpToolDefinition>();
  private serverInfo: { name: string; version: string } | null = null;

  // 重连配置
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private reconnectTimer: NodeJS.Timeout | null = null;

  // 健康监控
  private healthMonitor: HealthMonitor | null = null;
}
```

### 连接流程

```typescript
/**
 * 连接到 MCP 服务器（带重试）
 */
async connectWithRetry(maxRetries = 3, initialDelay = 1000): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await this.doConnect();
      this.reconnectAttempts = 0;
      return;
    } catch (error) {
      lastError = error as Error;
      const classified = classifyError(error);

      // 永久性错误不重试
      if (!classified.isRetryable) {
        throw error;
      }

      // 指数退避重试
      if (attempt < maxRetries) {
        const delay = initialDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('连接失败');
}
```

### 错误分类

```typescript
export enum ErrorType {
  NETWORK_TEMPORARY = 'network_temporary',  // 临时网络错误（可重试）
  NETWORK_PERMANENT = 'network_permanent',  // 永久网络错误
  CONFIG_ERROR = 'config_error',            // 配置错误
  AUTH_ERROR = 'auth_error',                // 认证错误
  PROTOCOL_ERROR = 'protocol_error',        // 协议错误
  UNKNOWN = 'unknown',                      // 未知错误
}

function classifyError(error: unknown): ClassifiedError {
  if (!(error instanceof Error)) {
    return { type: ErrorType.UNKNOWN, isRetryable: false };
  }

  const msg = error.message.toLowerCase();

  // 永久性配置错误（不重试）
  const permanentErrors = ['command not found', 'no such file', 'permission denied'];
  if (permanentErrors.some(p => msg.includes(p))) {
    return { type: ErrorType.CONFIG_ERROR, isRetryable: false };
  }

  // 临时网络错误（可重试）
  const temporaryErrors = ['timeout', 'connection refused', 'network error'];
  if (temporaryErrors.some(t => msg.includes(t))) {
    return { type: ErrorType.NETWORK_TEMPORARY, isRetryable: true };
  }

  return { type: ErrorType.UNKNOWN, isRetryable: true };
}
```

### 自动重连

```typescript
/**
 * 调度自动重连
 */
private scheduleReconnect(): void {
  if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
    console.error('[McpClient] 达到最大重连次数，放弃重连');
    this.emit('reconnectFailed');
    return;
  }

  // 指数退避：1s, 2s, 4s, 8s, 16s（最大30s）
  const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
  this.reconnectAttempts++;

  this.reconnectTimer = setTimeout(async () => {
    try {
      await this.doConnect();
      this.reconnectAttempts = 0;
      this.emit('reconnected');
    } catch (error) {
      const classified = classifyError(error);
      if (classified.isRetryable) {
        this.scheduleReconnect();
      } else {
        this.emit('reconnectFailed');
      }
    }
  }, delay);
}
```

## 10.5 McpRegistry - 服务器注册中心

`McpRegistry` 充当所有 MCP 服务器的中心枢纽。

### 主要特性

- **单例模式：** 确保服务器状态的单一事实来源
- **工具冲突解决：**
  - 如果工具名称唯一：使用 `toolName`
  - 如果存在冲突：添加服务器名称前缀（例如 `github__create_issue`）
- **生命周期管理：** 处理 `registerServer`、`connectServer`、`disconnectServer`

### 注册中心实现

```typescript
// src/mcp/McpRegistry.ts
export class McpRegistry extends EventEmitter {
  private static instance: McpRegistry | null = null;
  private servers: Map<string, McpServerInfo> = new Map();

  private constructor() {
    super();
  }

  /**
   * 单例模式
   */
  static getInstance(): McpRegistry {
    if (!McpRegistry.instance) {
      McpRegistry.instance = new McpRegistry();
    }
    return McpRegistry.instance;
  }

  /**
   * 注册 MCP 服务器
   */
  async registerServer(name: string, config: McpServerConfig): Promise<void> {
    if (this.servers.has(name)) {
      throw new Error(`MCP服务器 "${name}" 已经注册`);
    }

    const client = new McpClient(config, name, config.healthCheck);
    const serverInfo: McpServerInfo = {
      config,
      client,
      status: McpConnectionStatus.DISCONNECTED,
      tools: [],
    };

    this.servers.set(name, serverInfo);
    this.emit('serverRegistered', name, serverInfo);

    // 尝试连接
    try {
      await this.connectServer(name);
    } catch (error) {
      console.warn(`MCP服务器 "${name}" 连接失败:`, error);
    }
  }
}
```

### 工具获取与冲突处理

```typescript
/**
 * 获取所有可用工具（包含冲突处理）
 *
 * 工具命名策略：
 * - 无冲突: toolName
 * - 有冲突: serverName__toolName
 */
async getAvailableTools(): Promise<Tool[]> {
  const tools: Tool[] = [];
  const nameConflicts = new Map<string, number>();

  // 第一遍：检测冲突
  for (const [serverName, serverInfo] of this.servers) {
    if (serverInfo.status === McpConnectionStatus.CONNECTED) {
      for (const mcpTool of serverInfo.tools) {
        const count = nameConflicts.get(mcpTool.name) || 0;
        nameConflicts.set(mcpTool.name, count + 1);
      }
    }
  }

  // 第二遍：创建工具（冲突时添加前缀）
  for (const [serverName, serverInfo] of this.servers) {
    if (serverInfo.status === McpConnectionStatus.CONNECTED) {
      for (const mcpTool of serverInfo.tools) {
        const hasConflict = (nameConflicts.get(mcpTool.name) || 0) > 1;
        const toolName = hasConflict
          ? `${serverName}__${mcpTool.name}`  // 冲突时: github__create_issue
          : mcpTool.name;                     // 无冲突: create_issue

        const tool = createMcpTool(serverInfo.client, serverName, mcpTool, toolName);
        tools.push(tool);
      }
    }
  }

  return tools;
}
```

## 10.6 MCP Tool 转换器

### JSON Schema → Zod 转换

MCP 工具使用 JSON Schema 定义参数，但 ClawdCode 使用 Zod。需要转换：

```typescript
// src/mcp/createMcpTool.ts
import { z } from 'zod';

/**
 * 将 MCP 工具定义转换为 ClawdCode Tool
 */
export function createMcpTool(
  mcpClient: McpClient,
  serverName: string,
  toolDef: McpToolDefinition,
  customName?: string
) {
  // 1. JSON Schema → Zod Schema
  const zodSchema = convertJsonSchemaToZod(toolDef.inputSchema);

  // 2. 决定工具名称
  const toolName = customName || toolDef.name;

  // 3. 创建 ClawdCode Tool
  return createTool({
    name: toolName,
    displayName: `${serverName}: ${toolDef.name}`,
    kind: ToolKind.Execute,  // MCP 工具视为 Execute 类型
    schema: zodSchema,
    description: {
      short: toolDef.description || `MCP Tool: ${toolDef.name}`,
      important: [
        `From MCP server: ${serverName}`,
        'Executes external tools; user confirmation required'
      ],
    },
    category: 'mcp',
    tags: ['mcp', 'external', serverName],

    async execute(params, context) {
      const result = await mcpClient.callTool(toolDef.name, params);

      // 处理响应内容
      let llmContent = '';
      let displayContent = '';

      if (result.content) {
        for (const item of result.content) {
          if (item.type === 'text' && item.text) {
            llmContent += item.text;
            displayContent += item.text;
          }
        }
      }

      return {
        success: !result.isError,
        llmContent,
        displayContent: result.isError
          ? `❌ ${displayContent}`
          : `✅ MCP工具 ${toolDef.name} 执行成功\n${displayContent}`,
      };
    },
  });
}
```

### JSON Schema 转换逻辑

```typescript
function convertJsonSchemaToZod(jsonSchema: JSONSchema7): z.ZodSchema {
  // object 类型
  if (jsonSchema.type === 'object' || jsonSchema.properties) {
    const shape: Record<string, z.ZodSchema> = {};
    const required = jsonSchema.required || [];

    if (jsonSchema.properties) {
      for (const [key, value] of Object.entries(jsonSchema.properties)) {
        if (typeof value === 'object' && value !== null) {
          let fieldSchema = convertJsonSchemaToZod(value);
          if (!required.includes(key)) {
            fieldSchema = fieldSchema.optional();
          }
          shape[key] = fieldSchema;
        }
      }
    }
    return z.object(shape);
  }

  // string 类型
  if (jsonSchema.type === 'string') {
    let schema = z.string();
    if (jsonSchema.enum) return z.enum(jsonSchema.enum as [string, ...string[]]);
    return schema;
  }

  // number 类型
  if (jsonSchema.type === 'number' || jsonSchema.type === 'integer') {
    return z.number();
  }

  // boolean 类型
  if (jsonSchema.type === 'boolean') {
    return z.boolean();
  }

  // array 类型
  if (jsonSchema.type === 'array' && jsonSchema.items) {
    return z.array(convertJsonSchemaToZod(jsonSchema.items));
  }

  // 默认 any
  return z.any();
}
```

## 10.7 配置加载

MCP 配置从多个来源聚合：

### 配置来源

1. **全局配置** (`~/.clawdcode/config.json`)
   - 所有项目共享的基础设置
2. **项目配置** (`.clawdcode/config.json`)
   - 项目特定的服务器
   - 合并策略：项目设置与全局设置合并或覆盖全局设置
3. **CLI 参数** (`--mcp-config`)
   - 运行时覆盖或临时服务器

### 配置示例

```json
// ~/.clawdcode/config.json
{
  "mcpServers": {
    "github": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "--root", "./"]
    }
  }
}
```

## 10.8 MCP 与 Agent 集成

### 工具注册流程

```
Agent.initialize()
        ↓
    registerMcpTools()
        ↓
┌───────────────────────────────────────┐
│  Loop: Register Servers               │
│                                       │
│  McpRegistry.registerServer(config)   │
│        ↓                              │
│  new McpClient(config)                │
│        ↓                              │
│  client.connect()                     │
└───────────────────────────────────────┘
        ↓
  McpRegistry.getAvailableTools()
        ↓
  createMcpTool() for each tool
        ↓
  ToolRegistry.registerAll(mcpTools)
```

### Agent 中使用 MCP 工具

```typescript
// src/agent/Agent.ts

private async registerMcpTools(): Promise<void> {
  // 1. 从配置获取 MCP 服务器
  const mcpServers = this.config.mcpServers || {};

  // 2. 注册并连接服务器
  const registry = McpRegistry.getInstance();
  for (const [name, config] of Object.entries(mcpServers)) {
    await registry.registerServer(name, config);
  }

  // 3. 获取工具并注册到执行管道
  const mcpTools = await registry.getAvailableTools();
  this.executionPipeline.getRegistry().registerAll(mcpTools);
}
```

### 工具调用流程

```
用户: 用 GitHub 创建一个 issue

LLM 决定调用工具: github__create_issue

↓ ExecutionPipeline

1. Discovery: 找到工具 (McpTool)
2. Permission: 检查权限 (需要确认)
3. Confirmation: 用户确认
4. Execution:
   ↓
   createMcpTool.execute()
     ↓
     mcpClient.callTool('create_issue', params)
       ↓
       MCP Server 执行
       ↓
       返回结果
5. Formatting: 格式化输出

结果注入 LLM 上下文
```

## 10.9 /mcp 命令

ClawdCode 提供 `/mcp` slash 命令查看 MCP 状态：

- `/mcp`：显示状态概览（已连接/已断开，工具数量）
- `/mcp tools`：列出所有可用的 MCP 工具及其描述
- `/mcp <server>`：显示特定服务器的详细信息

```typescript
// src/slash-commands/mcpCommand.ts
export const mcpCommand: SlashCommand = {
  name: 'mcp',
  description: '显示 MCP 服务器状态和可用工具',

  async handler(args, context) {
    const mcpRegistry = McpRegistry.getInstance();
    const stats = mcpRegistry.getStatistics();
    const servers = mcpRegistry.getAllServers();

    let output = '## MCP 服务器状态\n\n';
    output += `总服务器: ${stats.totalServers}\n`;
    output += `已连接: ${stats.connectedServers}\n`;
    output += `错误: ${stats.errorServers}\n`;
    output += `总工具数: ${stats.totalTools}\n\n`;

    for (const [name, info] of servers) {
      const statusEmoji =
        info.status === McpConnectionStatus.CONNECTED ? '🟢' :
        info.status === McpConnectionStatus.ERROR ? '🔴' :
        info.status === McpConnectionStatus.CONNECTING ? '🟡' : '⚪';

      output += `### ${statusEmoji} ${name}\n`;
      output += `状态: ${info.status}\n`;

      if (info.status === McpConnectionStatus.CONNECTED) {
        output += `工具数: ${info.tools.length}\n`;
        output += `工具: ${info.tools.map(t => t.name).join(', ')}\n`;
      }

      output += '\n';
    }

    return { type: 'success', content: output };
  },
};
```

## 10.10 常见 MCP Server

### 官方 MCP Server

| Server | 用途 | 配置示例 |
|--------|------|----------|
| @modelcontextprotocol/server-github | GitHub 操作 | `npx -y @modelcontextprotocol/server-github` |
| @modelcontextprotocol/server-sqlite | SQLite 数据库 | `npx -y @modelcontextprotocol/server-sqlite` |
| @modelcontextprotocol/server-filesystem | 文件系统 | `npx -y @modelcontextprotocol/server-filesystem` |
| @modelcontextprotocol/server-slack | Slack 消息 | `npx -y @modelcontextprotocol/server-slack` |

### 完整配置示例

```json
{
  "mcpServers": {
    "github": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "sqlite": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sqlite", "--db", "./data.db"]
    },
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "--root", "./"]
    }
  }
}
```

---

## 10.11 测试方法

### 1. 验证依赖安装

```bash
# 确认 MCP SDK 已安装
bun add @modelcontextprotocol/sdk

# 验证构建成功
bun run build
```

构建成功应显示：
```
$ bun build src/main.tsx --outdir dist --target node
Bundled xxxx modules in xxxms
```

### 2. 配置 MCP Server

在 `~/.clawdcode/config.json` 中添加 MCP 配置：

```json
{
  "default": {
    "apiKey": "your-api-key",
    "model": "gpt-4"
  },
  "mcpEnabled": true,
  "mcpServers": {
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "--root", "./"]
    }
  }
}
```

### 3. 启动并验证 MCP 加载

```bash
bun run dev
```

**成功标志** - 启动时应看到类似日志：
```
[Agent] 正在加载 MCP 服务器 (1 个)...
[McpClient:filesystem] 已连接到服务器: @anthropic/mcp-server-filesystem v0.x.x (5 个工具)
[Agent] 已加载 5 个 MCP 工具
```

### 4. 验证 MCP 工具可用

在对话中让 Agent 使用 MCP 工具，例如：
```
> 列出当前目录下的文件
```

如果 MCP 工具正常加载，Agent 应该能调用 filesystem server 提供的工具。

### 当前阶段限制

| 功能 | 状态 | 说明 |
|------|------|------|
| MCP 工具加载 | ✅ 可测试 | 查看启动日志 |
| MCP 工具调用 | ✅ 可测试 | 通过对话使用 |
| `/mcp` 命令 | ❌ 待集成 | 代码已创建，第 12 章集成 |

### 5. 运行 MCP 测试脚本

```bash
bun run test:mcp
```

**成功输出：**

```
============================================================
MCP 模块测试
============================================================

📝 测试 1: 类型定义验证
----------------------------------------
✅ McpConnectionStatus 枚举值正确
✅ ErrorType 枚举值正确
✅ 默认配置值正确

📝 测试 2: McpRegistry 单例模式
----------------------------------------
✅ McpRegistry 单例模式正常
✅ getStatistics() 返回正确结构
✅ getAllServers() 返回 Map

📝 测试 3: JSON Schema → Zod 转换
----------------------------------------
✅ 工具名称正确
✅ 工具分类正确
✅ 工具标签正确
✅ getFunctionDeclaration 名称正确
✅ getFunctionDeclaration 参数结构正确
✅ getFunctionDeclaration 必填字段正确

📝 测试 4: 服务器配置验证
----------------------------------------
✅ stdio 配置结构正确
✅ sse 配置结构正确
✅ http 配置结构正确

📝 测试 5: 工具执行模拟
----------------------------------------
✅ 工具执行成功
✅ 工具返回内容正确
✅ 工具显示内容包含成功标记

============================================================
测试完成: 18 通过, 0 失败
============================================================
```

### 测试内容说明

| 测试项 | 验证内容 |
|--------|----------|
| 类型定义 | 枚举值、默认配置 |
| 单例模式 | McpRegistry 全局唯一 |
| Schema 转换 | JSON Schema → Zod → FunctionDeclaration |
| 配置验证 | stdio/sse/http 三种传输类型 |
| 工具执行 | Mock 工具调用和返回值 |
| **真实连接** | 外部 MCP Server 连接、工具发现、工具调用 |

> 测试连接真实的 `@modelcontextprotocol/server-filesystem`，验证完整连接流程。

### 前置条件

测试需要全局安装 filesystem MCP Server：

```bash
npm install -g @modelcontextprotocol/server-filesystem
```

### 测试成功输出示例

```
📝 测试 6: 真实 MCP Server 连接
----------------------------------------
[McpClient:test-server] 已连接到服务器: secure-filesystem-server v0.2.0 (14 个工具)
✅ 服务器连接成功
✅ 发现 14 个工具
     - read_file
     - list_directory
     - write_file
     - ...
✅ list_directory 工具调用成功
✅ 服务器断开成功

============================================================
测试完成: 22 通过, 0 失败
============================================================
```

### 配置示例

```json
{
  "mcpServers": {
    "filesystem": {
      "type": "stdio",
      "command": "mcp-server-filesystem",
      "args": ["./"]
    }
  }
}
```

---

## 10.12 技术亮点

1. **指数退避重试**：连接失败时使用 `delay = initialDelay * 2^attempt` 策略，避免频繁重试
2. **错误分类机制**：将错误分为可重试和不可重试，智能处理不同类型错误
3. **工具冲突处理**：自动检测并处理同名工具（添加服务器前缀）
4. **Schema 转换**：JSON Schema → Zod Schema 的自动转换
5. **健康监控**：`HealthMonitor` 定期检查服务器状态，触发自动重连
6. **单例注册中心**：`McpRegistry` 确保全局只有一个实例，避免重复连接

---

## 10.13 常见问题

### Q1: MCP 和 Function Call 有什么区别？

| 特性 | Function Call | MCP |
|------|---------------|-----|
| 定义位置 | 代码内嵌 | 外部服务器 |
| 扩展性 | 需修改代码 | 配置即可 |
| 执行环境 | Agent 进程内 | 独立进程 |
| 标准化 | 各厂商不同 | Anthropic 统一标准 |

### Q2: 为什么需要 JSON Schema → Zod 转换？

MCP 使用 JSON Schema 定义工具参数，这是行业标准。但 ClawdCode 内部使用 Zod 进行类型验证，因为：

1. **类型推断**：Zod 可以自动推断 TypeScript 类型
2. **运行时验证**：Zod 提供更好的验证错误信息
3. **一致性**：保持内置工具和 MCP 工具使用相同的验证方式

### Q3: 如何处理 MCP Server 不可用的情况？

1. **连接时**：使用指数退避重试，最多重试 3 次
2. **运行时**：`HealthMonitor` 定期检查，自动重连
3. **调用时**：如果工具不可用，返回友好的错误信息

---

## TODO

以下功能在本章中提到但暂未完整实现：

| 功能 | 说明 | 依赖 | 计划 |
|------|------|------|------|
| `loadMcpConfigFromCli` | 从 CLI 参数 `--mcp-config` 加载临时 MCP 配置 | Zustand Store | 第 11 章 |
| `--mcp-config` CLI 参数 | CLI 传递临时 MCP 配置路径 | loadMcpConfigFromCli | 第 11 章 |
| `OAuthProvider` | OAuth 2.0 认证流程（需要浏览器交互） | - | 可选优化 |
| `src/mcp/auth/` 目录 | OAuth 认证相关文件 | OAuthProvider | 可选优化 |
| Slash 命令集成 | `/mcp` 命令代码已创建，但需集成到 UI | UI 系统 | 第 12 章 |

### 已实现功能

- [x] MCP 类型定义 (`types.ts`)
- [x] McpClient 客户端（连接、重试、错误分类）
- [x] McpRegistry 服务器注册中心（单例、工具冲突处理）
- [x] createMcpTool 转换器（JSON Schema → Zod）
- [x] HealthMonitor 健康监控
- [x] `/mcp` slash 命令代码（概览、tools、server 详情）**← 代码已创建，待集成**
- [x] ConfigManager MCP 配置支持
- [x] Agent 集成 MCP 工具
- [x] SSE/HTTP 传输基础支持（在 McpClient 中）
