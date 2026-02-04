# 第十一章：配置系统与状态管理

> 双文件配置、Zustand Store、SSOT 架构

## 11.1 配置系统概述

### 11.1.1 配置的挑战

一个 Coding Agent 需要管理大量配置：

1. **API 配置**：多个 LLM 提供商的 API Key、Base URL、模型名称
2. **行为配置**：权限规则、Hooks、环境变量
3. **UI 配置**：主题、语言、字体大小
4. **运行时配置**：CLI 参数、会话状态

这些配置有不同的特点：

| 配置类型 | 持久化 | 优先级 | 作用域 |
|---------|-------|-------|-------|
| 默认配置 | 否 | 最低 | 全局 |
| 用户配置 | 是 | 中 | 全局 |
| 项目配置 | 是 | 高 | 项目 |
| 本地配置 | 是 | 更高 | 项目（不提交） |
| CLI 参数 | 否 | 最高 | 会话 |

### 11.1.2 双文件配置架构

ClawdCode 采用双文件配置系统，将配置按用途分离：

```
~/.clawdcode/                    # 用户级配置目录
├── config.json                  # 基础配置（API、模型、UI、MCP）
└── settings.json                # 行为配置（权限、Hooks）

./project/.clawdcode/            # 项目级配置目录
├── config.json                  # 项目基础配置（覆盖用户配置）
├── settings.json                # 项目行为配置（团队共享）
└── settings.local.json          # 本地行为配置（不提交到 Git）
```

**文件职责：**

| 文件 | 内容 | Git |
|------|------|-----|
| config.json | default（API Key、模型）、ui、mcpServers | 忽略（含密钥） |
| settings.json | permissions、defaultPermissionMode、hooks | 可提交 |
| settings.local.json | 本地覆盖配置 | 忽略 |

**合并流程：**

```
默认配置 → 用户 config.json → 用户 settings.json 
        → 项目 config.json → 项目 settings.json 
        → 本地 settings.local.json → CLI 参数
        → RuntimeConfig
```

**示例配置文件：**

config.json（基础配置）：
```json
{
  "default": {
    "apiKey": "your-api-key",
    "baseURL": "https://api.openai.com/v1",
    "model": "gpt-4",
    "temperature": 0.7
  },
  "ui": { "theme": "dark" },
  "mcpEnabled": true,
  "mcpServers": {}
}
```

settings.json（行为配置）：
```json
{
  "permissions": {
    "allow": ["Read(**/*)", "Bash(git *)"],
    "deny": ["Bash(rm -rf *)"],
    "ask": []
  },
  "defaultPermissionMode": "default"
}
```

## 11.2 配置类型定义

### 11.2.1 核心类型

```typescript
// src/config/types.ts

/**
 * LLM API 提供商类型
 */
export type ProviderType = 'openai-compatible' | 'anthropic';

/**
 * 权限模式枚举
 */
export enum PermissionMode {
  DEFAULT = 'default',     // 只读自动，写入需确认
  AUTO_EDIT = 'autoEdit',  // 只读+写入自动，执行需确认
  YOLO = 'yolo',           // 完全自动（危险）
  PLAN = 'plan',           // 只读自动，其他拦截
}

/**
 * 单个模型配置
 */
export interface ModelConfig {
  id: string;              // nanoid 自动生成
  name: string;            // 显示名称
  provider: ProviderType;
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature?: number;
  maxContextTokens?: number;
}

/**
 * 权限配置
 */
export interface PermissionConfig {
  allow: string[];  // 自动允许的规则
  ask: string[];    // 需要确认的规则
  deny: string[];   // 直接拒绝的规则
}
```

### 11.2.2 完整配置类型

```typescript
/**
 * ClawdCode 完整配置
 * 合并 config.json 和 settings.json 的所有配置项
 */
export interface ClawdConfig {
  // ===== 基础配置 (config.json) =====
  
  // 多模型配置
  currentModelId: string;
  models: ModelConfig[];
  
  // 全局参数
  temperature: number;
  maxContextTokens: number;
  maxOutputTokens: number;
  stream: boolean;
  timeout: number;
  
  // UI
  theme: string;
  language: string;
  
  // 调试
  debug: string | boolean;
  
  // MCP
  mcpEnabled: boolean;
  mcpServers: Record<string, McpServerConfig>;
  
  // ===== 行为配置 (settings.json) =====
  
  // 权限
  permissions: PermissionConfig;
  permissionMode: PermissionMode;
  
  // Hooks
  hooks: HookConfig;
  
  // 环境变量
  env: Record<string, string>;
  
  // 其他
  maxTurns: number;
}
```

### 11.2.3 运行时配置

```typescript
/**
 * 运行时配置
 * 继承 ClawdConfig + CLI 临时字段
 */
export interface RuntimeConfig extends ClawdConfig {
  // 系统提示
  systemPrompt?: string;
  appendSystemPrompt?: string;
  
  // 会话管理
  initialMessage?: string;
  resumeSessionId?: string;
  
  // 工具过滤
  allowedTools?: string[];
  disallowedTools?: string[];
  
  // MCP
  mcpConfigPaths?: string[];
  
  // 其他
  outputFormat?: 'text' | 'json' | 'stream-json';
}
```

## 11.3 ConfigManager：配置加载器

### 11.3.1 职责定义

ConfigManager 是**纯粹的加载器**，只负责启动时加载配置：

```typescript
/**
 * ClawdCode 配置加载器（Bootstrap/Loader）
 * 
 * 职责：
 * - 从多个配置文件加载配置
 * - 合并配置（优先级处理）
 * - 解析环境变量插值
 * - 返回 ClawdConfig 供 Store 使用
 * 
 * ⚠️ 注意：
 * - 运行时配置管理由 Store 负责
 * - 配置持久化由 ConfigService 负责
 * - ConfigManager 只在启动时调用一次
 */
```

### 11.3.2 配置文件加载

ConfigManager.initialize() 按以下顺序加载配置文件：

```typescript
async initialize(projectPath?: string): Promise<Config> {
  // 1. 从默认配置开始
  this.config = { ...DEFAULT_CONFIG };

  // 2. 加载用户 config.json
  await this.loadConfigFile('~/.clawdcode/config.json');

  // 3. 加载用户 settings.json
  await this.loadConfigFile('~/.clawdcode/settings.json');

  // 4. 加载项目 config.json
  await this.loadConfigFile('./.clawdcode/config.json');

  // 5. 加载项目 settings.json
  await this.loadConfigFile('./.clawdcode/settings.json');

  // 6. 加载本地 settings.local.json（不提交到 Git）
  await this.loadConfigFile('./.clawdcode/settings.local.json');

  // 7. 应用环境变量
  this.applyEnvironmentVariables();

  return this.config;
}
```

**加载优先级（后者覆盖前者）：**
1. 默认配置
2. 用户 config.json
3. 用户 settings.json
4. 项目 config.json
5. 项目 settings.json
6. 本地 settings.local.json
7. 环境变量
8. CLI 参数

### 11.3.3 智能合并策略

不同字段使用不同的合并策略：

| 字段 | 合并策略 | 说明 |
|-----|---------|-----|
| permissions | append-dedupe | 数组追加去重 |
| hooks | deep-merge | 对象深度合并 |
| env | deep-merge | 对象深度合并 |
| 其他 | replace | 直接覆盖 |

### 11.3.4 环境变量插值

支持在配置文件中使用环境变量：

```json
{
  "models": [{
    "apiKey": "${OPENAI_API_KEY}",
    "baseUrl": "${OPENAI_BASE_URL:-https://api.openai.com/v1}"
  }]
}
```

支持格式：`$VAR`、`${VAR}`、`${VAR:-default}`

## 11.4 ConfigService：配置持久化

### 11.4.1 字段路由表

ConfigService 的核心是字段路由表，定义每个字段的持久化行为：

```typescript
type MergeStrategy = 'replace' | 'append-dedupe' | 'deep-merge';
type ConfigTarget = 'config' | 'settings';
type ConfigScope = 'local' | 'project' | 'global';

interface FieldRouting {
  target: ConfigTarget;      // 写入哪个文件
  defaultScope: ConfigScope; // 默认作用域
  mergeStrategy: MergeStrategy;
  persistable: boolean;      // 是否可持久化
}

const FIELD_ROUTING_TABLE: Record<string, FieldRouting> = {
  // config.json 字段
  models: { target: 'config', defaultScope: 'global', mergeStrategy: 'replace', persistable: true },
  theme: { target: 'config', defaultScope: 'global', mergeStrategy: 'replace', persistable: true },
  
  // settings.json 字段
  permissions: { target: 'settings', defaultScope: 'local', mergeStrategy: 'replace', persistable: true },
  hooks: { target: 'settings', defaultScope: 'local', mergeStrategy: 'deep-merge', persistable: true },
  
  // 非持久化字段（CLI 临时参数）
  systemPrompt: { target: 'settings', defaultScope: 'local', mergeStrategy: 'replace', persistable: false },
};
```

### 11.4.2 Read-Modify-Write 原子操作

```typescript
/**
 * 执行写入操作（Read-Modify-Write）
 * 使用 Per-file Mutex 保证并发安全
 */
private async performWrite(filePath: string, updates: Record<string, unknown>): Promise<void> {
  // 1. Read：读取当前磁盘内容
  // 2. Modify：按字段合并策略合并
  // 3. Write：原子写入（使用 write-file-atomic）
}
```

## 11.5 Zustand Store

### 11.5.1 Store 架构设计

```
Zustand Store (vanillaStore)
├── sessionSlice    # 会话状态（消息、thinking、token）
├── configSlice     # 配置状态（RuntimeConfig）
├── appSlice        # 应用状态（初始化、模态框、todos）
├── focusSlice      # 焦点状态（当前焦点组件）
└── commandSlice    # 命令状态（处理中、队列、AbortController）
```

**访问方式：**
- React 组件：`useClawdStore(selector)`
- Agent/服务层：`getState()`、`sessionActions()`

### 11.5.2 Store 类型定义

```typescript
// src/store/types.ts

// 初始化状态（包含 needsSetup 用于引导配置）
type InitializationStatus = 'pending' | 'loading' | 'ready' | 'error' | 'needsSetup';

// 模态框类型
type ActiveModal = 'none' | 'shortcuts' | 'settings' | 'confirmation' | 'update' | 'themeSelector';

// FocusId 类型和常量
type FocusId = 'input' | 'messages' | 'confirmation' | 'modal' | 'none' | 'theme-selector';

/** FocusId 常量枚举（用作值） */
const FocusId = {
  MAIN_INPUT: 'input' as FocusId,
  MESSAGES: 'messages' as FocusId,
  CONFIRMATION_PROMPT: 'confirmation' as FocusId,
  THEME_SELECTOR: 'theme-selector' as FocusId,
  MODAL: 'modal' as FocusId,
  NONE: 'none' as FocusId,
} as const;

interface SessionState {
  sessionId: string;
  messages: SessionMessage[];
  isThinking: boolean;
  isCompacting: boolean;
  error: string | null;
  tokenUsage: TokenUsage;
}

interface ConfigState {
  config: RuntimeConfig | null;
}

interface AppState {
  initializationStatus: InitializationStatus;
  initializationError: string | null;
  activeModal: ActiveModal;
  todos: TodoItem[];
}

interface FocusState {
  currentFocus: FocusId;
  previousFocus: FocusId | null;
}

interface CommandState {
  isProcessing: boolean;
  abortController: AbortController | null;
  pendingCommands: string[];  // 命令队列
}

interface ClawdStore {
  session: SessionSlice;
  config: ConfigSlice;
  app: AppSlice;
  focus: FocusSlice;
  command: CommandSlice;
}
```

### 11.5.3 Vanilla Store 实现

```typescript
// src/store/vanilla.ts

import { createStore } from 'zustand/vanilla';
import { devtools, subscribeWithSelector } from 'zustand/middleware';

export const vanillaStore = createStore<ClawdStore>()(
  devtools(
    subscribeWithSelector((...a) => ({
      session: createSessionSlice(...a),
      config: createConfigSlice(...a),
      app: createAppSlice(...a),
      focus: createFocusSlice(...a),
      command: createCommandSlice(...a),
    })),
    { name: 'ClawdStore' }
  )
);

// 便捷访问器
export const getState = () => vanillaStore.getState();
export const subscribe = vanillaStore.subscribe;

// Actions 快捷访问
export const sessionActions = () => getState().session.actions;
export const appActions = () => getState().app.actions;
export const commandActions = () => getState().command.actions;
```

### 11.5.4 Command Slice：命令队列系统

命令队列支持在 Agent 执行时用户输入新命令：

```typescript
const createCommandSlice = (set, get) => ({
  isProcessing: false,
  abortController: null,
  pendingCommands: [],
  
  actions: {
    setProcessing: (isProcessing: boolean) => { /* ... */ },
    createAbortController: () => { /* ... */ },
    abort: () => { /* ... */ },
    enqueueCommand: (command: string) => { /* ... */ },
    dequeueCommand: () => { /* ... */ },
    clearQueue: () => { /* ... */ },
  },
});
```

## 11.6 React 集成

### 11.6.1 useClawdStore Hook

```typescript
// src/store/index.ts

import { useStore } from 'zustand';
import { vanillaStore } from './vanilla.js';

export function useClawdStore<T>(selector: (state: ClawdStore) => T): T {
  return useStore(vanillaStore, selector);
}
```

### 11.6.2 选择器模式

```typescript
// src/store/selectors.ts

// 基础选择器
export const useSessionId = () => useClawdStore(state => state.session.sessionId);
export const useMessages = () => useClawdStore(state => state.session.messages);
export const useIsThinking = () => useClawdStore(state => state.session.isThinking);

// 派生选择器
export const useCurrentModel = () => useClawdStore(state => {
  const config = state.config.config;
  if (!config) return undefined;
  return config.models.find(m => m.id === config.currentModelId) ?? config.models[0];
});

// 跨 Slice 组合选择器
export const useIsBusy = () => useClawdStore(state =>
  state.session.isThinking || state.command.isProcessing
);
```

### 11.6.3 useShallow 优化

当选择器返回对象或数组时，使用 `useShallow` 避免不必要的重渲染：

```typescript
import { useShallow } from 'zustand/react/shallow';

export const useSessionState = () => useClawdStore(
  useShallow(state => ({
    sessionId: state.session.sessionId,
    messages: state.session.messages,
    isThinking: state.session.isThinking,
  }))
);

// 使用常量空引用避免重渲染
const EMPTY_MODELS: ModelConfig[] = [];
export const useAllModels = () => useClawdStore(
  state => state.config.config?.models ?? EMPTY_MODELS
);
```

## 11.7 Store 初始化机制

### 11.7.1 三层初始化防护

| 层级 | 位置 | 说明 |
|-----|------|-----|
| 1 | App.tsx useEffect | UI 路径初始化 |
| 2 | middleware.ts | CLI 命令路径初始化 |
| 3 | Agent.create() | 防御性兜底 |

### 11.7.2 ensureStoreInitialized

```typescript
let initializationPromise: Promise<void> | null = null;

/**
 * 确保 Store 已初始化
 * 
 * 特性：
 * - 幂等：已初始化直接返回
 * - 并发安全：共享 Promise
 * - 失败重试：下次调用重新尝试
 */
export async function ensureStoreInitialized(): Promise<void> {
  // 1. 快速路径：已初始化
  if (getConfig() !== null) return;
  
  // 2. 并发保护：等待共享 Promise
  if (initializationPromise) return initializationPromise;
  
  // 3. 开始初始化
  initializationPromise = (async () => {
    try {
      const configManager = ConfigManager.getInstance();
      const config = await configManager.initialize();
      getState().config.actions.setConfig(config);
    } finally {
      initializationPromise = null;
    }
  })();
  
  return initializationPromise;
}
```

## 11.8 权限检查器

### 11.8.1 三级权限模型

检查流程：`deny → allow → ask → 默认(ask)`

```typescript
export enum PermissionResult {
  ALLOW = 'allow',
  ASK = 'ask',
  DENY = 'deny',
}

export class PermissionChecker {
  check(descriptor: ToolInvocationDescriptor): PermissionCheckResult {
    const signature = PermissionChecker.buildSignature(descriptor);
    
    // 1. 检查 deny 规则（最高优先级）
    // 2. 检查 allow 规则
    // 3. 检查 ask 规则
    // 4. 默认需要确认
  }
}
```

### 11.8.2 规则匹配模式

支持四种匹配模式：

| 模式 | 示例 | 说明 |
|-----|------|-----|
| 精确匹配 | `Read(/path/to/file.txt)` | 完全匹配 |
| 前缀匹配 | `Read` | 匹配所有 Read 调用 |
| 通配符 | `Bash(npm *)` | 简单通配 |
| Glob | `Read(**/*.env)` | 复杂模式 |

### 11.8.3 默认权限规则

```typescript
const DEFAULT_PERMISSIONS = {
  allow: [
    'Bash(pwd)', 'Bash(whoami)', 'Bash(ls *)',
    'Bash(git status)', 'Bash(git log *)', 'Bash(git diff *)',
  ],
  ask: [
    'Bash(curl *)', 'Bash(wget *)', 'Bash(rm -rf *)',
  ],
  deny: [
    'Read(./.env)', 'Read(./.env.*)',
    'Bash(rm -rf /)', 'Bash(sudo *)',
  ],
};
```

## 11.9 完整数据流

### 11.9.1 启动时配置加载

```
CLI → App.tsx → ConfigManager.initialize()
                    ↓
              loadConfigFiles()
              loadSettingsFiles()
              mergeSettings()
              resolveEnvInterpolation()
                    ↓
              Store.setConfig(config)
                    ↓
              UI 渲染
```

### 11.9.2 运行时配置修改

```
用户操作 → configActions.setTheme('dark')
              ↓
         Store.updateConfig({ theme })  ← 同步更新内存
              ↓
         ConfigService.save({ theme })  ← 异步持久化
              ↓
         Read-Modify-Write → 磁盘
```

## 11.10 踩坑记录

### 坑 1：React Context 性能问题

**问题**：任何状态变化都导致所有订阅者重渲染

**解决**：迁移到 Zustand，使用细粒度选择器

### 坑 2：Store 未初始化就访问

**问题**：CLI `--print` 模式或 slash command 执行时，Store 可能还未初始化

**解决**：三层初始化防护 + `ensureStoreInitialized()`

### 坑 3：配置持久化丢失数据

**问题**：直接覆盖配置文件，导致其他字段丢失

**解决**：Read-Modify-Write 原子操作

### 坑 4：并发写入配置冲突

**问题**：快速连续修改配置时，产生竞态条件

**解决**：Per-file Mutex + 防抖

### 坑 5：选择器返回新对象导致无限重渲染

**问题**：选择器返回对象/数组时，每次都创建新引用

**解决**：`useShallow` + 常量空引用

### 坑 6：configActions 和 getConfig 不一致

**问题**：同时使用 ConfigManager 和 Store 导致数据不一致

**解决**：统一数据流，运行时修改通过 configActions

### 坑 7：Ink 的 exit() 在 exitOnCtrlC: false 时不够用

**问题**：设置 `exitOnCtrlC: false` 后，Ink 的 `exit()` 调用后进程不会退出，需要再按一次 Ctrl+C 才能回到命令行

**原因**：`exitOnCtrlC: false` 禁用了 Ink 的 SIGINT 处理，但 `exit()` 只是清理 Ink 的渲染，不会触发 `process.exit()`

**解决**：在 `exit()` 后额外调用 `process.exit(0)` 确保进程退出

```typescript
// useCtrlCHandler.ts
const doExit = useCallback(() => {
  if (onBeforeExit) {
    const handled = onBeforeExit();
    if (handled === true) return;
  }
  exit();
  // 关键：确保进程退出
  setTimeout(() => process.exit(0), 50);
}, [onBeforeExit, exit]);
```

### 坑 8：ExitMessage 渲染不完整就退出了

**问题**：按 Ctrl+C 后 ExitMessage 应该显示在状态栏下方，但实际什么都没显示就退出了

**原因**：`onBeforeExit` 设置 `isExiting=true` 后，React 还没来得及重渲染就调用了 `exit()`

**解决**：
1. `onBeforeExit` 返回 `true` 阻止 `useCtrlCHandler` 立即调用 `exit()`
2. 由 `ExitMessage` 组件延迟 500ms 后自行调用 `exit()`

```typescript
// ExitMessage.tsx
useEffect(() => {
  const timer = setTimeout(() => {
    exit();
    setTimeout(() => process.exit(0), 50);
  }, 500); // 延迟 500ms 确保渲染完成
  return () => clearTimeout(timer);
}, [exit]);

// ClawdInterface.tsx
useCtrlCHandler({
  onBeforeExit: () => {
    if (currentSessionId && messages.length > 0) {
      setIsExiting(true);
      return true; // 阻止默认退出，由 ExitMessage 处理
    }
    return false;
  },
});
```

## 11.11 测试方法

### 运行 Store 测试

```bash
bun run test:store
```

### 测试成功输出

```
============================================================
Store 模块测试
============================================================

📝 测试 1: Store 实例
----------------------------------------
✅ vanillaStore 实例存在
✅ Store 包含所有 5 个 Slice

📝 测试 2: Session Slice
----------------------------------------
✅ 初始 sessionId: 1770194316334-xxx...
✅ addUserMessage 正常
✅ setThinking(true) 正常
✅ clearMessages 正常

📝 测试 3: Config Slice
----------------------------------------
✅ 初始 config 为 null
✅ setConfig 正常
✅ updateConfig 正常

📝 测试 4: App Slice
----------------------------------------
✅ 初始 initializationStatus 为 pending
✅ setInitializationStatus 正常
✅ addTodo 正常
✅ updateTodo 正常
✅ removeTodo 正常

📝 测试 5: Focus Slice
----------------------------------------
✅ 初始焦点为 input
✅ setFocus 正常
✅ previousFocus 记录正确
✅ restoreFocus 正常

📝 测试 6: Command Slice
----------------------------------------
✅ 初始 isProcessing 为 false
✅ setProcessing 正常
✅ enqueueCommand 正常
✅ dequeueCommand 正常
✅ clearQueue 正常
✅ createAbortController 正常
✅ abort 正常

📝 测试 7: 订阅功能
----------------------------------------
✅ subscribeToMessages 正常触发

============================================================
测试完成: 26 通过, 0 失败
============================================================
```

### 验证内容

| 测试项 | 验证内容 |
|--------|----------|
| Store 实例 | vanillaStore 存在，包含 5 个 Slice |
| Session Slice | 消息管理、thinking 状态 |
| Config Slice | 配置设置和更新 |
| App Slice | 初始化状态、Todo 管理 |
| Focus Slice | 焦点切换和恢复 |
| Command Slice | 命令队列、AbortController |
| 订阅功能 | subscribeToMessages 触发 |

### UI 集成测试

```bash
bun run dev
```

启动后应该看到：
1. "Starting ClawdCode..." 加载提示
2. Store 初始化完成后显示主界面

## 11.12 技术亮点

1. **双文件配置架构**：config.json（API/UI） + settings.json（权限/Hooks）分离关注点
2. **Zustand Vanilla Store**：支持 React 和非 React 环境统一访问
3. **字段路由表**：单一真相源，定义每个字段的持久化行为
4. **三层初始化防护**：确保 Store 在任何路径都能正确初始化
5. **命令队列系统**：支持 Agent 执行时用户输入新命令
6. **Per-file Mutex**：防止并发写入冲突
7. **useShallow 优化**：避免不必要的 React 重渲染

## 11.13 UI 集成

### App.tsx 完整集成

`AppWrapper` 组件已完成 Store 集成，包括配置合并和状态初始化：

```typescript
// 合并 CLI 参数到基础配置
function mergeRuntimeConfig(baseConfig: ClawdConfig, props: AppProps): RuntimeConfig {
  const runtimeConfig: RuntimeConfig = { ...baseConfig };
  
  if (props.initialMessage) runtimeConfig.initialMessage = props.initialMessage;
  if (props.resumeSessionId) runtimeConfig.resumeSessionId = props.resumeSessionId;
  if (props.permissionMode) runtimeConfig.defaultPermissionMode = props.permissionMode;
  if (props.model) runtimeConfig.currentModelId = props.model;
  
  return runtimeConfig;
}

// 初始化 Store 状态
function initializeStoreState(config: RuntimeConfig): void {
  configActions().setConfig(config);
  
  // 支持两种配置方式：default（单模型）或 models（多模型）
  const hasDefaultConfig = config.default?.apiKey;
  const hasModelsConfig = config.models && config.models.length > 0;
  
  if (!hasDefaultConfig && !hasModelsConfig) {
    appActions().setInitializationStatus('needsSetup');
  } else {
    appActions().setInitializationStatus('ready');
  }
}

// AppWrapper 初始化流程
const initializeApp = useCallback(async () => {
  appActions().setInitializationStatus('loading');
  
  // 1. 初始化 Store（加载配置文件）
  await ensureStoreInitialized();
  
  // 2. 从 Store 读取基础配置
  const baseConfig = getConfig() ?? DEFAULT_CONFIG;
  
  // 3. 合并 CLI 参数生成 RuntimeConfig
  const mergedConfig = mergeRuntimeConfig(baseConfig, props);
  
  // 4. 初始化 Store 状态
  initializeStoreState(mergedConfig);
  
  // 5. 加载主题
  if (mergedConfig.theme && themeManager.hasTheme(mergedConfig.theme)) {
    themeManager.setTheme(mergedConfig.theme);
  }
}, [props]);
```

### ClawdInterface 主界面

`ClawdInterface` 替代了原来的 `MainInterface`，完全使用 Store 管理状态：

```typescript
// src/ui/components/ClawdInterface.tsx

export interface ClawdInterfaceProps {
  apiKey: string;
  baseURL?: string;
  model?: string;
  initialMessage?: string;
  debug?: boolean;
  resumeSessionId?: string;
}

export const ClawdInterface: React.FC<ClawdInterfaceProps> = (props) => {
  // ==================== Store 状态 ====================
  const initializationStatus = useInitializationStatus();
  const activeModal = useActiveModal();
  const isThinking = useIsThinking();
  const messages = useMessages();
  const sessionId = useSessionId();
  const currentFocus = useCurrentFocus();

  // ==================== Hooks ====================
  const { confirmationState, handleResponse } = useConfirmation();
  const inputBuffer = useInputBuffer('', 0);
  
  // Ctrl+C 处理
  useCtrlCHandler({
    hasRunningTask: isThinking,
    onInterrupt: () => sessionActions().setThinking(false),
  });

  // ==================== 焦点管理 ====================
  useEffect(() => {
    if (confirmationState.isVisible) {
      focusActions().setFocus(FocusId.CONFIRMATION_PROMPT);
    } else if (activeModal === 'themeSelector') {
      focusActions().setFocus(FocusId.THEME_SELECTOR);
    } else {
      focusActions().setFocus(FocusId.MAIN_INPUT);
    }
  }, [confirmationState.isVisible, activeModal]);

  // ==================== 命令处理 ====================
  const handleSubmit = useCallback(async (value: string) => {
    if (!value.trim() || !agentRef.current) return;

    // 使用 Store actions 管理消息
    sessionActions().addUserMessage(value);
    inputBuffer.clear();
    sessionActions().setThinking(true);

    try {
      const result = await agentRef.current.chat(value, contextRef.current);
      sessionActions().addAssistantMessage(result);
    } catch (error) {
      sessionActions().addAssistantMessage(`Error: ${error.message}`);
    } finally {
      sessionActions().setThinking(false);
    }
  }, []);

  // ==================== 渲染 ====================
  // needsSetup 状态
  if (initializationStatus === 'needsSetup') {
    return <Text color="yellow">⚠️ No models configured.</Text>;
  }

  // 确认对话框（阻塞式）
  if (confirmationState.isVisible && confirmationState.details) {
    return <ConfirmationPrompt details={confirmationState.details} onResponse={handleResponse} />;
  }

  // 主界面
  return (
    <Box flexDirection="column" width="100%">
      {/* 标题 */}
      <Text bold color={theme.colors.primary}>🤖 ClawdCode</Text>
      
      {/* 消息区域 */}
      {messages.map((msg, i) => (
        <MessageRenderer key={i} content={msg.content} role={msg.role} />
      ))}
      
      {/* 加载指示器 */}
      {isThinking && <LoadingIndicator />}
      
      {/* 输入区域 */}
      {!isThinking && (
        <InputArea
          input={inputBuffer.value}
          cursorPosition={inputBuffer.cursorPosition}
          onChange={inputBuffer.setValue}
          onChangeCursorPosition={inputBuffer.setCursorPosition}
          onSubmit={handleSubmit}
        />
      )}
      
      {/* 状态栏 */}
      <ChatStatusBar sessionId={sessionId} messageCount={messages.length} />
    </Box>
  );
};
```

### 组件层次结构

```
App.tsx
└── AppWrapper
    ├── UpdatePrompt (条件渲染)
    └── ClawdInterface
        ├── MessageRenderer (循环)
        ├── LoadingIndicator (条件渲染)
        ├── ConfirmationPrompt (阻塞式)
        ├── InputArea
        │   └── CustomTextInput
        └── ChatStatusBar
```

**集成点：**
1. `ensureStoreInitialized()` - 启动时初始化 Store
2. `mergeRuntimeConfig()` - 合并 CLI 参数
3. `initializeStoreState()` - 写入 Store 状态
4. `ClawdInterface` - 主界面完全使用 Store
5. `FocusId` 常量 - 焦点管理

## 11.14 ContextManager 集成

ClawdInterface 集成了 ContextManager，实现完整的上下文管理：

### 11.14.1 集成架构

```
ClawdInterface
├── Agent (无状态)
├── ContextManager (上下文管理)
│   ├── MemoryStore (内存存储)
│   ├── PersistentStore (JSONL 持久化)
│   └── CacheStore (LRU 缓存)
└── Zustand Store (UI 状态)
```

**职责分离：**
- **Agent**：无状态，每次调用传入 ChatContext
- **ContextManager**：管理消息生命周期、持久化、压缩
- **Zustand Store**：管理 UI 状态（消息显示、思考状态等）

### 11.14.2 初始化流程

```typescript
// src/ui/components/ClawdInterface.tsx

useEffect(() => {
  const initAgent = async () => {
    // 1. 创建 ContextManager
    contextManagerRef.current = new ContextManager({
      storage: { maxMemorySize: 1000, cacheSize: 100 },
      defaultFilter: { maxTokens: 128000, maxMessages: 100 },
      compressionThreshold: 100000, // 100k tokens 触发压缩
    });

    // 2. 创建或加载会话
    let currentSessionId: string;
    
    if (resumeSessionId) {
      // 尝试加载现有会话
      const loaded = await contextManagerRef.current.loadSession(resumeSessionId);
      
      if (loaded) {
        currentSessionId = resumeSessionId;
        
        // 恢复消息到 UI Store
        const contextMessages = contextManagerRef.current.getMessages();
        contextMessages.forEach(m => {
          if (m.role === 'user') sessionActions().addUserMessage(m.content);
          else if (m.role === 'assistant') sessionActions().addAssistantMessage(m.content);
        });
      } else {
        // 加载失败，创建新会话
        currentSessionId = await contextManagerRef.current.createSession();
      }
    } else {
      // 创建新会话
      currentSessionId = await contextManagerRef.current.createSession();
    }

    // 更新 Store 中的 sessionId
    sessionActions().setSessionId(currentSessionId);

    // 3. 创建 Agent
    agentRef.current = await Agent.create({ apiKey, baseURL, model });
  };

  initAgent();
  
  // 清理函数
  return () => contextManagerRef.current?.cleanup();
}, [apiKey, baseURL, model, resumeSessionId]);
```

### 11.14.3 消息处理流程

```typescript
const handleSubmit = useCallback(async (value: string) => {
  const ctxManager = contextManagerRef.current;

  // 1. 添加用户消息到 UI Store
  sessionActions().addUserMessage(value);

  // 2. 添加用户消息到 ContextManager（自动持久化到 JSONL）
  await ctxManager.addMessage('user', value);

  // 3. 从 ContextManager 获取完整消息历史
  const contextMessages = ctxManager.getMessages();
  
  // 4. 构建 ChatContext 传给 Agent
  const chatContext: ChatContext = {
    sessionId: ctxManager.getCurrentSessionId(),
    messages: contextMessages.map(m => ({
      role: m.role,
      content: m.content,
    })),
  };

  // 5. 调用 Agent
  const result = await agentRef.current.chat(value, chatContext);

  // 6. 添加助手消息到 UI Store
  sessionActions().addAssistantMessage(result);

  // 7. 添加助手消息到 ContextManager（自动持久化）
  await ctxManager.addMessage('assistant', result);

  // 8. 更新 Token 统计
  const inputTokens = TokenCounter.countTokens(contextMessages, modelName);
  const outputTokens = TokenCounter.countTextTokens(result, modelName);
  ctxManager.updateTokenCount(inputTokens + outputTokens);
  
  sessionActions().updateTokenUsage({
    inputTokens: tokenUsage.inputTokens + inputTokens,
    outputTokens: tokenUsage.outputTokens + outputTokens,
  });
}, []);
```

### 11.14.4 自动压缩

ContextManager 在 `addMessage()` 时自动检查是否需要压缩：

```typescript
// ContextManager.addMessage() 内部
async addMessage(role, content): Promise<void> {
  // 添加到内存
  this.memory.addMessage(message);

  // 检查是否需要压缩
  const contextData = this.memory.getContext();
  if (contextData && this.shouldCompress(contextData)) {
    await this.compressCurrentContext();
  }

  // 异步保存到持久化存储（不阻塞主流程）
  this.saveMessageAsync(message);
}

private shouldCompress(contextData): boolean {
  return contextData.metadata.totalTokens > this.options.compressionThreshold;
}
```

### 11.14.5 会话持久化路径

```
~/.clawdcode/sessions/
└── {project-hash}/
    └── {session-id}.jsonl
```

每条消息追加写入 JSONL 文件，格式：
```json
{"type":"message","role":"user","content":"Hello","timestamp":1706947200000}
{"type":"message","role":"assistant","content":"Hi!","timestamp":1706947201000}
```

### 11.14.6 新增 Store Action

```typescript
// sessionSlice.ts
setSessionId: (sessionId: string) => {
  set((state) => ({
    session: { ...state.session, sessionId },
  }));
},
```

### 11.14.7 退出提示

退出应用时（Ctrl+C），在状态栏下方追加显示 `ExitMessage` 组件，提示用户如何恢复会话：

**退出流程：**

```
用户按 Ctrl+C
    ↓
useCtrlCHandler 捕获
    ↓
有消息？──是──→ onBeforeExit 返回 true
    │              ↓
    │         设置 isExiting=true
    │              ↓
    │         渲染 ExitMessage（状态栏下方）
    │              ↓
    │         延迟 500ms 后 exit() + process.exit(0)
    │
    └──否──→ 直接 exit() + process.exit(0)
```

**ExitMessage 组件：**

```typescript
// src/ui/components/common/ExitMessage.tsx
export const ExitMessage: React.FC<{ sessionId: string; exitDelay?: number }> = ({
  sessionId,
  exitDelay = 500, // 默认延迟 500ms 确保渲染完成
}) => {
  const { exit } = useApp();

  useEffect(() => {
    const timer = setTimeout(() => {
      exit();
      // 确保进程退出（exitOnCtrlC: false 时 Ink 的 exit() 可能不够）
      setTimeout(() => process.exit(0), 50);
    }, exitDelay);
    return () => clearTimeout(timer);
  }, [exit, exitDelay]);

  return (
    <Box flexDirection="column" paddingY={1}>
      <Text color="yellow">👋 Session saved!</Text>
      <Text color="green">   clawdcode --continue</Text>
      <Text color="green">   clawdcode --resume <Text color="cyan">{sessionId}</Text></Text>
    </Box>
  );
};
```

**useCtrlCHandler 配置：**

```typescript
// src/ui/hooks/useCtrlCHandler.ts
interface CtrlCHandlerOptions {
  hasRunningTask: boolean;
  onInterrupt?: () => void;
  onBeforeExit?: () => boolean | void; // 返回 true 阻止默认退出
  forceExitDelay?: number;
}

const doExit = useCallback(() => {
  if (onBeforeExit) {
    const handled = onBeforeExit();
    if (handled === true) return; // 由回调处理退出
  }
  exit();
  setTimeout(() => process.exit(0), 50); // 确保进程退出
}, [onBeforeExit, exit]);
```

**ClawdInterface 集成：**

```typescript
// 状态
const [isExiting, setIsExiting] = useState(false);
const [exitSessionId, setExitSessionId] = useState<string | null>(null);

// Ctrl+C 处理
useCtrlCHandler({
  hasRunningTask: isThinking,
  onBeforeExit: () => {
    const currentSessionId = contextManagerRef.current?.getCurrentSessionId();
    if (currentSessionId && messages.length > 0) {
      setExitSessionId(currentSessionId);
      setIsExiting(true);
      return true; // 由 ExitMessage 组件处理退出
    }
    return false; // 无消息时直接退出
  },
});

// 在状态栏下方追加 ExitMessage
return (
  <Box flexDirection="column">
    {/* ... 消息区域、输入区域 ... */}
    <ChatStatusBar ... />
    
    {/* 退出提示 */}
    {isExiting && exitSessionId && (
      <ExitMessage sessionId={exitSessionId} />
    )}
  </Box>
);
```

**main.tsx 配置：**

```typescript
render(<App />, {
  exitOnCtrlC: false, // 由 useCtrlCHandler 处理退出
});
```

**关键点：**

| 配置 | 说明 |
|------|------|
| `exitOnCtrlC: false` | 禁用 Ink 默认的 Ctrl+C 处理，由我们接管 |
| `onBeforeExit` 返回 `true` | 阻止 `useCtrlCHandler` 调用 `exit()`，由组件处理 |
| `exitDelay = 500ms` | 确保 ExitMessage 渲染完成后再退出 |
| `process.exit(0)` | 确保进程退出（Ink 的 `exit()` 在某些情况下不够） |

**用户体验：**

```
┌────────────────────────────────────────────────────────────┐
│ 🤖 ClawdCode - CLI Coding Agent                            │
├────────────────────────────────────────────────────────────┤
│ 👤 Hello                                                   │
│ 🤖 Hi! How can I help you today?                           │
├────────────────────────────────────────────────────────────┤
│ 📊 claude-3-5-sonnet | 🎨 dark | 💬 2 | 📝 abc123...       │
├────────────────────────────────────────────────────────────┤
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ 👋 Session saved! To resume this conversation:             │
│    clawdcode --continue                                    │
│    or                                                      │
│    clawdcode --resume abc123-def456-...                    │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
└────────────────────────────────────────────────────────────┘
```

### 11.14.8 测试方法

**会话持久化测试：**

```bash
# 本地开发测试
bun run dev

# 发送几条消息后按 Ctrl+C 退出
# 观察退出提示（带颜色高亮，显示在终端底部）

# 使用 --continue 恢复会话
bun run dev -- --continue

# 或使用具体 session ID 恢复
bun run dev -- --resume <session-id>

# 检查消息是否恢复
```

**安装后测试：**

```bash
# 全局安装后
clawdcode

# 恢复会话
clawdcode --continue
clawdcode --resume <session-id>
```

**状态栏显示：**

运行应用后，状态栏显示：
- 🤖 模型名称
- 💬 消息数量
- 📊 token 使用量 (input/output tokens)
- 🎨 主题名称
- 📝 **完整会话 ID**

**会话文件检查：**

```bash
# 查看保存的会话
ls -la ~/.clawdcode/sessions/

# 查看 JSONL 内容
cat ~/.clawdcode/sessions/*/*.jsonl | head -20
```

## 11.15 新增文件

| 文件 | 说明 |
|------|------|
| `src/store/types.ts` | Store 类型定义（Slices、State、Actions） |
| `src/store/vanilla.ts` | Vanilla Store 实例和访问器 |
| `src/store/selectors.ts` | React Hooks 和选择器 |
| `src/store/slices/*.ts` | 5 个 Slice 实现 |
| `src/store/test.ts` | Store 测试脚本 |
| `src/ui/components/ClawdInterface.tsx` | 新主界面组件（集成 ContextManager） |
| `src/ui/components/common/ExitMessage.tsx` | 退出提示组件 |

## 11.16 技术亮点

1. **双文件配置架构**
   - `config.json`：基础配置（API、UI），含敏感信息
   - `settings.json`：行为配置（权限、Hooks），可提交

2. **Zustand Vanilla Store**
   - 支持 React 和非 React 环境
   - 单一数据源（SSOT）
   - 选择器优化重渲染

3. **ContextManager 集成**
   - 会话自动持久化（JSONL 格式）
   - Token 计数与自动压缩
   - `--continue` / `--resume` 会话恢复

4. **三层存储架构**
   - MemoryStore：内存快速访问
   - PersistentStore：JSONL 持久化
   - CacheStore：LRU 缓存

5. **优雅退出体验**
   - 状态栏显示完整 Session ID
   - 退出时在状态栏下方追加显示 `ExitMessage`
   - `useCtrlCHandler` 支持 `onBeforeExit` 回调（返回 `true` 阻止默认退出）
   - 双重退出保障：`exit()` + `process.exit(0)`

## 11.17 TODO

以下功能待后续章节实现：

- [ ] `HookConfig` 类型定义和 Hooks 系统（第 12 章）
- [ ] Slash Commands 集成到 Store（第 12 章）
- [ ] `/compact` 手动压缩命令（第 12 章）
- [ ] 完整的 ConfigService 持久化实现（可选优化）
