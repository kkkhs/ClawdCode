# 第二章：项目搭建与 Hello World Agent

> **学习目标**：完成项目初始化，实现第一个能对话的 Agent
> 
> **预计阅读时间**：30 分钟
> 
> **实践时间**：45 分钟

---

## 2.1 技术栈选择

### 2.1.1 核心技术栈一览

| 组件 | 选择 | 为什么 |
|------|------|--------|
| 语言 | **TypeScript** | LLM 训练数据中大量存在，类型安全 |
| UI 框架 | **Ink** | React for CLI，组件化开发 |
| CLI 框架 | **yargs** | 强大的命令行解析，支持中间件 |
| 状态管理 | **Zustand** | 与 React 解耦，Agent 可直接访问 |
| LLM 接口 | **OpenAI SDK** | 兼容 OpenAI、Azure、Ark 等服务 |
| 验证 | **Zod** | 运行时参数验证，类型推断 |
| 运行时/构建 | **Bun** | 超快的 JavaScript 运行时和构建工具 |

### 2.1.2 为什么选择 Ink

**Ink** 是一个使用 React 组件构建 CLI 界面的框架。

**传统 CLI 方式**：
```typescript
// 面条式代码，难以维护
console.log('Processing...');
console.log(`Done: ${count} files`);
```

**Ink 方式**：
```tsx
// 组件化，可复用，状态管理清晰
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
| 界面更新 | 全屏重绘/手动清除 | 智能 diff |
| 代码组织 | 面条式 | 组件化 |
| 状态管理 | 手动维护 | React Hooks |
| 复用性 | 低 | 高 |

### 2.1.3 为什么选择 Zustand 而非 React Context

使用 React Context 会遇到的问题：

```
❌ 问题 1：Agent 运行在 React 组件树外部，无法使用 useContext()
❌ 问题 2：CLI --print 模式下，UI 未渲染 → Context 未初始化 → 崩溃
❌ 问题 3：双轨数据源不一致（Config 写盘成功但 Context 未更新）
```

**Zustand 解决方案**：

```typescript
// Agent（非 React 环境）可以直接获取状态
const config = vanillaStore.getState().config;

// 不依赖 React 组件树，不会出现 "Context 未初始化" 问题
```

---

## 2.2 项目初始化

### 2.2.1 创建项目目录

```bash
# 创建项目目录
mkdir clawdcode
cd clawdcode

# 初始化 Bun 项目
bun init -y
```

### 2.2.2 配置 package.json

创建 `package.json`：

```json
{
  "name": "clawdcode",
  "version": "0.1.0",
  "description": "A CLI Coding Agent inspired by Claude Code",
  "type": "module",
  "main": "dist/main.js",
  "bin": {
    "clawdcode": "./dist/main.js"
  },
  "scripts": {
    "dev": "bun run src/main.tsx",
    "build": "bun build src/main.tsx --outdir dist --target node && chmod +x dist/main.js",
    "start": "bun dist/main.js",
    "typecheck": "tsc --noEmit"
  },
  "keywords": [
    "cli",
    "ai",
    "coding-agent",
    "llm"
  ],
  "author": "your-name",
  "license": "MIT",
  "engines": {
    "node": ">=18.0.0"
  },
  "dependencies": {
    "chalk": "^5.4.1",
    "glob": "^13.0.0",
    "ink": "^6.0.0",
    "ink-spinner": "^5.0.0",
    "ink-text-input": "^6.0.0",
    "nanoid": "^5.1.6",
    "openai": "^4.77.0",
    "react": "^19.0.0",
    "yargs": "^17.7.2",
    "zod": "^3.24.2",
    "zod-to-json-schema": "^3.25.1"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "@types/react": "^19.0.0",
    "@types/yargs": "^17.0.33",
    "typescript": "^5.7.2"
  }
}
```

**关键配置说明**：

| 字段 | 说明 |
|------|------|
| `"type": "module"` | 使用 ES Modules |
| `"bin"` | 定义全局命令 `clawdcode` |
| `"main"` | 构建输出的入口文件 |

### 2.2.3 配置 TypeScript

创建 `tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "jsx": "react-jsx",
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**关键配置说明**：

| 配置项 | 说明 |
|--------|------|
| `"jsx": "react-jsx"` | 支持 JSX 语法（Ink 使用） |
| `"moduleResolution": "bundler"` | Bun 推荐的模块解析方式 |
| `"allowImportingTsExtensions"` | 允许导入 .ts/.tsx 文件 |

### 2.2.4 安装依赖

```bash
bun install
```

### 2.2.5 创建目录结构

```bash
mkdir -p src/agent src/cli src/config src/ui/components src/services
```

最终目录结构：

```
clawdcode/
├── src/
│   ├── agent/           # Agent 核心
│   ├── cli/             # CLI 模块
│   ├── config/          # 配置管理
│   ├── services/        # 服务层
│   ├── ui/
│   │   └── components/  # UI 组件
│   └── main.tsx         # 入口文件
├── package.json
└── tsconfig.json
```

---

## 2.3 实现 Hello World Agent

### 2.3.1 创建类型定义

**文件位置**：`src/agent/types.ts`

```typescript
/**
 * Agent 类型定义
 * 
 * 定义 Agent 核心模块使用的所有类型
 */

// ========== 消息类型 ==========

/**
 * 消息角色
 * - system: 系统提示词
 * - user: 用户消息
 * - assistant: AI 回复
 * - tool: 工具执行结果
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * 工具调用（OpenAI 格式）
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;  // JSON 字符串
  };
}

/**
 * 消息
 * 遵循 OpenAI Chat 格式标准
 */
export interface Message {
  role: MessageRole;
  content: string;
  
  /** assistant 消息专用：发起的工具调用列表 */
  tool_calls?: ToolCall[];
  
  /** tool 消息专用：关联的调用 ID */
  tool_call_id?: string;
  
  /** tool 消息专用：工具名称 */
  name?: string;
}

// ========== Agent 配置 ==========

/**
 * Agent 配置
 */
export interface AgentConfig {
  /** API Key（必需） */
  apiKey: string;
  
  /** API Base URL（可选，用于兼容其他服务） */
  baseURL?: string;
  
  /** 模型名称 */
  model?: string;
}

/**
 * 聊天上下文
 * 
 * Agent 是无状态的，所有状态通过 context 传入
 */
export interface ChatContext {
  /** 会话 ID */
  sessionId: string;
  
  /** 消息历史 */
  messages: Message[];
}
```

**代码说明**：

1. **MessageRole** - 定义四种消息角色，这是 OpenAI Chat API 的标准格式
2. **ToolCall** - 工具调用的结构，后续章节会用到
3. **ChatContext** - Agent 是无状态的，所有状态通过这个上下文传入

### 2.3.2 实现 SimpleAgent

**文件位置**：`src/agent/SimpleAgent.ts`

```typescript
/**
 * SimpleAgent - 最简单的 LLM 交互实现
 * 
 * 这是 Hello World 级别的 Agent，用于验证环境配置是否正确。
 * 后续章节会逐步演进为完整的 Coding Agent。
 * 
 * 特点：
 * - 无工具调用（纯对话）
 * - 无上下文管理（每次对话独立）
 * - 使用 OpenAI SDK（兼容 OpenAI 格式的所有服务）
 */

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
    // 初始化 OpenAI 客户端
    // 注意：OpenAI SDK 支持所有 OpenAI 格式兼容的服务
    // 通过 baseURL 可以切换到 Azure、Ark、Deepseek 等
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
    this.model = config.model || 'gpt-4';
  }

  /**
   * 发送消息并获取回复
   * 
   * @param message - 用户消息
   * @returns AI 回复的文本内容
   */
  async chat(message: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: 'You are a helpful coding assistant. Be concise and helpful.',
        },
        {
          role: 'user',
          content: message,
        },
      ],
    });

    // 提取回复内容
    // response.choices[0]?.message?.content 可能为 null
    return response.choices[0]?.message?.content || '';
  }
}
```

**代码说明**：

| 部分 | 说明 |
|------|------|
| `OpenAI SDK` | 使用官方 SDK，自动处理 HTTP 请求、重试等 |
| `baseURL` | 可选参数，用于切换到兼容服务 |
| `model` | 默认使用 gpt-4，可通过配置覆盖 |
| `system prompt` | 简单的系统提示词，定义 Agent 角色 |

### 2.3.3 创建 Agent 模块导出

**文件位置**：`src/agent/index.ts`

```typescript
/**
 * Agent 模块导出
 */

export { SimpleAgent } from './SimpleAgent.js';

// 注意：导出纯类型时需要使用 export type
// 这是 Bun 的要求，区分类型和值的导出
export type { AgentConfig } from './SimpleAgent.js';
export type { 
  Message, 
  MessageRole, 
  ToolCall,
  ChatContext,
} from './types.js';
```

> **Bun 注意事项**：导出 TypeScript 类型时需要使用 `export type { ... }` 语法，而不是 `export { ... }`。这是 Bun 对类型和值导出的严格区分。

---

## 2.4 搭建 Ink UI

### 2.4.1 创建错误边界组件

**文件位置**：`src/ui/components/ErrorBoundary.tsx`

```tsx
/**
 * ErrorBoundary - React 错误边界组件
 * 
 * 用于捕获子组件树中的 JavaScript 错误，
 * 记录错误并显示备用 UI，而不是让整个应用崩溃。
 * 
 * 为什么需要这个组件？
 * - React 组件内的错误会导致整个组件树崩溃
 * - CLI 应用崩溃体验很差，用户看不到有用信息
 * - ErrorBoundary 可以优雅地显示错误信息
 */

import React from 'react';
import { Box, Text } from 'ink';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;  // 自定义错误 UI
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  /**
   * 静态方法：从错误中派生状态
   * 当子组件抛出错误时，React 会调用此方法
   */
  static getDerivedStateFromError(error: Error): State {
    // 更新 state 以便下次渲染显示备用 UI
    return { hasError: true, error };
  }

  /**
   * 生命周期方法：捕获错误
   * 可以在这里记录错误到日志服务
   */
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      // 如果提供了自定义 fallback，使用它
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // 默认错误 UI
      return (
        <Box flexDirection="column" padding={1}>
          <Text color="red" bold>
            ❌ Application Error
          </Text>
          <Box marginTop={1}>
            <Text color="yellow">
              An unexpected error occurred. Please restart the application.
            </Text>
          </Box>
          {this.state.error && (
            <Box marginTop={1} flexDirection="column">
              <Text color="gray">Error: {this.state.error.message}</Text>
              {this.state.error.stack && (
                <Box marginTop={1}>
                  <Text color="gray" dimColor>
                    {/* 只显示前 5 行堆栈 */}
                    {this.state.error.stack.split('\n').slice(0, 5).join('\n')}
                  </Text>
                </Box>
              )}
            </Box>
          )}
          <Box marginTop={1}>
            <Text color="cyan">Press Ctrl+C to exit</Text>
          </Box>
        </Box>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
```

**代码说明**：

| 方法 | 说明 |
|------|------|
| `getDerivedStateFromError` | 静态方法，在渲染阶段调用，用于更新状态 |
| `componentDidCatch` | 在 commit 阶段调用，用于记录错误 |
| `fallback` prop | 允许使用者自定义错误 UI |

### 2.4.2 创建组件导出

**文件位置**：`src/ui/components/index.ts`

```typescript
/**
 * UI 组件导出
 */

export { ErrorBoundary } from './ErrorBoundary.js';
```

### 2.4.3 创建主界面

**文件位置**：`src/ui/App.tsx`

```tsx
/**
 * App.tsx - 主 UI 组件
 * 
 * 使用 Ink (React for CLI) 构建终端界面
 * 
 * 组件结构：
 * - App: 带有 ErrorBoundary 的主组件
 * - MainInterface: 主界面（输入框 + 消息展示）
 */

import React, { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { SimpleAgent } from '../agent/SimpleAgent.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';

// ========== 类型定义 ==========

/** UI 展示用的消息类型（简化版） */
interface UIMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** App 组件的属性 */
export interface AppProps {
  apiKey: string;
  baseURL?: string;
  model?: string;
  debug?: boolean;
}

// ========== 主界面组件 ==========

const MainInterface: React.FC<AppProps> = ({ 
  apiKey, 
  baseURL, 
  model,
  debug,
}) => {
  // 输入框状态
  const [input, setInput] = useState('');
  
  // 消息历史（用于 UI 展示）
  const [uiMessages, setUIMessages] = useState<UIMessage[]>([]);
  
  // 加载状态
  const [isLoading, setIsLoading] = useState(false);

  // 创建 Agent 实例
  // 注意：这里每次渲染都会创建新实例，后续会优化
  const agent = new SimpleAgent({ apiKey, baseURL, model });

  /**
   * 处理用户提交
   */
  const handleSubmit = useCallback(async (value: string) => {
    // 忽略空输入
    if (!value.trim()) return;

    // 添加用户消息到 UI
    const userMessage: UIMessage = { role: 'user', content: value };
    setUIMessages(prev => [...prev, userMessage]);
    
    // 清空输入框
    setInput('');
    
    // 开始加载
    setIsLoading(true);

    if (debug) {
      console.log('[DEBUG] Sending message:', value);
    }

    try {
      // 调用 Agent 获取回复
      const result = await agent.chat(value);
      
      // 添加助手消息到 UI
      const assistantMessage: UIMessage = { role: 'assistant', content: result };
      setUIMessages(prev => [...prev, assistantMessage]);
      
    } catch (error) {
      // 错误处理：显示错误消息
      const errorContent = `Error: ${(error as Error).message}`;
      const errorMessage: UIMessage = { role: 'assistant', content: errorContent };
      setUIMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [agent, debug]);

  return (
    <Box flexDirection="column" padding={1}>
      {/* 标题栏 */}
      <Box marginBottom={1}>
        <Text bold color="cyan">🤖 ClawdCode - CLI Coding Agent</Text>
        {debug && <Text color="gray"> [DEBUG]</Text>}
      </Box>

      {/* 消息历史 */}
      <Box flexDirection="column" marginBottom={1}>
        {uiMessages.map((msg, index) => (
          <Box key={index} marginBottom={1}>
            {/* 角色图标 */}
            <Text color={msg.role === 'user' ? 'green' : 'blue'}>
              {msg.role === 'user' ? '> ' : '🤖 '}
            </Text>
            {/* 消息内容 */}
            <Text wrap="wrap">{msg.content}</Text>
          </Box>
        ))}

        {/* 加载指示器 */}
        {isLoading && (
          <Box>
            <Text color="yellow">
              <Spinner type="dots" />
            </Text>
            <Text color="yellow"> Thinking...</Text>
          </Box>
        )}
      </Box>

      {/* 输入框（加载时隐藏） */}
      {!isLoading && (
        <Box>
          <Text color="green">{'> '}</Text>
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            placeholder="Ask me anything... (Ctrl+C to exit)"
          />
        </Box>
      )}
    </Box>
  );
};

// ========== 导出 ==========

/**
 * App - 带有 ErrorBoundary 的主组件
 * 
 * 为什么要包装 ErrorBoundary？
 * - 捕获 MainInterface 及其子组件的所有错误
 * - 显示友好的错误信息而不是崩溃
 */
export const App: React.FC<AppProps> = (props) => {
  return (
    <ErrorBoundary>
      <MainInterface {...props} />
    </ErrorBoundary>
  );
};
```

**代码说明**：

| 部分 | 说明 |
|------|------|
| `UIMessage` | 简化的消息类型，只用于 UI 展示 |
| `useState` | 使用 React Hooks 管理状态 |
| `useCallback` | 缓存回调函数，避免不必要的重渲染 |
| `TextInput` | Ink 提供的文本输入组件 |
| `Spinner` | Ink 提供的加载指示器 |

### 2.4.4 创建入口文件

**文件位置**：`src/main.tsx`

```tsx
#!/usr/bin/env node
/**
 * ClawdCode CLI - 主入口
 * 
 * 启动流程（第 2 章简化版）：
 * 1. 解析命令行参数
 * 2. 检查 API Key
 * 3. 启动 React UI
 */

import React from 'react';
import { render } from 'ink';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { App } from './ui/App.js';

/**
 * 主函数
 */
async function main(): Promise<void> {
  // 1. 解析命令行参数
  const argv = await yargs(hideBin(process.argv))
    .scriptName('clawdcode')
    .usage('$0 [options]')
    .version('0.1.0')
    
    // API 选项
    .option('api-key', {
      type: 'string',
      describe: 'API key for the LLM service',
      // 默认从环境变量读取
      default: process.env.OPENAI_API_KEY,
    })
    .option('base-url', {
      type: 'string',
      describe: 'Base URL for the API',
      default: process.env.OPENAI_BASE_URL,
    })
    .option('model', {
      alias: 'm',
      type: 'string',
      describe: 'Model to use',
      default: process.env.OPENAI_MODEL || 'gpt-4',
    })
    
    // 调试选项
    .option('debug', {
      alias: 'd',
      type: 'boolean',
      describe: 'Enable debug mode',
      default: false,
    })
    
    .help()
    .alias('h', 'help')
    .alias('v', 'version')
    .parse();

  // 2. 检查 API Key
  if (!argv.apiKey) {
    console.error('Error: API key is required');
    console.error('');
    console.error('Please provide an API key using one of these methods:');
    console.error('');
    console.error('  1. Environment variable:');
    console.error('     export OPENAI_API_KEY=sk-...');
    console.error('');
    console.error('  2. CLI argument:');
    console.error('     clawdcode --api-key sk-...');
    process.exit(1);
  }

  // 3. 启动 Ink 应用
  render(
    <App
      apiKey={argv.apiKey}
      baseURL={argv.baseUrl}
      model={argv.model}
      debug={argv.debug}
    />,
    {
      // Ctrl+C 退出
      exitOnCtrlC: true,
    }
  );
}

// 运行主函数
main().catch((error) => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
```

**代码说明**：

| 部分 | 说明 |
|------|------|
| `#!/usr/bin/env node` | Shebang，让文件可以直接作为命令运行 |
| `hideBin(process.argv)` | 移除 `node` 和脚本路径，只保留用户参数 |
| `yargs` | 解析命令行参数 |
| `render()` | Ink 的渲染函数，启动 React 应用 |

---

## 2.5 运行测试

### 2.5.1 开发模式运行

```bash
# 设置 API Key（选择其一）
export OPENAI_API_KEY=sk-your-api-key
# 或者使用兼容服务
export OPENAI_BASE_URL=https://your-api-endpoint.com/v1
export OPENAI_API_KEY=your-key

# 开发模式运行
bun run dev
```

### 2.5.2 预期效果

```
🤖 ClawdCode - CLI Coding Agent

> Hello, who are you?
🤖 I'm a helpful coding assistant. I can help you with programming questions,
   code review, debugging, and more. How can I assist you today?

> _
```

### 2.5.3 构建与发布

```bash
# 构建
bun run build

# 运行构建产物
bun run start

# 类型检查
bun run typecheck
```

---

## 2.6 配置文件系统（可选增强）

为了更方便地管理配置，我们可以添加配置文件支持。

### 2.6.1 配置类型定义

**文件位置**：`src/config/types.ts`

```typescript
/**
 * 配置类型定义
 * 
 * 使用 Zod 进行运行时验证
 */

import { z } from 'zod';

/**
 * 模型配置 Schema
 */
export const ModelConfigSchema = z.object({
  name: z.string().optional(),
  apiKey: z.string().optional(),
  baseURL: z.string().optional(),
  model: z.string().optional(),
});

/**
 * 完整配置 Schema
 */
export const ConfigSchema = z.object({
  // 默认模型配置
  default: ModelConfigSchema.optional(),
  
  // UI 配置
  ui: z.object({
    theme: z.enum(['dark', 'light']).optional(),
  }).optional(),
});

// 类型导出
export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;

/**
 * 默认配置
 */
export const DEFAULT_CONFIG: Config = {
  default: {
    model: 'gpt-4',
  },
  ui: {
    theme: 'dark',
  },
};
```

**Zod 的作用**：

```typescript
// Zod 提供运行时验证
const result = ConfigSchema.safeParse(userInput);
if (!result.success) {
  console.error('配置验证失败:', result.error.message);
}

// 同时提供类型推断
type Config = z.infer<typeof ConfigSchema>;
```

### 2.6.2 配置加载优先级

```
优先级（从低到高）：
1. 默认配置 (DEFAULT_CONFIG)
2. 用户配置 (~/.clawdcode/config.json)
3. 项目配置 (./.clawdcode/config.json)
4. 环境变量 (OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL)
5. CLI 参数 (--api-key, --base-url, --model)
```

---

## 2.7 本章小结

### 完成的内容

1. **技术栈选择**
   - TypeScript + Ink + yargs + OpenAI SDK + Zod

2. **项目初始化**
   - package.json 配置
   - tsconfig.json 配置
   - 目录结构创建

3. **Hello World Agent**
   - SimpleAgent 类实现
   - 类型定义

4. **Ink UI**
   - ErrorBoundary 组件
   - App 主界面组件
   - main.tsx 入口文件

### 文件清单

| 文件 | 说明 |
|------|------|
| `package.json` | 项目配置 |
| `tsconfig.json` | TypeScript 配置 |
| `src/agent/types.ts` | Agent 类型定义 |
| `src/agent/SimpleAgent.ts` | Hello World Agent |
| `src/agent/index.ts` | Agent 模块导出 |
| `src/ui/components/ErrorBoundary.tsx` | 错误边界组件 |
| `src/ui/components/index.ts` | 组件导出 |
| `src/ui/App.tsx` | 主界面 |
| `src/main.tsx` | CLI 入口 |

### 技术亮点

| 亮点 | 说明 |
|------|------|
| Ink 组件化 | 像写 Web 组件一样写 CLI |
| OpenAI SDK 兼容性 | 通过 baseURL 支持多种服务 |
| Zod 运行时验证 | 类型安全 + 运行时验证 |
| Bun 类型导出 | `export type` 区分类型和值 |

---

## 下一章预告

在 **第三章** 中，我们将：
1. 完善 yargs CLI 配置
2. 实现中间件机制
3. 添加版本检查服务
4. 实现更新提示组件
5. 完善错误处理

这将使我们的 CLI 更加专业和用户友好！
