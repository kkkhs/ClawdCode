# 第 02 章：项目初始化与技术栈选型

> **实现状态**: ✅ 已完成
> **完成内容**: Hello World Agent - 基础项目结构、SimpleAgent、Ink UI

## 2.1 技术栈选择

### 2.1.1 核心技术栈

| 组件 | 选择 | 说明 |
|------|------|------|
| 语言 | TypeScript | 模型训练数据中大量存在，类型安全 |
| UI 框架 | Ink | React for CLI，组件化、可复用 |
| CLI 框架 | yargs | 命令解析、中间件支持 |
| 状态管理 | Zustand | 与 React 解耦，Agent 可直接访问 |
| LLM 接口 | OpenAI SDK | 支持 OpenAI 兼容的所有服务 |
| 验证 | Zod | 运行时参数验证 |
| 运行时/构建 | Bun | 超快的 JavaScript 运行时和构建工具 |

> **Bun 注意事项**: 导出 TypeScript 类型时需要使用 `export type { ... }` 语法，而不是 `export { ... }`。

### 2.1.2 为什么选择 Ink

**Ink** 是一个使用 React 组件构建 CLI 界面的框架：

```typescript
// 传统 CLI 输出
console.log('Processing...');
console.log(`Done: ${count} files`);

// Ink 方式 - 组件化、可复用
const StatusBar: FC<{ count: number }> = ({ count }) => (
  <Box>
    <Spinner type="dots" />
    <Text color="green"> Processing: {count} files</Text>
  </Box>
);
```

**优势对比**：

| 特性 | 传统 CLI | Ink |
|------|----------|-----|
| 界面更新 | 全屏重绘 | 智能 diff |
| 代码组织 | 面条式 | 组件化 |
| 状态管理 | 手动 | React Hooks |
| 复用性 | 低 | 高 |

### 2.1.3 为什么选择 Zustand

React Context 遇到的问题：

```
❌ 问题 1：双轨数据源不一致
   UI 写 ConfigManager → 写盘成功 → 需要手动同步到 Context
   结果：写盘成功但 Context 未更新 → Agent 读到旧数据

❌ 问题 2：Agent（非 React 环境）无法访问 Context
   Agent.ts 运行在 React 组件树外部，无法使用 useContext()

❌ 问题 3：Store 未初始化导致崩溃
   CLI --print 模式下，UI 未渲染 → Context 未初始化 → 崩溃
```

**Zustand 解决方案**：

- 状态管理与 React 解耦
- UI 只是状态的消费者
- Agent 可通过 `vanillaStore.getState()` 直接、同步地获取最新状态

---

## 2.2 项目结构设计

### 2.2.1 目录结构

```
clawdcode/
├── src/                          # 源代码
│   ├── agent/                    # Agent 核心
│   │   ├── Agent.ts              # 主 Agent 类
│   │   ├── types.ts              # 类型定义
│   │   └── subagents/            # 子 Agent 系统
│   │
│   ├── tools/                    # 工具系统
│   │   ├── builtin/              # 内置工具
│   │   │   ├── file/             # 文件工具 (Read, Write, Edit)
│   │   │   ├── search/           # 搜索工具 (Glob, Grep)
│   │   │   ├── shell/            # Shell 工具 (Bash)
│   │   │   └── web/              # 网络工具 (WebFetch)
│   │   ├── registry/             # 工具注册表
│   │   ├── execution/            # 执行管道
│   │   └── types/                # 工具类型
│   │
│   ├── ui/                       # UI 系统
│   │   ├── components/           # React 组件
│   │   ├── hooks/                # 自定义 Hooks
│   │   └── App.tsx               # UI 入口
│   │
│   ├── config/                   # 配置管理
│   │   ├── ConfigManager.ts      # 配置管理器
│   │   ├── types.ts              # 配置类型
│   │   └── defaults.ts           # 默认配置
│   │
│   ├── context/                  # 上下文管理
│   │   ├── ContextManager.ts     # 上下文管理器
│   │   ├── CompactionService.ts  # 压缩服务
│   │   └── storage/              # 存储实现
│   │
│   ├── services/                 # 服务层
│   │   ├── ChatServiceInterface.ts
│   │   └── OpenAIChatService.ts
│   │
│   ├── mcp/                      # MCP 协议
│   ├── prompts/                  # 提示词管理
│   ├── store/                    # Zustand Store
│   │
│   ├── cli/                      # CLI 相关
│   │   ├── config.ts             # CLI 配置
│   │   └── middleware.ts         # 中间件
│   │
│   └── main.tsx                  # 主入口
│
├── docs/                         # 文档
├── tests/                        # 测试文件
├── package.json
├── tsconfig.json
└── biome.json                    # 代码风格配置
```

### 2.2.2 模块职责划分

| 层级 | 职责 | 示例 |
|------|------|------|
| 入口层 | 命令解析、启动 | `main.tsx` |
| UI 层 | 界面渲染、交互 | `App.tsx`, `components/` |
| 业务层 | 核心逻辑 | `Agent.ts`, `ExecutionPipeline.ts` |
| 服务层 | 通用服务 | `ChatService`, `ConfigManager` |
| 基础层 | 工具函数 | `Logger`, `Utils` |

**关键设计**：`agent/` 目录下的代码是完全无状态的，它不关心 UI 如何渲染，也不关心配置如何读取，只负责接收上下文、调用 LLM 并决定下一步行动。

---

## 2.3 核心依赖

### 2.3.1 运行时依赖

```json
{
  "dependencies": {
    // UI 框架
    "react": "^19.1.1",
    "ink": "^6.4.0",
    "ink-text-input": "^6.0.0",
    "ink-spinner": "^5.0.0",

    // CLI 框架
    "yargs": "^18.0.0",

    // 状态管理
    "zustand": "^5.0.9",

    // LLM 接口
    "openai": "^6.2.0",

    // 验证
    "zod": "^3.24.2",

    // 工具库
    "chalk": "^5.4.1",
    "glob": "^11.0.3",
    "nanoid": "^5.1.6"
  }
}
```

### 2.3.2 关键依赖介绍

**1. OpenAI SDK**

```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.API_KEY,
  baseURL: 'https://api.example.com/v1', // 可切换后端
});

const response = await client.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello' }],
  tools: [...], // 工具定义
});
```

**2. Zod（运行时参数验证）**

```typescript
import { z } from 'zod';

// 定义 Schema
const EditParamsSchema = z.object({
  file_path: z.string().min(1, '文件路径不能为空'),
  old_string: z.string(),
  new_string: z.string(),
  replace_all: z.boolean().default(false),
});

// 验证参数
const result = EditParamsSchema.safeParse(params);
if (!result.success) {
  throw new Error(`参数验证失败: ${result.error.message}`);
}
```

**3. js-tiktoken（Token 估算）**

```typescript
import { getEncoding } from 'js-tiktoken';

const encoder = getEncoding('cl100k_base');
const tokens = encoder.encode('Hello, world!');
console.log(`Token count: ${tokens.length}`); // Token count: 4
```

---

## 2.4 Hello World Agent

### 2.4.1 最简单的 Agent 实现

**SimpleAgent.ts**

```typescript
import OpenAI from 'openai';

export interface AgentConfig {
  apiKey: string;
  baseURL?: string;
  model?: string;
}

export class SimpleAgent {
  private client: OpenAI;
  private model: string;

  constructor(config: AgentConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
    this.model = config.model || 'gpt-4';
  }

  async chat(message: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: 'You are a helpful coding assistant.' },
        { role: 'user', content: message },
      ],
    });

    return response.choices[0]?.message?.content || '';
  }
}
```

**App.tsx（Ink UI）**

```tsx
import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { SimpleAgent } from '../agent/SimpleAgent.js';

export const App: React.FC<{ apiKey: string }> = ({ apiKey }) => {
  const [input, setInput] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const agent = new SimpleAgent({ apiKey });

  const handleSubmit = async (value: string) => {
    if (!value.trim()) return;

    setIsLoading(true);
    setInput('');

    try {
      const result = await agent.chat(value);
      setResponse(result);
    } catch (error) {
      setResponse(`Error: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">🤖 My Coding Agent</Text>

      <Box marginY={1}>
        {isLoading ? (
          <Box>
            <Spinner type="dots" />
            <Text> Thinking...</Text>
          </Box>
        ) : (
          response && <Text>{response}</Text>
        )}
      </Box>

      <Box>
        <Text color="green">{'> '}</Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          placeholder="Ask me anything..."
        />
      </Box>
    </Box>
  );
};
```

**main.tsx（入口）**

```tsx
#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { App } from './ui/App.js';

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('api-key', {
      type: 'string',
      description: 'API Key',
      default: process.env.OPENAI_API_KEY,
    })
    .help()
    .parse();

  if (!argv.apiKey) {
    console.error('Error: API key is required');
    process.exit(1);
  }

  render(<App apiKey={argv.apiKey} />);
}

main().catch(console.error);
```

### 2.4.2 运行测试

```bash
# 安装依赖
bun install

# 开发模式运行
bun run dev

# 构建
bun run build

# 运行构建产物
bun run start

# 类型检查
bun run typecheck
```

---

---

## 2.5 配置文件系统（补充实现）

### 2.5.1 配置加载优先级

```
1. 默认配置 (DEFAULT_CONFIG)
2. 用户配置 (~/.clawdcode/config.json)
3. 项目配置 (./.clawdcode/config.json)
4. 环境变量 (OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL)
5. CLI 参数 (--api-key, --base-url, --model)
```

### 2.5.2 配置文件格式

**用户级配置**: `~/.clawdcode/config.json`

**项目级配置**: `.clawdcode/config.json`

```json
{
  "default": {
    "apiKey": "your-api-key",
    "baseURL": "https://api.openai.com/v1",
    "model": "gpt-4"
  },
  "ui": {
    "theme": "dark"
  }
}
```

**配置字段说明**:

| 字段 | 说明 |
|------|------|
| `apiKey` | API 密钥 |
| `baseURL` | API 地址（支持 OpenAI、Azure、Ark 等兼容服务） |
| `model` | 模型名称 |

> **注意**: `.clawdcode/config.json` 包含敏感信息（API Key），已添加到 `.gitignore`。
> 使用 `.clawdcode/config.example.json` 作为模板提交到仓库。

### 2.5.3 使用方式

```bash
# 创建默认配置文件
bun run dev -- --init

# 使用配置文件（自动加载）
bun run dev

# CLI 参数覆盖配置文件
bun run dev -- --model gpt-3.5-turbo
```

### 2.5.4 ConfigManager 实现要点

```typescript
// src/config/ConfigManager.ts

export class ConfigManager {
  // 单例模式
  private static instance: ConfigManager;
  
  // 初始化：加载所有配置源
  async initialize(projectPath?: string): Promise<void>;
  
  // 应用 CLI 参数（最高优先级）
  applyCliArgs(args: Partial<ModelConfig>): void;
  
  // 获取最终配置
  getDefaultModel(): ModelConfig;
}
```

---

## 本章小结

- 技术栈：TypeScript + Ink + yargs + Zustand + OpenAI SDK + Zod
- 项目按职责分层：入口层 → UI 层 → 业务层 → 服务层 → 基础层
- Agent 核心代码完全无状态，与 UI 解耦
- Hello World Agent 验证环境配置
- **配置文件系统**：支持用户级/项目级配置，多优先级合并
