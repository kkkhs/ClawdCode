# 第三章：CLI 入口与启动流程

> 本章实现 CLI 的完整启动流程，包括 yargs 命令配置、中间件机制、错误处理等核心功能。

## 3.1 CLI 架构概览

### 3.1.1 启动流程全景

当用户在终端输入 `clawdcode` 命令时，会触发以下初始化流程：

```
用户输入 → 早期解析 --debug → 创建 yargs 实例 → 注册选项和命令
                                                      ↓
                                              解析所有参数
                                                      ↓
                                              执行中间件链
                                                      ↓
                                    validatePermissions → loadConfiguration → validateOutput
                                                      ↓
                                              执行默认命令 → 启动 React UI
```

### 3.1.2 核心文件结构

```
src/
├── main.tsx              # CLI 主入口
├── cli/
│   ├── types.ts          # 类型定义
│   ├── config.ts         # yargs 选项配置
│   ├── middleware.ts     # 中间件函数
│   └── index.ts          # 导出
└── ui/
    └── components/
        └── ErrorBoundary.tsx  # 错误边界组件
```

## 3.2 入口文件详解

### 3.2.1 main.tsx 结构

```typescript
#!/usr/bin/env node

import { render } from 'ink';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { globalOptions, cliConfig } from './cli/config.js';
import { loadConfiguration, validatePermissions, validateOutput } from './cli/middleware.js';
```

**关键点**：

1. `#!/usr/bin/env node` - Shebang，让文件可以直接作为命令运行
2. `hideBin(process.argv)` - 移除 `node` 和脚本路径，只保留用户参数

### 3.2.2 Debug 参数早期解析

```typescript
// ⚠️ 关键：在创建任何 logger 之前，先解析 --debug 参数
const rawArgs = hideBin(process.argv);
const debugIndex = rawArgs.indexOf('--debug');
if (debugIndex !== -1) {
  // 设置全局 debug 标志
}
```

**为什么要早期解析 `--debug`？**

- Logger 在各模块中被创建
- 如果等 yargs 解析完再设置 debug，部分初始化日志会丢失
- 早期解析确保所有日志都能正确输出

## 3.3 yargs 命令配置

### 3.3.1 全局选项定义

在 `src/cli/config.ts` 中定义所有全局选项：

```typescript
export const globalOptions = {
  // 调试选项
  debug: {
    alias: 'd',
    type: 'boolean',
    describe: 'Enable debug mode',
    group: 'Debug Options:',
  },

  // 模型选项
  model: {
    alias: 'm',
    type: 'string',
    describe: 'Model to use for the current session',
    group: 'AI Options:',
  },

  // 安全选项
  'permission-mode': {
    type: 'string',
    choices: ['default', 'autoEdit', 'yolo'],
    describe: 'Permission mode for tool execution',
    group: 'Security Options:',
  },
} satisfies Record<string, Options>;
```

### 3.3.2 选项分组

yargs 支持通过 `group` 属性对选项进行分组，帮助输出会更清晰：

- **Debug Options:** 调试相关
- **AI Options:** 模型和 AI 相关
- **Security Options:** 权限和安全相关
- **Session Options:** 会话管理相关

### 3.3.3 选项类型处理

yargs 支持多种类型的选项：

```typescript
// 布尔类型
yolo: { type: 'boolean' }

// 字符串类型
model: { type: 'string' }

// 数字类型
'max-turns': { type: 'number' }

// 数组类型
'allowed-tools': { type: 'array', string: true }

// 带 coerce 的复杂类型（自定义解析）
resume: {
  coerce: (value) => {
    if (value === true || value === '') return 'interactive';
    return String(value);
  }
}
```

## 3.4 中间件机制

### 3.4.1 什么是中间件

yargs 中间件是在命令执行前运行的函数，用于：

- 验证参数
- 加载配置
- 设置全局状态
- 参数转换

```typescript
// 中间件签名
type MiddlewareFunction = (argv: Arguments) => void | Promise<void>;

// 注册中间件
cli.middleware([middleware1, middleware2, middleware3]);
```

### 3.4.2 中间件链

```
用户输入 → validatePermissions → loadConfiguration → validateOutput → 执行命令
```

### 3.4.3 validatePermissions 中间件

```typescript
export const validatePermissions: MiddlewareFunction = (argv) => {
  // 1. 处理 --yolo 快捷方式
  if (argv.yolo) {
    argv.permissionMode = 'yolo';
  }

  // 2. 验证工具列表冲突
  if (argv.allowedTools && argv.disallowedTools) {
    const intersection = argv.allowedTools.filter(tool =>
      argv.disallowedTools.includes(tool)
    );
    if (intersection.length > 0) {
      throw new Error(`Tools cannot be both allowed and disallowed: ${intersection.join(', ')}`);
    }
  }
};
```

**职责**：
1. 处理参数快捷方式（`--yolo` → `--permission-mode=yolo`）
2. 检测参数冲突

### 3.4.4 loadConfiguration 中间件

这是最重要的中间件，负责初始化整个配置系统：

```typescript
export const loadConfiguration: MiddlewareFunction = async (argv) => {
  try {
    // 1. 初始化 ConfigManager
    await configManager.initialize();
    
    // 2. 应用 CLI 参数
    configManager.applyCliArgs({
      apiKey: argv.apiKey,
      baseURL: argv.baseUrl,
      model: argv.model,
    });
    
  } catch (error) {
    console.error('❌ 配置初始化失败');
    process.exit(1);
  }
};
```

### 3.4.5 validateOutput 中间件

```typescript
export const validateOutput: MiddlewareFunction = (argv) => {
  // 验证输出格式组合
  if (argv.outputFormat && argv.outputFormat !== 'text' && !argv.print) {
    throw new Error('--output-format can only be used with --print flag');
  }
};
```

## 3.5 命令注册

### 3.5.1 默认命令（$0）

当用户不指定任何子命令时，执行默认命令：

```typescript
.command(
  '$0 [message]',
  'Start interactive mode',
  (yargs) => yargs.positional('message', {
    type: 'string',
    describe: 'Initial message to send',
  }),
  async (argv) => {
    // 获取初始消息
    const initialMessage = argv.message || argv._.join(' ') || undefined;
    
    // 启动 React UI
    render(<App initialMessage={initialMessage} {...argv} />);
  }
)
```

### 3.5.2 子命令示例

```typescript
export const configCommands: CommandModule = {
  command: 'config <subcommand>',
  describe: 'Configuration management',
  builder: (yargs) =>
    yargs
      .command('init', 'Create default config', {}, initHandler)
      .command('show', 'Show current config', {}, showHandler)
      .demandCommand(1, 'Please specify a subcommand'),
  handler: () => {},
};
```

## 3.6 错误处理

### 3.6.1 yargs 错误处理

```typescript
cli.fail((msg, err, yargs) => {
  if (err) {
    console.error('💥 An error occurred:');
    console.error(err.message);
    if (argv.debug) {
      console.error('\nStack trace:');
      console.error(err.stack);
    }
    process.exit(1);
  }

  if (msg) {
    console.error('❌ Invalid arguments:');
    console.error(msg);
    yargs.showHelp();
    process.exit(1);
  }
});
```

### 3.6.2 ErrorBoundary

React 组件的错误边界，用于捕获 UI 渲染错误：

```typescript
export class ErrorBoundary extends React.Component<Props, State> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box flexDirection="column">
          <Text color="red">❌ Application error</Text>
          <Text>{this.state.error?.message}</Text>
        </Box>
      );
    }
    return this.props.children;
  }
}
```

## 3.7 本章实现

本章实现了以下功能：

1. **CLI 类型定义** (`src/cli/types.ts`)
   - `CliArguments` 接口定义所有 CLI 参数
   - `MiddlewareFunction` 中间件函数类型

2. **yargs 选项配置** (`src/cli/config.ts`)
   - `globalOptions` 全局选项定义
   - `cliConfig` CLI 基础配置（name, version, usage）

3. **中间件函数** (`src/cli/middleware.ts`)
   - `validatePermissions` 权限验证
   - `loadConfiguration` 配置加载
   - `validateOutput` 输出验证

4. **错误边界** (`src/ui/components/ErrorBoundary.tsx`)
   - React 错误边界组件

5. **重构 main.tsx**
   - 使用新的 CLI 架构
   - 支持 `initialMessage` 参数
   - 完善的错误处理

## 3.8 使用方式

```bash
# 启动交互模式
bun run dev

# 带初始消息启动
bun run dev "帮我分析这个项目"

# 使用特定模型
bun run dev --model gpt-4

# 启用调试模式
bun run dev --debug

# 查看帮助
bun run dev --help
```

## 3.9 总结

本章构建了 CLI 的完整架构：

- **yargs** 处理命令行参数解析
- **中间件链** 在命令执行前进行验证和初始化
- **ErrorBoundary** 优雅处理 React 渲染错误
- **模块化设计** 便于后续扩展新命令和选项

下一章将实现 Agent 核心类和 Agentic Loop。
