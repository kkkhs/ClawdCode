# 第十一章：状态管理与完整集成

> **学习目标**：使用 Zustand 构建全局状态管理、实现双文件配置架构、完成 Agent/ContextManager/UI 的完整集成
> 
> **预计阅读时间**：60 分钟
> 
> **实践时间**：80 分钟
> 
> **前置要求**：已完成第十章的代码实现

---

## 11.1 为什么需要全局状态管理

### 11.1.1 问题分析

在前面的章节中，我们已经实现了：
- Agent 核心（第 4 章）
- 上下文管理 ContextManager（第 8 章）
- UI 系统（第 9 章）
- MCP 协议（第 10 章）

但这些模块之间的状态是分散的：

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│  Agent   │     │ Context  │     │    UI    │
│  (ref)   │     │ Manager  │     │ (state)  │
└──────────┘     └──────────┘     └──────────┘
     │                │                │
     └────────────────┴────────────────┘
              状态不一致
```

问题：
1. **UI 状态与业务状态分离** - React 状态和 Agent 状态各自管理
2. **跨组件通信困难** - 需要层层传递 props
3. **非 React 环境无法访问** - Agent 想读取配置需要依赖 React

### 11.1.2 解决方案：Zustand

Zustand 是一个轻量级状态管理库，特点：

| 特性 | 说明 |
|------|------|
| **Vanilla Store** | 可以在非 React 环境使用 |
| **React 集成** | 自动重渲染，性能优化 |
| **中间件支持** | devtools、subscribeWithSelector |
| **轻量** | 约 1KB，无依赖 |

### 11.1.3 SSOT 架构

**SSOT**（Single Source of Truth）- 单一数据源：

```
┌─────────────────────────────────────────────┐
│               Zustand Store                  │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │ session │ │ config  │ │   app   │ ...   │
│  └─────────┘ └─────────┘ └─────────┘       │
└─────────────────────────────────────────────┘
         │              │              │
         ▼              ▼              ▼
    ┌────────┐    ┌────────┐    ┌────────┐
    │ Agent  │    │  MCP   │    │   UI   │
    └────────┘    └────────┘    └────────┘
```

### 11.1.4 目录结构

```
src/store/
├── types.ts            # Store 类型定义
├── vanilla.ts          # Vanilla Store 实例 + 便捷访问器
├── selectors.ts        # React 选择器（优化渲染）
├── slices/
│   ├── sessionSlice.ts # 会话状态
│   ├── configSlice.ts  # 配置状态
│   ├── appSlice.ts     # 应用状态
│   ├── focusSlice.ts   # 焦点状态
│   ├── commandSlice.ts # 命令队列状态
│   └── index.ts
└── index.ts            # 模块导出
```

---

## 11.2 Store 类型定义

### 11.2.1 会话状态类型

**文件位置**：`src/store/types.ts`

```typescript
/**
 * Zustand Store 类型定义
 */

import type { RuntimeConfig } from '../config/types.js';

// ========== 会话状态 ==========

/**
 * Token 使用量
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  maxContextTokens: number;
}

/**
 * 会话消息（UI 显示用）
 */
export interface SessionMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  toolCalls?: unknown[];
  toolCallId?: string;
}

/**
 * 会话状态
 */
export interface SessionState {
  sessionId: string;
  messages: SessionMessage[];
  isThinking: boolean;       // Agent 正在思考
  isCompacting: boolean;     // 正在压缩上下文
  currentCommand: string | null;
  error: string | null;
  isActive: boolean;
  tokenUsage: TokenUsage;
}

/**
 * 会话 Actions
 */
export interface SessionActions {
  addMessage: (message: SessionMessage) => void;
  addUserMessage: (content: string) => void;
  addAssistantMessage: (content: string) => void;
  setThinking: (isThinking: boolean) => void;
  setCompacting: (isCompacting: boolean) => void;
  setCurrentCommand: (command: string | null) => void;
  setError: (error: string | null) => void;
  setSessionId: (sessionId: string) => void;
  restoreSession: (sessionId: string, messages: SessionMessage[]) => void;
  updateTokenUsage: (usage: Partial<TokenUsage>) => void;
  clearMessages: () => void;
  resetSession: () => void;
}

/**
 * 会话 Slice（State + Actions）
 */
export interface SessionSlice extends SessionState {
  actions: SessionActions;
}
```

### 11.2.2 配置状态类型

```typescript
// ========== 配置状态 ==========

/**
 * 配置状态
 */
export interface ConfigState {
  config: RuntimeConfig | null;  // null 表示未初始化
}

/**
 * 配置 Actions
 */
export interface ConfigActions {
  setConfig: (config: RuntimeConfig) => void;
  updateConfig: (partial: Partial<RuntimeConfig>) => void;
}

export interface ConfigSlice extends ConfigState {
  actions: ConfigActions;
}
```

### 11.2.3 应用状态类型

```typescript
// ========== 应用状态 ==========

/**
 * 初始化状态枚举
 */
export type InitializationStatus = 'pending' | 'loading' | 'ready' | 'error' | 'needsSetup';

/**
 * 活动模态框类型
 */
export type ActiveModal = 'none' | 'shortcuts' | 'settings' | 'confirmation' | 'update' | 'themeSelector';

/**
 * Todo 项
 */
export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
}

/**
 * 应用状态
 */
export interface AppState {
  initializationStatus: InitializationStatus;
  initializationError: string | null;
  activeModal: ActiveModal;
  todos: TodoItem[];
  awaitingSecondCtrlC: boolean;
}

export interface AppActions {
  setInitializationStatus: (status: InitializationStatus) => void;
  setInitializationError: (error: string | null) => void;
  setActiveModal: (modal: ActiveModal) => void;
  setTodos: (todos: TodoItem[]) => void;
  addTodo: (todo: TodoItem) => void;
  updateTodo: (id: string, updates: Partial<TodoItem>) => void;
  removeTodo: (id: string) => void;
  setAwaitingSecondCtrlC: (awaiting: boolean) => void;
}

export interface AppSlice extends AppState {
  actions: AppActions;
}
```

### 11.2.4 焦点状态类型

```typescript
// ========== 焦点状态 ==========

/**
 * 焦点 ID 类型
 */
export type FocusId = 'input' | 'messages' | 'confirmation' | 'modal' | 'none' | 'theme-selector';

/** FocusId 常量枚举（便于使用） */
export const FocusId = {
  MAIN_INPUT: 'input' as FocusId,
  MESSAGES: 'messages' as FocusId,
  CONFIRMATION_PROMPT: 'confirmation' as FocusId,
  THEME_SELECTOR: 'theme-selector' as FocusId,
  MODAL: 'modal' as FocusId,
  NONE: 'none' as FocusId,
} as const;

export interface FocusState {
  currentFocus: FocusId;
  previousFocus: FocusId | null;
}

export interface FocusActions {
  setFocus: (focus: FocusId) => void;
  restoreFocus: () => void;     // 恢复到上一个焦点
  pushFocus: (focus: FocusId) => void;  // 保存当前焦点并切换
}

export interface FocusSlice extends FocusState {
  actions: FocusActions;
}
```

### 11.2.5 命令状态类型

```typescript
// ========== 命令状态 ==========

export interface CommandState {
  isProcessing: boolean;
  abortController: AbortController | null;
  pendingCommands: string[];  // 命令队列
}

export interface CommandActions {
  setProcessing: (isProcessing: boolean) => void;
  createAbortController: () => AbortController;
  abort: () => void;
  enqueueCommand: (command: string) => void;
  dequeueCommand: () => string | undefined;
  clearQueue: () => void;
}

export interface CommandSlice extends CommandState {
  actions: CommandActions;
}
```

### 11.2.6 完整 Store 类型

```typescript
// ========== 完整 Store ==========

/**
 * 完整的 ClawdCode Store
 * 
 * 使用 Slice 模式组织，每个 Slice 独立管理一块状态
 */
export interface ClawdStore {
  session: SessionSlice;
  config: ConfigSlice;
  app: AppSlice;
  focus: FocusSlice;
  command: CommandSlice;
}
```

---

## 11.3 Slice 实现

### 11.3.1 Session Slice

**文件位置**：`src/store/slices/sessionSlice.ts`

```typescript
/**
 * Session Slice - 会话状态管理
 */

import type { StateCreator } from 'zustand';
import type { ClawdStore, SessionSlice, SessionMessage, TokenUsage } from '../types.js';

// 生成唯一 ID
const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

// 初始状态
const initialSessionState = {
  sessionId: generateId(),
  messages: [] as SessionMessage[],
  isThinking: false,
  isCompacting: false,
  currentCommand: null as string | null,
  error: null as string | null,
  isActive: true,
  tokenUsage: {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    maxContextTokens: 200000,
  } as TokenUsage,
};

/**
 * 创建 Session Slice
 * 
 * StateCreator 类型参数：
 * - ClawdStore: 完整 Store 类型
 * - []: 没有额外中间件
 * - []: 没有额外中间件
 * - SessionSlice: 本 Slice 的类型
 */
export const createSessionSlice: StateCreator<
  ClawdStore,
  [],
  [],
  SessionSlice
> = (set, get) => ({
  ...initialSessionState,

  actions: {
    /**
     * 添加消息
     */
    addMessage: (message: SessionMessage) => {
      set((state) => ({
        session: {
          ...state.session,
          messages: [...state.session.messages, message],
          error: null,
        },
      }));
    },

    /**
     * 添加用户消息（便捷方法）
     */
    addUserMessage: (content: string) => {
      const message: SessionMessage = {
        id: `user-${generateId()}`,
        role: 'user',
        content,
        timestamp: Date.now(),
      };
      get().session.actions.addMessage(message);
    },

    /**
     * 添加助手消息（便捷方法）
     */
    addAssistantMessage: (content: string) => {
      const message: SessionMessage = {
        id: `assistant-${generateId()}`,
        role: 'assistant',
        content,
        timestamp: Date.now(),
      };
      get().session.actions.addMessage(message);
    },

    /**
     * 设置思考状态
     */
    setThinking: (isThinking: boolean) => {
      set((state) => ({
        session: { ...state.session, isThinking },
      }));
    },

    /**
     * 设置压缩状态
     */
    setCompacting: (isCompacting: boolean) => {
      set((state) => ({
        session: { ...state.session, isCompacting },
      }));
    },

    /**
     * 设置当前命令
     */
    setCurrentCommand: (command: string | null) => {
      set((state) => ({
        session: { ...state.session, currentCommand: command },
      }));
    },

    /**
     * 设置错误
     */
    setError: (error: string | null) => {
      set((state) => ({
        session: { ...state.session, error },
      }));
    },

    /**
     * 设置会话 ID
     */
    setSessionId: (sessionId: string) => {
      set((state) => ({
        session: {
          ...state.session,
          sessionId,
        },
      }));
    },

    /**
     * 恢复会话（从持久化存储）
     */
    restoreSession: (sessionId: string, messages: SessionMessage[]) => {
      set((state) => ({
        session: {
          ...state.session,
          sessionId,
          messages,
          error: null,
          isActive: true,
        },
      }));
    },

    /**
     * 更新 Token 使用量
     */
    updateTokenUsage: (usage: Partial<TokenUsage>) => {
      set((state) => ({
        session: {
          ...state.session,
          tokenUsage: { ...state.session.tokenUsage, ...usage },
        },
      }));
    },

    /**
     * 清空消息
     */
    clearMessages: () => {
      set((state) => ({
        session: {
          ...state.session,
          messages: [],
          error: null,
        },
      }));
    },

    /**
     * 重置会话
     */
    resetSession: () => {
      set((state) => ({
        session: {
          ...state.session,
          ...initialSessionState,
          sessionId: generateId(),
        },
      }));
    },
  },
});
```

### 11.3.2 Config Slice

**文件位置**：`src/store/slices/configSlice.ts`

```typescript
/**
 * Config Slice - 配置状态管理
 */

import type { StateCreator } from 'zustand';
import type { ClawdStore, ConfigSlice } from '../types.js';
import type { RuntimeConfig } from '../../config/types.js';

export const createConfigSlice: StateCreator<
  ClawdStore,
  [],
  [],
  ConfigSlice
> = (set) => ({
  config: null,  // 初始为 null，表示未加载

  actions: {
    /**
     * 设置完整配置
     */
    setConfig: (config: RuntimeConfig) => {
      set((state) => ({
        config: { ...state.config, config },
      }));
    },

    /**
     * 更新部分配置（仅内存，不持久化）
     */
    updateConfig: (partial: Partial<RuntimeConfig>) => {
      set((state) => {
        if (!state.config.config) {
          console.warn('[ConfigSlice] Config not initialized, cannot update');
          return state;
        }

        return {
          config: {
            ...state.config,
            config: { ...state.config.config, ...partial },
          },
        };
      });
    },
  },
});
```

### 11.3.3 App Slice

**文件位置**：`src/store/slices/appSlice.ts`

```typescript
/**
 * App Slice - 应用状态管理
 */

import type { StateCreator } from 'zustand';
import type { ClawdStore, AppSlice, InitializationStatus, ActiveModal, TodoItem } from '../types.js';

const initialAppState = {
  initializationStatus: 'pending' as InitializationStatus,
  initializationError: null as string | null,
  activeModal: 'none' as ActiveModal,
  todos: [] as TodoItem[],
  awaitingSecondCtrlC: false,
};

export const createAppSlice: StateCreator<
  ClawdStore,
  [],
  [],
  AppSlice
> = (set, get) => ({
  ...initialAppState,

  actions: {
    /**
     * 设置初始化状态
     */
    setInitializationStatus: (status: InitializationStatus) => {
      set((state) => ({
        app: { ...state.app, initializationStatus: status },
      }));
    },

    /**
     * 设置初始化错误
     */
    setInitializationError: (error: string | null) => {
      set((state) => ({
        app: {
          ...state.app,
          initializationError: error,
          initializationStatus: error ? 'error' : state.app.initializationStatus,
        },
      }));
    },

    /**
     * 设置当前活动模态框
     */
    setActiveModal: (modal: ActiveModal) => {
      set((state) => ({
        app: { ...state.app, activeModal: modal },
      }));
    },

    /**
     * 设置 Todos
     */
    setTodos: (todos: TodoItem[]) => {
      set((state) => ({
        app: { ...state.app, todos },
      }));
    },

    /**
     * 添加 Todo
     */
    addTodo: (todo: TodoItem) => {
      set((state) => ({
        app: {
          ...state.app,
          todos: [...state.app.todos, todo],
        },
      }));
    },

    /**
     * 更新 Todo
     */
    updateTodo: (id: string, updates: Partial<TodoItem>) => {
      set((state) => ({
        app: {
          ...state.app,
          todos: state.app.todos.map((todo) =>
            todo.id === id ? { ...todo, ...updates } : todo
          ),
        },
      }));
    },

    /**
     * 删除 Todo
     */
    removeTodo: (id: string) => {
      set((state) => ({
        app: {
          ...state.app,
          todos: state.app.todos.filter((todo) => todo.id !== id),
        },
      }));
    },

    /**
     * 设置是否等待第二次 Ctrl+C
     */
    setAwaitingSecondCtrlC: (awaiting: boolean) => {
      set((state) => ({
        app: { ...state.app, awaitingSecondCtrlC: awaiting },
      }));
    },
  },
});
```

### 11.3.4 Focus Slice

**文件位置**：`src/store/slices/focusSlice.ts`

```typescript
/**
 * Focus Slice - 焦点状态管理
 * 
 * 管理 UI 中哪个元素当前拥有键盘焦点
 */

import type { StateCreator } from 'zustand';
import type { ClawdStore, FocusSlice, FocusId } from '../types.js';

const initialFocusState = {
  currentFocus: 'input' as FocusId,
  previousFocus: null as FocusId | null,
};

export const createFocusSlice: StateCreator<
  ClawdStore,
  [],
  [],
  FocusSlice
> = (set, get) => ({
  ...initialFocusState,

  actions: {
    /**
     * 设置焦点
     */
    setFocus: (focus: FocusId) => {
      set((state) => ({
        focus: {
          ...state.focus,
          previousFocus: state.focus.currentFocus,
          currentFocus: focus,
        },
      }));
    },

    /**
     * 恢复到上一个焦点
     */
    restoreFocus: () => {
      const { previousFocus } = get().focus;
      if (previousFocus) {
        set((state) => ({
          focus: {
            ...state.focus,
            currentFocus: previousFocus,
            previousFocus: null,
          },
        }));
      }
    },

    /**
     * 推入焦点（保存当前焦点）
     */
    pushFocus: (focus: FocusId) => {
      set((state) => ({
        focus: {
          ...state.focus,
          previousFocus: state.focus.currentFocus,
          currentFocus: focus,
        },
      }));
    },
  },
});
```

### 11.3.5 Command Slice

**文件位置**：`src/store/slices/commandSlice.ts`

```typescript
/**
 * Command Slice - 命令状态管理
 * 
 * 管理命令执行状态和中止机制
 */

import type { StateCreator } from 'zustand';
import type { ClawdStore, CommandSlice } from '../types.js';

const initialCommandState = {
  isProcessing: false,
  abortController: null as AbortController | null,
  pendingCommands: [] as string[],
};

export const createCommandSlice: StateCreator<
  ClawdStore,
  [],
  [],
  CommandSlice
> = (set, get) => ({
  ...initialCommandState,

  actions: {
    /**
     * 设置处理状态
     */
    setProcessing: (isProcessing: boolean) => {
      set((state) => ({
        command: { ...state.command, isProcessing },
      }));
    },

    /**
     * 创建 AbortController
     */
    createAbortController: () => {
      const controller = new AbortController();
      set((state) => ({
        command: { ...state.command, abortController: controller },
      }));
      return controller;
    },

    /**
     * 中止当前任务
     * 
     * 注意：这是跨 Slice 操作的例子
     * - 发送 abort signal
     * - 重置 isProcessing
     * - 重置 session 的 isThinking（跨 slice）
     * - 清空待处理队列
     */
    abort: () => {
      const { abortController } = get().command;

      if (abortController && !abortController.signal.aborted) {
        abortController.abort();
      }

      // 【重要】跨 Slice 调用：重置 session 的 isThinking 状态
      get().session.actions.setThinking(false);

      // 重置 command 状态并清空队列
      set((state) => ({
        command: {
          ...state.command,
          isProcessing: false,
          abortController: null,
          pendingCommands: [],
        },
      }));
    },

    /**
     * 将命令加入待处理队列
     */
    enqueueCommand: (command: string) => {
      set((state) => ({
        command: {
          ...state.command,
          pendingCommands: [...state.command.pendingCommands, command],
        },
      }));
    },

    /**
     * 从队列取出下一个命令
     */
    dequeueCommand: () => {
      const { pendingCommands } = get().command;
      if (pendingCommands.length === 0) {
        return undefined;
      }

      const [nextCommand, ...rest] = pendingCommands;
      set((state) => ({
        command: {
          ...state.command,
          pendingCommands: rest,
        },
      }));

      return nextCommand;
    },

    /**
     * 清空待处理队列
     */
    clearQueue: () => {
      set((state) => ({
        command: {
          ...state.command,
          pendingCommands: [],
        },
      }));
    },
  },
});
```

### 11.3.6 Slices 导出

**文件位置**：`src/store/slices/index.ts`

```typescript
/**
 * Store Slices 导出
 */

export { createSessionSlice } from './sessionSlice.js';
export { createConfigSlice } from './configSlice.js';
export { createAppSlice } from './appSlice.js';
export { createFocusSlice } from './focusSlice.js';
export { createCommandSlice } from './commandSlice.js';
```

---

## 11.4 Vanilla Store

### 11.4.1 创建 Store 实例

**文件位置**：`src/store/vanilla.ts`

```typescript
/**
 * Zustand Vanilla Store
 * 
 * 核心 Store 实例，支持 React 和非 React 环境访问
 */

import { createStore } from 'zustand/vanilla';
import { devtools, subscribeWithSelector } from 'zustand/middleware';

import type { ClawdStore } from './types.js';
import type { RuntimeConfig } from '../config/types.js';
import {
  createSessionSlice,
  createConfigSlice,
  createAppSlice,
  createFocusSlice,
  createCommandSlice,
} from './slices/index.js';

/**
 * 核心 Vanilla Store 实例
 *
 * 中间件栈：
 * - devtools: 开发工具支持（Redux DevTools）
 * - subscribeWithSelector: 支持选择器订阅
 */
export const vanillaStore = createStore<ClawdStore>()(
  devtools(
    subscribeWithSelector((...a) => ({
      session: createSessionSlice(...a),
      config: createConfigSlice(...a),
      app: createAppSlice(...a),
      focus: createFocusSlice(...a),
      command: createCommandSlice(...a),
    })),
    {
      name: 'ClawdStore',
      enabled: process.env.NODE_ENV === 'development',
    }
  )
);
```

### 11.4.2 便捷访问器

```typescript
// ========== 便捷访问器 ==========

/**
 * 获取当前状态
 */
export const getState = () => vanillaStore.getState();

/**
 * 订阅状态变化
 */
export const subscribe = vanillaStore.subscribe;

// ========== Actions 快捷访问 ==========

/**
 * 这些函数让非 React 代码可以方便地访问 Actions
 * 
 * 使用方式：
 *   import { sessionActions } from '../store/index.js';
 *   sessionActions().setThinking(true);
 */
export const sessionActions = () => getState().session.actions;
export const configActions = () => getState().config.actions;
export const appActions = () => getState().app.actions;
export const focusActions = () => getState().focus.actions;
export const commandActions = () => getState().command.actions;
```

### 11.4.3 配置便捷访问

```typescript
// ========== 配置便捷访问 ==========

/**
 * 获取当前配置
 */
export const getConfig = (): RuntimeConfig | null => getState().config.config;

/**
 * 获取当前模型配置
 * 
 * 优先级：
 * 1. currentModelId 指定的模型
 * 2. models[0] 第一个模型
 * 3. default 默认配置
 */
export const getCurrentModel = () => {
  const config = getConfig();
  if (!config) return undefined;

  // 优先使用 currentModelId
  if (config.currentModelId && config.models) {
    const model = config.models.find((m) => m.id === config.currentModelId);
    if (model) return model;
  }

  // 回退到 models[0]
  if (config.models && config.models.length > 0) {
    return config.models[0];
  }

  // 回退到 default
  return config.default;
};

/**
 * 获取权限模式
 */
export const getPermissionMode = () => {
  const config = getConfig();
  return config?.defaultPermissionMode || 'default';
};
```

### 11.4.4 初始化机制

```typescript
// ========== 初始化机制 ==========

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
  const config = getConfig();
  if (config !== null) {
    return;
  }

  // 2. 并发保护：等待共享 Promise
  if (initializationPromise) {
    return initializationPromise;
  }

  // 3. 开始初始化
  initializationPromise = (async () => {
    try {
      // 动态导入避免循环依赖
      const { ConfigManager } = await import('../config/ConfigManager.js');
      const configManager = ConfigManager.getInstance();
      const loadedConfig = await configManager.initialize();
      getState().config.actions.setConfig(loadedConfig as RuntimeConfig);
    } catch (error) {
      initializationPromise = null; // 允许重试
      throw new Error(
        `❌ Store 初始化失败\n\n` +
          `原因: ${error instanceof Error ? error.message : '未知错误'}`
      );
    } finally {
      initializationPromise = null;
    }
  })();

  return initializationPromise;
}
```

### 11.4.5 订阅工具

```typescript
// ========== 订阅工具 ==========

/**
 * 订阅特定状态变化
 */
export function subscribeToState<T>(
  selector: (state: ClawdStore) => T,
  callback: (value: T, prevValue: T) => void
): () => void {
  return vanillaStore.subscribe((state, prevState) => {
    const value = selector(state);
    const prevValue = selector(prevState);
    if (value !== prevValue) {
      callback(value, prevValue);
    }
  });
}

/**
 * 订阅 Todos 变化
 */
export function subscribeToTodos(
  callback: (todos: ClawdStore['app']['todos']) => void
): () => void {
  return subscribeToState((state) => state.app.todos, callback);
}

/**
 * 订阅消息变化
 */
export function subscribeToMessages(
  callback: (messages: ClawdStore['session']['messages']) => void
): () => void {
  return subscribeToState((state) => state.session.messages, callback);
}
```

---

## 11.5 React 选择器

### 11.5.1 基础 Hook

**文件位置**：`src/store/selectors.ts`

```typescript
/**
 * Store 选择器
 * 
 * 提供细粒度的状态访问，优化 React 渲染性能
 */

import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { vanillaStore } from './vanilla.js';
import type { ClawdStore, SessionMessage, TodoItem, FocusId } from './types.js';
import type { ModelConfig, PermissionMode } from '../config/types.js';

// ========== 基础 Hook ==========

/**
 * React Hook - 订阅 Clawd Store
 */
export function useClawdStore<T>(selector: (state: ClawdStore) => T): T {
  return useStore(vanillaStore, selector);
}
```

### 11.5.2 Session 选择器

```typescript
// ========== Session 选择器 ==========

export const useSessionId = () =>
  useClawdStore((state) => state.session.sessionId);

export const useMessages = () =>
  useClawdStore((state) => state.session.messages);

export const useIsThinking = () =>
  useClawdStore((state) => state.session.isThinking);

export const useIsCompacting = () =>
  useClawdStore((state) => state.session.isCompacting);

export const useSessionError = () =>
  useClawdStore((state) => state.session.error);

export const useCurrentCommand = () =>
  useClawdStore((state) => state.session.currentCommand);

export const useTokenUsage = () =>
  useClawdStore((state) => state.session.tokenUsage);
```

### 11.5.3 Config 选择器

```typescript
// ========== Config 选择器 ==========

export const useConfig = () =>
  useClawdStore((state) => state.config.config);

export const useTheme = () =>
  useClawdStore((state) => state.config.config?.theme || 'dark');

export const usePermissionMode = () =>
  useClawdStore(
    (state) => (state.config.config?.defaultPermissionMode || 'default') as PermissionMode
  );

// 常量空引用，避免重渲染
const EMPTY_MODELS: ModelConfig[] = [];

export const useAllModels = () =>
  useClawdStore(
    (state) => state.config.config?.models ?? EMPTY_MODELS
  );

/**
 * 获取当前模型
 */
export const useCurrentModel = () =>
  useClawdStore((state) => {
    const config = state.config.config;
    if (!config) return undefined;

    // 优先使用 currentModelId
    if (config.currentModelId && config.models) {
      const model = config.models.find((m) => m.id === config.currentModelId);
      if (model) return model;
    }

    // 回退到 models[0]
    if (config.models && config.models.length > 0) {
      return config.models[0];
    }

    // 回退到 default
    return config.default;
  });
```

### 11.5.4 派生选择器

```typescript
// ========== 派生选择器 ==========

/**
 * 计算上下文剩余百分比
 */
export const useContextRemaining = () =>
  useClawdStore((state) => {
    const { inputTokens, maxContextTokens } = state.session.tokenUsage;
    if (maxContextTokens <= 0) return 100;
    return Math.round(Math.max(0, 100 - (inputTokens / maxContextTokens) * 100));
  });

/**
 * 判断输入是否禁用
 */
export const useIsInputDisabled = () =>
  useClawdStore((state) => {
    const isThinking = state.session.isThinking;
    const isReady = state.app.initializationStatus === 'ready';
    const hasModal =
      state.app.activeModal !== 'none' &&
      state.app.activeModal !== 'shortcuts';
    return isThinking || !isReady || hasModal;
  });

/**
 * 判断是否忙碌
 */
export const useIsBusy = () =>
  useClawdStore(
    (state) => state.session.isThinking || state.command.isProcessing
  );

/**
 * 获取 Todo 统计
 */
export const useTodoStats = () =>
  useClawdStore(
    useShallow((state) => {
      const todos = state.app.todos;
      return {
        total: todos.length,
        completed: todos.filter((t) => t.status === 'completed').length,
        inProgress: todos.filter((t) => t.status === 'in_progress').length,
        pending: todos.filter((t) => t.status === 'pending').length,
      };
    })
  );
```

### 11.5.5 组合选择器

```typescript
// ========== 组合选择器（使用 useShallow）==========

/**
 * 会话状态组合
 * 
 * 使用 useShallow 进行浅比较，避免不必要的重渲染
 */
export const useSessionState = () =>
  useClawdStore(
    useShallow((state) => ({
      sessionId: state.session.sessionId,
      messages: state.session.messages,
      isThinking: state.session.isThinking,
      currentCommand: state.session.currentCommand,
      error: state.session.error,
    }))
  );

/**
 * 应用状态组合
 */
export const useAppState = () =>
  useClawdStore(
    useShallow((state) => ({
      initializationStatus: state.app.initializationStatus,
      initializationError: state.app.initializationError,
      activeModal: state.app.activeModal,
    }))
  );
```

---

## 11.6 配置系统增强

### 11.6.1 RuntimeConfig 类型

**文件位置**：`src/config/types.ts`（扩展部分）

```typescript
/**
 * 运行时配置 Schema
 * 继承 ClawdConfig + CLI 临时字段
 */
export const RuntimeConfigSchema = ClawdConfigSchema.extend({
  // 系统提示
  systemPrompt: z.string().optional(),
  appendSystemPrompt: z.string().optional(),
  
  // 会话管理
  initialMessage: z.string().optional(),
  resumeSessionId: z.string().optional(),
  forkSession: z.boolean().optional(),
  
  // 工具过滤（CLI 临时）
  allowedTools: z.array(z.string()).optional(),
  disallowedTools: z.array(z.string()).optional(),
  
  // MCP（CLI 临时）
  mcpConfigPaths: z.array(z.string()).optional(),
  strictMcpConfig: z.boolean().optional(),
  
  // 其他
  fallbackModel: z.string().optional(),
  addDirs: z.array(z.string()).optional(),
  outputFormat: z.enum(['text', 'json', 'stream-json']).optional(),
  print: z.boolean().optional(),
});

export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;
```

### 11.6.2 字段路由表

```typescript
// ========== 字段路由表 ==========

export type MergeStrategy = 'replace' | 'append-dedupe' | 'deep-merge';
export type ConfigTarget = 'config' | 'settings';
export type ConfigScope = 'local' | 'project' | 'global';

export interface FieldRouting {
  target: ConfigTarget;          // 存储到哪个文件
  defaultScope: ConfigScope;     // 默认作用域
  mergeStrategy: MergeStrategy;  // 合并策略
  persistable: boolean;          // 是否持久化
}

/**
 * 字段路由表 - 定义每个字段的持久化行为
 * 
 * 设计目的：
 * - 分离「身份配置」和「行为配置」
 * - 支持不同的合并策略
 * - 区分持久化和临时配置
 */
export const FIELD_ROUTING_TABLE: Record<string, FieldRouting> = {
  // config.json 字段（身份配置）
  models: { target: 'config', defaultScope: 'global', mergeStrategy: 'replace', persistable: true },
  currentModelId: { target: 'config', defaultScope: 'global', mergeStrategy: 'replace', persistable: true },
  theme: { target: 'config', defaultScope: 'global', mergeStrategy: 'replace', persistable: true },
  language: { target: 'config', defaultScope: 'global', mergeStrategy: 'replace', persistable: true },
  mcpServers: { target: 'config', defaultScope: 'global', mergeStrategy: 'deep-merge', persistable: true },
  mcpEnabled: { target: 'config', defaultScope: 'global', mergeStrategy: 'replace', persistable: true },
  
  // settings.json 字段（行为配置）
  permissions: { target: 'settings', defaultScope: 'local', mergeStrategy: 'replace', persistable: true },
  defaultPermissionMode: { target: 'settings', defaultScope: 'local', mergeStrategy: 'replace', persistable: true },
  hooks: { target: 'settings', defaultScope: 'local', mergeStrategy: 'deep-merge', persistable: true },
  env: { target: 'settings', defaultScope: 'local', mergeStrategy: 'deep-merge', persistable: true },
  
  // 非持久化字段（CLI 临时参数）
  systemPrompt: { target: 'settings', defaultScope: 'local', mergeStrategy: 'replace', persistable: false },
  appendSystemPrompt: { target: 'settings', defaultScope: 'local', mergeStrategy: 'replace', persistable: false },
  initialMessage: { target: 'settings', defaultScope: 'local', mergeStrategy: 'replace', persistable: false },
  resumeSessionId: { target: 'settings', defaultScope: 'local', mergeStrategy: 'replace', persistable: false },
};
```

### 11.6.3 默认权限规则

```typescript
/**
 * 默认权限规则
 */
export const DEFAULT_PERMISSIONS: PermissionConfig = {
  allow: [
    // 安全的系统信息命令
    'Bash(pwd)',
    'Bash(whoami)',
    'Bash(hostname)',
    'Bash(uname *)',
    'Bash(date)',
    'Bash(echo *)',
    // 目录列表
    'Bash(ls *)',
    'Bash(tree *)',
    // Git 只读命令
    'Bash(git status)',
    'Bash(git log *)',
    'Bash(git diff *)',
    'Bash(git branch *)',
    // 包管理器只读命令
    'Bash(npm list *)',
    'Bash(npm view *)',
    'Bash(bun *)',
  ],
  ask: [
    // 高风险命令（需要确认）
    'Bash(curl *)',
    'Bash(wget *)',
    'Bash(rm -rf *)',
    'Bash(rm -r *)',
  ],
  deny: [
    // 敏感文件
    'Read(./.env)',
    'Read(./.env.*)',
    // 危险命令
    'Bash(rm -rf /)',
    'Bash(sudo *)',
    'Bash(chmod 777 *)',
    // Shell 嵌套
    'Bash(bash *)',
    'Bash(sh *)',
    'Bash(eval *)',
  ],
};
```

---

## 11.7 App.tsx 与 Store 集成

### 11.7.1 合并 CLI 参数到配置

**文件位置**：`src/ui/App.tsx`

```typescript
/**
 * 合并 CLI 参数到基础配置，生成 RuntimeConfig
 * 
 * CLI 参数优先级最高，会覆盖配置文件中的值
 */
function mergeRuntimeConfig(baseConfig: ClawdConfig, props: AppProps): RuntimeConfig {
  const runtimeConfig: RuntimeConfig = {
    ...baseConfig,
  };

  // 合并 CLI 参数
  if (props.initialMessage) {
    runtimeConfig.initialMessage = props.initialMessage;
  }

  if (props.resumeSessionId) {
    runtimeConfig.resumeSessionId = props.resumeSessionId;
  }

  if (props.permissionMode) {
    runtimeConfig.defaultPermissionMode = props.permissionMode;
  }

  // 如果 CLI 传入了 model，更新 currentModelId
  if (props.model) {
    runtimeConfig.currentModelId = props.model;
  }

  return runtimeConfig;
}
```

### 11.7.2 初始化 Store 状态

```typescript
/**
 * 初始化 Store 状态
 * 
 * 1. 设置配置到 Store
 * 2. 检查是否需要设置向导
 * 3. 设置初始化状态
 */
function initializeStoreState(config: RuntimeConfig): void {
  // 设置配置
  configActions().setConfig(config);

  // 检查是否需要设置向导
  // 支持两种配置方式：default（单模型）或 models（多模型）
  const hasDefaultConfig = config.default?.apiKey;
  const hasModelsConfig = config.models && config.models.length > 0;
  
  if (!hasDefaultConfig && !hasModelsConfig) {
    appActions().setInitializationStatus('needsSetup');
  } else {
    appActions().setInitializationStatus('ready');
  }
}
```

### 11.7.3 AppWrapper 组件

```typescript
/**
 * AppWrapper - 处理版本检查和初始化流程
 * 
 * 流程：
 * 1. 初始化 Zustand Store（加载配置文件）
 * 2. 合并 CLI 参数生成 RuntimeConfig
 * 3. 初始化 Store 状态
 * 4. 等待版本检查
 * 5. 显示主界面
 */
const AppWrapper: React.FC<AppProps> = (props) => {
  const { versionCheckPromise, permissionMode, ...mainProps } = props;
  
  // 使用 Store 状态
  const initializationStatus = useInitializationStatus();
  
  const [versionInfo, setVersionInfo] = useState<VersionCheckResult | null>(null);
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);

  // 初始化应用（包括 Store）
  const initializeApp = useCallback(async () => {
    if (props.debug) {
      console.log('[DEBUG] Initializing application and Store...');
    }
    
    try {
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
      const savedTheme = mergedConfig.theme;
      if (savedTheme && themeManager.hasTheme(savedTheme)) {
        themeManager.setTheme(savedTheme);
      }
      
      if (props.debug) {
        console.log('[DEBUG] Store initialized successfully');
      }
    } catch (error) {
      appActions().setInitializationError(
        error instanceof Error ? error.message : 'Unknown initialization error'
      );
    }
  }, [props]);

  // 启动流程
  useEffect(() => {
    const initialize = async () => {
      // 1. 等待版本检查完成
      if (versionCheckPromise) {
        try {
          const versionResult = await versionCheckPromise;
          if (versionResult && versionResult.shouldPrompt) {
            setVersionInfo(versionResult);
            setShowUpdatePrompt(true);
            return;
          }
        } catch {
          // 版本检查失败，继续启动
        }
      }

      // 2. 无需更新，初始化应用
      await initializeApp();
    };

    initialize();
  }, [versionCheckPromise, initializeApp]);

  // 根据状态渲染不同内容
  if (showUpdatePrompt && versionInfo) {
    return (
      <UpdatePrompt
        versionInfo={versionInfo}
        onComplete={async () => {
          setShowUpdatePrompt(false);
          await initializeApp();
        }}
      />
    );
  }

  if (initializationStatus === 'pending' || initializationStatus === 'loading') {
    return (
      <Box padding={1}>
        <Text color="yellow"><Spinner type="dots" /></Text>
        <Text color="yellow"> Starting ClawdCode...</Text>
      </Box>
    );
  }

  if (initializationStatus === 'error') {
    return (
      <Box padding={1} flexDirection="column">
        <Text color="red">❌ Initialization failed</Text>
      </Box>
    );
  }

  // 【关键】显示主界面（使用 ClawdInterface 替代简化版 MainInterface）
  return <ClawdInterface {...mainProps} />;
};
```

---

## 11.8 ClawdInterface 与 ContextManager 集成

### 11.8.1 初始化逻辑

**文件位置**：`src/ui/components/ClawdInterface.tsx`

```typescript
export const ClawdInterface: React.FC<ClawdInterfaceProps> = ({
  apiKey,
  baseURL,
  model,
  initialMessage,
  debug,
  resumeSessionId,
}) => {
  // ==================== Store State ====================
  const initializationStatus = useInitializationStatus();
  const activeModal = useActiveModal();
  const isThinking = useIsThinking();
  const messages = useMessages();
  const sessionId = useSessionId();
  const tokenUsage = useTokenUsage();
  const currentFocus = useCurrentFocus();

  // ==================== Local State & Refs ====================
  const agentRef = useRef<Agent | null>(null);
  const contextManagerRef = useRef<ContextManager | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [isExiting, setIsExiting] = useState(false);
  const [exitSessionId, setExitSessionId] = useState<string | null>(null);

  // ==================== Agent & Context Initialization ====================
  useEffect(() => {
    const initAgent = async () => {
      try {
        // 1. 创建 ContextManager
        contextManagerRef.current = new ContextManager({
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
            contextMessages
              .filter(m => m.role === 'user' || m.role === 'assistant')
              .forEach(m => {
                if (m.role === 'user') {
                  sessionActions().addUserMessage(m.content);
                } else if (m.role === 'assistant') {
                  sessionActions().addAssistantMessage(m.content);
                }
              });
          } else {
            // 加载失败，创建新会话
            currentSessionId = await contextManagerRef.current.createSession();
          }
        } else {
          // 创建新会话
          currentSessionId = await contextManagerRef.current.createSession();
        }

        // 【关键】更新 Store 中的 sessionId
        sessionActions().setSessionId(currentSessionId);

        // 3. 创建 Agent
        agentRef.current = await Agent.create({ apiKey, baseURL, model });

        setIsInitializing(false);
      } catch (error) {
        setInitError(error instanceof Error ? error.message : '初始化失败');
        setIsInitializing(false);
      }
    };

    initAgent();

    // 清理函数
    return () => {
      contextManagerRef.current?.cleanup();
    };
  }, [apiKey, baseURL, model, resumeSessionId]);
```

### 11.8.2 消息提交处理

```typescript
  // ==================== Command Handler ====================
  const handleSubmit = useCallback(async (value: string) => {
    if (!value.trim() || !agentRef.current || !contextManagerRef.current) return;

    const ctxManager = contextManagerRef.current;

    // 1. 添加用户消息到 UI Store
    sessionActions().addUserMessage(value);

    // 2. 清空输入
    inputBuffer.clear();

    // 3. 设置 thinking 状态
    sessionActions().setThinking(true);

    // 4. 【关键】添加用户消息到 ContextManager（自动持久化到 JSONL）
    await ctxManager.addMessage('user', value);

    try {
      // 5. 从 ContextManager 获取消息构建 ChatContext
      const contextMessages = ctxManager.getMessages();
      const modelName = model || 'gpt-4';
      
      // 6. 计算输入 token
      const inputTokens = TokenCounter.countTokens(
        contextMessages.map(m => ({ role: m.role as Message['role'], content: m.content })),
        modelName
      );

      // 7. 构建 ChatContext
      const chatContext: ChatContext = {
        sessionId: ctxManager.getCurrentSessionId() || sessionId,
        messages: contextMessages.map(m => ({
          role: m.role as Message['role'],
          content: m.content,
        })),
      };

      // 8. 调用 Agent
      const result = await agentRef.current.chat(value, chatContext);

      // 9. 添加助手消息到 UI Store
      sessionActions().addAssistantMessage(result);

      // 10. 【关键】添加助手消息到 ContextManager（自动持久化）
      await ctxManager.addMessage('assistant', result);

      // 11. 更新 Token 统计
      const outputTokens = TokenCounter.countTextTokens(result, modelName);
      ctxManager.updateTokenCount(inputTokens + outputTokens);
      
      sessionActions().updateTokenUsage({
        inputTokens: tokenUsage.inputTokens + inputTokens,
        outputTokens: tokenUsage.outputTokens + outputTokens,
      });

    } catch (error) {
      const errorContent = `Error: ${(error as Error).message}`;
      sessionActions().addAssistantMessage(errorContent);
      await ctxManager.addMessage('assistant', errorContent);
    } finally {
      sessionActions().setThinking(false);
    }
  }, [/* deps */]);
```

---

## 11.9 退出提示与会话恢复

### 11.9.1 useCtrlCHandler Hook

**文件位置**：`src/ui/hooks/useCtrlCHandler.ts`

```typescript
/**
 * useCtrlCHandler - Ctrl+C 处理
 * 
 * 处理用户按下 Ctrl+C 的行为：
 * - 有任务运行时：请求中断
 * - 无任务时：退出应用
 */

interface CtrlCHandlerOptions {
  /** 是否有正在运行的任务 */
  hasRunningTask: boolean;
  /** 中断回调 */
  onInterrupt?: () => void;
  /** 
   * 退出前回调
   * 返回 true 表示由回调自行处理退出（不执行默认 exit）
   */
  onBeforeExit?: () => boolean | void;
  /** 强制退出前的确认时间（毫秒） */
  forceExitDelay?: number;
}

export const useCtrlCHandler = (options: CtrlCHandlerOptions) => {
  const { hasRunningTask, onInterrupt, onBeforeExit, forceExitDelay = 2000 } = options;
  const { exit } = useApp();
  
  const lastCtrlCTime = useRef<number>(0);
  const forceExitPending = useRef(false);

  const doExit = useCallback(() => {
    // 执行退出前回调
    if (onBeforeExit) {
      const handled = onBeforeExit();
      // 返回 true 表示由回调处理退出
      if (handled === true) {
        return;
      }
    }
    exit();
    setTimeout(() => process.exit(0), 50);
  }, [onBeforeExit, exit]);

  const handleCtrlC = useCallback(() => {
    const now = Date.now();
    const timeSinceLastCtrlC = now - lastCtrlCTime.current;
    
    if (hasRunningTask) {
      if (forceExitPending.current && timeSinceLastCtrlC < forceExitDelay) {
        // 第二次 Ctrl+C：强制退出
        doExit();
        return;
      }
      
      // 第一次 Ctrl+C：请求中断
      forceExitPending.current = true;
      lastCtrlCTime.current = now;
      
      if (onInterrupt) {
        onInterrupt();
      }
    } else {
      // 没有任务，直接退出
      doExit();
    }
  }, [hasRunningTask, onInterrupt, forceExitDelay, doExit]);

  // 监听 Ctrl+C 输入
  useInput((input, key) => {
    if (input === 'c' && key.ctrl) {
      handleCtrlC();
    }
  });

  return { handleCtrlC, resetForceExit: () => { forceExitPending.current = false; } };
};
```

### 11.9.2 在 ClawdInterface 中使用

```typescript
// ClawdInterface.tsx

// Ctrl+C handler
useCtrlCHandler({
  hasRunningTask: isThinking,
  onInterrupt: () => {
    sessionActions().setThinking(false);
  },
  onBeforeExit: () => {
    // 获取当前会话 ID
    const currentSessionId = contextManagerRef.current?.getCurrentSessionId() || sessionId;
    
    if (currentSessionId && messages.length > 0) {
      // 设置退出状态，显示 ExitMessage
      setExitSessionId(currentSessionId);
      setIsExiting(true);
      // 返回 true 表示由 ExitMessage 组件处理退出
      return true;
    }
    return false;
  },
});
```

### 11.9.3 ExitMessage 组件

**文件位置**：`src/ui/components/common/ExitMessage.tsx`

```tsx
/**
 * ExitMessage - 退出提示组件
 * 
 * 在应用退出前显示会话恢复提示
 */

import React, { useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import { themeManager } from '../../themes/index.js';

interface ExitMessageProps {
  sessionId: string;
  exitDelay?: number;
}

export const ExitMessage: React.FC<ExitMessageProps> = ({
  sessionId,
  exitDelay = 500,
}) => {
  const { exit } = useApp();
  const theme = themeManager.getTheme();

  // 延迟退出，确保消息渲染完成
  useEffect(() => {
    const timer = setTimeout(() => {
      exit();
      setTimeout(() => process.exit(0), 50);
    }, exitDelay);

    return () => clearTimeout(timer);
  }, [exit, exitDelay]);

  return (
    <Box flexDirection="column" paddingY={1}>
      <Box>
        <Text color={theme.colors.border.light}>{'━'.repeat(60)}</Text>
      </Box>
      
      <Box marginY={1} flexDirection="column">
        <Text>
          <Text color="yellow">👋 Session saved!</Text>
          <Text> To resume this conversation:</Text>
        </Text>
        
        <Box marginTop={1} flexDirection="column" marginLeft={3}>
          <Text color="green">clawdcode --continue</Text>
          <Text color={theme.colors.text.muted}>or</Text>
          <Text>
            <Text color="green">clawdcode --resume </Text>
            <Text color="cyan">{sessionId}</Text>
          </Text>
        </Box>
      </Box>
      
      <Box>
        <Text color={theme.colors.border.light}>{'━'.repeat(60)}</Text>
      </Box>
    </Box>
  );
};
```

---

## 11.10 ChatStatusBar 组件

**文件位置**：`src/ui/components/layout/ChatStatusBar.tsx`

```tsx
/**
 * ChatStatusBar - 聊天状态栏组件
 * 
 * 显示当前会话状态、模型信息、Token 使用量等
 */

import React from 'react';
import { Box, Text } from 'ink';
import { themeManager } from '../../themes/index.js';

interface ChatStatusBarProps {
  model?: string;
  sessionId?: string;
  tokenUsage?: { input: number; output: number; total: number; };
  messageCount?: number;
  themeName?: string;
}

function formatTokens(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

export const ChatStatusBar: React.FC<ChatStatusBarProps> = ({
  model,
  sessionId,
  tokenUsage,
  messageCount,
  themeName,
}) => {
  const theme = themeManager.getTheme();

  const items: Array<{ label: string; value: string; color?: string }> = [];

  if (model) {
    items.push({ label: '🤖', value: model, color: theme.colors.primary });
  }

  if (messageCount !== undefined) {
    items.push({ label: '💬', value: String(messageCount) });
  }

  if (tokenUsage) {
    items.push({
      label: '📊',
      value: `${formatTokens(tokenUsage.input)}/${formatTokens(tokenUsage.output)} tokens`,
      color: theme.colors.info,
    });
  }

  if (themeName) {
    items.push({ label: '🎨', value: themeName });
  }

  if (sessionId) {
    // 显示完整会话 ID，方便用户恢复
    items.push({ label: '📝', value: sessionId, color: theme.colors.text.muted });
  }

  return (
    <Box
      flexDirection="row"
      justifyContent="flex-end"
      paddingX={1}
      borderStyle="single"
      borderColor={theme.colors.border.light}
      borderTop={false}
      borderLeft={false}
      borderRight={false}
    >
      {items.map((item, index) => (
        <React.Fragment key={index}>
          {index > 0 && <Text color={theme.colors.border.light}> │ </Text>}
          <Text>
            <Text>{item.label} </Text>
            <Text color={item.color || theme.colors.text.secondary}>{item.value}</Text>
          </Text>
        </React.Fragment>
      ))}
    </Box>
  );
};
```

---

## 11.11 本章小结

### 完成的内容

| 文件 | 内容 |
|------|------|
| `src/store/types.ts` | Store 类型定义（5 个 Slice） |
| `src/store/vanilla.ts` | Vanilla Store 实例 + 便捷访问器 + 初始化机制 |
| `src/store/selectors.ts` | React 选择器（细粒度状态访问） |
| `src/store/slices/*.ts` | 5 个 Slice 实现 |
| `src/config/types.ts` | RuntimeConfig + 字段路由表 + 默认权限 |
| `src/ui/App.tsx` | Store 集成 + CLI 参数合并 |
| `src/ui/components/ClawdInterface.tsx` | ContextManager 集成 |
| `src/ui/components/common/ExitMessage.tsx` | 退出提示 |
| `src/ui/hooks/useCtrlCHandler.ts` | Ctrl+C 处理增强 |
| `src/ui/components/layout/ChatStatusBar.tsx` | 状态栏 |

### 技术亮点

| 亮点 | 说明 |
|------|------|
| **SSOT 架构** | 单一数据源，状态一致性 |
| **Vanilla Store** | 非 React 环境可用（Agent、MCP） |
| **Slice 模式** | 状态分层管理，职责清晰 |
| **细粒度选择器** | 优化 React 渲染性能 |
| **字段路由表** | 灵活的配置持久化策略 |
| **会话恢复** | 退出时显示恢复命令 |

### 完整数据流

```
┌─────────────────────────────────────────────────────────────┐
│                     用户输入                                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  ClawdInterface                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ InputArea   │  │   Agent     │  │ContextMgr  │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Zustand Store                              │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌───────┐ │
│  │ session │ │ config  │ │   app   │ │  focus  │ │command│ │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └───────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      持久化层                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ config.json │  │settings.json│  │ session.jsonl│         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

---

## 11.12 本章遗留项

::: info 以下功能为可选优化
本章已实现完整的状态管理和集成功能。
:::

| 功能 | 说明 | 计划章节 |
|------|------|----------|
| **ConfigService 完整实现** | 字段路由表持久化、防抖、Per-file Mutex | 可选优化 |
| **环境变量插值** | 配置文件中支持 `${VAR}` 语法 | 可选优化 |
| **configActions 持久化** | setTheme 等方法同步持久化到磁盘 | 可选优化 |

### 当前状态

本章实现的状态管理系统是**独立完整**的：

- ✅ Zustand Vanilla Store
- ✅ 5 个 Slices（Session/Config/App/Focus/Command）
- ✅ React 选择器（优化渲染）
- ✅ RuntimeConfig + 字段路由表
- ✅ CLI 参数合并 mergeRuntimeConfig
- ✅ Store 初始化 ensureStoreInitialized
- ✅ App.tsx 切换到 ClawdInterface
- ✅ ContextManager 集成（会话持久化）
- ✅ Token 计数 + UI 显示
- ✅ 退出时会话恢复提示
- ✅ ChatStatusBar 状态栏

---

## 下一章预告

在 **第十二章** 中，我们将：
1. 实现 HookManager（Pre/Post Tool Hooks）
2. 添加诊断命令（`clawdcode doctor`）
3. 实现更新命令（`clawdcode update`）
4. 探索 Subagent 和 Skills 系统
5. 讨论 IDE 集成和多端架构

这将是整个教程的最后一章，涵盖进阶功能和扩展方向！

::: tip 恭喜
完成第 11 章后，你已经拥有了一个**功能完整**的 CLI Coding Agent！
- 可以与 LLM 对话
- 可以使用工具操作文件系统
- 可以连接 MCP 服务器
- 支持会话持久化和恢复
- 拥有完整的状态管理
:::
