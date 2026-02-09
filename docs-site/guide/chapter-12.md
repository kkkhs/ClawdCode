# 第 12 章：命令历史与命令队列

在前一章中，我们实现了 Zustand 状态管理和全局 Store。本章将在此基础上，实现两个提升用户体验的重要功能：

1. **命令历史** - 使用上下箭头浏览历史命令
2. **命令队列** - AI 处理时可继续输入，命令自动排队执行

## 11B.1 功能概述

### 命令历史

类似于终端的命令历史功能：
- 按 `↑` 键：浏览上一条历史命令
- 按 `↓` 键：浏览下一条历史命令
- 命令去重，限制最大历史数量

### 命令队列

提升交互效率的关键功能：
- AI 处理中时，用户仍可输入新命令
- 新命令自动加入队列等待执行
- 当前任务完成后，自动处理队列中的下一个命令
- 队列状态可视化展示

## 11B.2 命令历史实现

### useCommandHistory Hook

创建 `src/ui/hooks/useCommandHistory.ts`：

```typescript
/**
 * useCommandHistory - 命令历史管理
 */

import { useState, useCallback } from 'react';

interface CommandHistoryResult {
  /** 添加命令到历史 */
  addToHistory: (command: string) => void;
  /** 获取上一条命令 */
  getPreviousCommand: () => string | null;
  /** 获取下一条命令 */
  getNextCommand: () => string | null;
  /** 重置历史索引 */
  resetIndex: () => void;
  /** 历史记录 */
  history: string[];
  /** 当前索引 */
  historyIndex: number;
}

/**
 * 命令历史 Hook
 * 支持上下箭头浏览历史命令
 */
export const useCommandHistory = (maxHistory = 100): CommandHistoryResult => {
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // 添加命令到历史
  const addToHistory = useCallback((command: string) => {
    if (command.trim()) {
      setHistory(prev => {
        // 避免重复添加相同命令
        if (prev[prev.length - 1] === command) {
          return prev;
        }
        // 限制历史记录数量
        const newHistory = [...prev, command];
        if (newHistory.length > maxHistory) {
          newHistory.shift();
        }
        return newHistory;
      });
    }
    // 重置索引，准备接收新命令
    setHistoryIndex(-1);
  }, [maxHistory]);

  // 获取上一条命令（按 ↑）
  const getPreviousCommand = useCallback(() => {
    if (history.length === 0) {
      return null;
    }

    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      // 从最新的命令开始往回找
      return history[history.length - 1 - newIndex];
    }
    
    // 已经到达最早的命令
    return history[0];
  }, [history, historyIndex]);

  // 获取下一条命令（按 ↓）
  const getNextCommand = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      return history[history.length - 1 - newIndex];
    }
    
    // 返回到最新（清空输入）
    setHistoryIndex(-1);
    return '';
  }, [history, historyIndex]);

  // 重置索引
  const resetIndex = useCallback(() => {
    setHistoryIndex(-1);
  }, []);

  return {
    addToHistory,
    getPreviousCommand,
    getNextCommand,
    resetIndex,
    history,
    historyIndex,
  };
};
```

### 设计要点

1. **索引逻辑**：`historyIndex` 为 -1 表示当前输入，0 表示最近一条命令，依次递增
2. **去重**：连续输入相同命令不会重复添加
3. **限制数量**：超过 `maxHistory` 时移除最早的命令
4. **边界处理**：到达历史边界时保持当前命令

## 11B.3 命令队列实现

### 回顾 CommandSlice

在第 11 章中，我们已经在 `commandSlice.ts` 中定义了队列相关的 actions：

```typescript
// src/store/slices/commandSlice.ts 中的关键部分

const initialCommandState = {
  isProcessing: false,
  abortController: null as AbortController | null,
  pendingCommands: [] as string[],  // 命令队列
};

// Actions
actions: {
  // 将命令加入待处理队列
  enqueueCommand: (command: string) => {
    set((state) => ({
      command: {
        ...state.command,
        pendingCommands: [...state.command.pendingCommands, command],
      },
    }));
  },

  // 从队列取出下一个命令
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

  // 清空待处理队列
  clearQueue: () => {
    set((state) => ({
      command: {
        ...state.command,
        pendingCommands: [],
      },
    }));
  },
}
```

### Store 选择器

确保 `src/store/selectors.ts` 中导出了队列选择器：

```typescript
// Command 选择器
export const useIsProcessing = () =>
  useClawdStore((state) => state.command.isProcessing);

export const usePendingCommands = () =>
  useClawdStore((state) => state.command.pendingCommands);
```

## 11B.4 输入组件集成

### CustomTextInput 添加箭头键支持

修改 `src/ui/components/input/CustomTextInput.tsx`，添加上下箭头处理：

```typescript
interface CustomTextInputProps {
  // ... 现有 props
  /** 上箭头回调（浏览历史） */
  onArrowUp?: () => void;
  /** 下箭头回调（浏览历史） */
  onArrowDown?: () => void;
}

export const CustomTextInput: React.FC<CustomTextInputProps> = ({
  // ... 现有解构
  onArrowUp,
  onArrowDown,
  // ...
}) => {
  // 在 useInput 中添加箭头键处理
  useInput(
    (input, key) => {
      if (!isActive) return;

      // ... 现有键盘处理

      // 上箭头：浏览历史（上一条命令）
      if (key.upArrow) {
        onArrowUp?.();
        return;
      }

      // 下箭头：浏览历史（下一条命令）
      if (key.downArrow) {
        onArrowDown?.();
        return;
      }

      // ... 其他键盘处理
    },
    { isActive }
  );
};
```

### InputArea 传递箭头回调

修改 `src/ui/components/input/InputArea.tsx`：

```typescript
interface InputAreaProps {
  // ... 现有 props
  /** 上箭头回调（浏览历史） */
  onArrowUp?: () => void;
  /** 下箭头回调（浏览历史） */
  onArrowDown?: () => void;
}

export const InputArea: React.FC<InputAreaProps> = React.memo(
  ({
    input,
    cursorPosition,
    onChange,
    onChangeCursorPosition,
    onSubmit,
    onArrowUp,
    onArrowDown,
    isProcessing = false,
    placeholder = 'Type a message... (Ctrl+C to exit)',
  }) => {
    // ...

    return (
      <Box
        flexDirection="row"
        paddingX={1}
        paddingY={0}  // 减小垂直 padding
        borderStyle="round"
        borderColor={isProcessing ? theme.colors.warning : theme.colors.border.light}
      >
        <Box marginRight={1}>
          <Text color={theme.colors.success} bold>
            {isProcessing ? '⏳' : '>'}
          </Text>
        </Box>

        <Box flexGrow={1}>
          <CustomTextInput
            value={input}
            cursorPosition={cursorPosition}
            onChange={onChange}
            onChangeCursorPosition={onChangeCursorPosition}
            onSubmit={handleSubmit}
            onPaste={handlePaste}
            onArrowUp={onArrowUp}
            onArrowDown={onArrowDown}
            placeholder={placeholder}
            focusId={FocusId.MAIN_INPUT}
            disabled={false}  // 始终启用，支持命令队列
          />
        </Box>
      </Box>
    );
  }
);
```

::: tip 关键改动
- `paddingY` 从 `1` 改为 `0`，减小输入框的垂直空间
- `disabled` 固定为 `false`，即使在处理中也允许输入（用于命令队列）
:::

## 11B.5 ClawdInterface 集成

### 导入依赖

```typescript
// src/ui/components/ClawdInterface.tsx

// Store - 添加 commandActions 和 usePendingCommands
import {
  // ... 现有导入
  commandActions,
  usePendingCommands,
} from '../../store/index.js';

// Hooks - 添加 useCommandHistory
import { useCommandHistory } from '../hooks/useCommandHistory.js';
```

### 添加 Hook 实例

```typescript
export const ClawdInterface: React.FC<ClawdInterfaceProps> = ({
  // ...
}) => {
  // Store State
  const pendingCommands = usePendingCommands();
  
  // ... 其他 state

  // Hooks
  const commandHistory = useCommandHistory();
  
  // ...
};
```

### 命令历史处理函数

```typescript
// ==================== Command History Handlers ====================
const handleArrowUp = useCallback(() => {
  const prevCommand = commandHistory.getPreviousCommand();
  if (prevCommand !== null) {
    inputBuffer.setValue(prevCommand);
    inputBuffer.setCursorPosition(prevCommand.length);
  }
}, [commandHistory, inputBuffer]);

const handleArrowDown = useCallback(() => {
  const nextCommand = commandHistory.getNextCommand();
  if (nextCommand !== null) {
    inputBuffer.setValue(nextCommand);
    inputBuffer.setCursorPosition(nextCommand.length);
  }
}, [commandHistory, inputBuffer]);
```

### 核心命令处理重构

将命令处理逻辑抽取为独立函数，支持队列调用：

```typescript
// ==================== Core Command Processor ====================
/**
 * 处理单个命令的核心逻辑（包括 slash 命令和普通消息）
 */
const processCommand = useCallback(async (value: string) => {
  // 检查是否是 slash 命令
  const { isSlashCommand, executeSlashCommand } = await import('../../slash-commands/index.js');
  
  if (isSlashCommand(value)) {
    // 执行 slash 命令
    sessionActions().addUserMessage(value);
    sessionActions().setThinking(true);
    
    try {
      const result = await executeSlashCommand(value, {
        cwd: process.cwd(),
        sessionId,
        messages,
      });
      
      if (result.content) {
        sessionActions().addAssistantMessage(result.content);
      } else if (result.message) {
        sessionActions().addAssistantMessage(result.message);
      } else if (result.error) {
        sessionActions().addAssistantMessage(`❌ ${result.error}`);
      }
    } catch (error) {
      sessionActions().addAssistantMessage(
        `❌ 命令执行失败: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      sessionActions().setThinking(false);
    }
    return;
  }

  // 正常消息处理
  if (!agentRef.current || !contextManagerRef.current) return;

  const ctxManager = contextManagerRef.current;

  sessionActions().addUserMessage(value);
  sessionActions().setThinking(true);

  await ctxManager.addMessage('user', value);

  try {
    const contextMessages = ctxManager.getMessages();
    const modelName = model || 'gpt-4';
    
    const inputTokens = TokenCounter.countTokens(
      contextMessages.map(m => ({ role: m.role as Message['role'], content: m.content })),
      modelName
    );

    const chatContext: ChatContext = {
      sessionId: ctxManager.getCurrentSessionId() || sessionId,
      messages: contextMessages.map(m => ({
        role: m.role as Message['role'],
        content: m.content,
      })),
    };

    const result = await agentRef.current.chat(value, chatContext);

    sessionActions().addAssistantMessage(result);
    await ctxManager.addMessage('assistant', result);

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
}, [model, sessionId, messages, tokenUsage.inputTokens, tokenUsage.outputTokens]);
```

### 队列处理

```typescript
// ==================== Queue Processor ====================
/**
 * 处理命令队列中的下一个命令
 */
const processQueue = useCallback(async () => {
  const nextCommand = commandActions().dequeueCommand();
  if (nextCommand) {
    await processCommand(nextCommand);
  }
}, [processCommand]);

// 当 isThinking 变为 false 时，自动检查队列
useEffect(() => {
  if (!isThinking && pendingCommands.length > 0) {
    processQueue();
  }
}, [isThinking, pendingCommands.length, processQueue]);
```

### 提交处理

```typescript
// ==================== Command Handler ====================
const handleSubmit = useCallback(async (value: string) => {
  if (!value.trim()) return;

  // 添加到命令历史
  commandHistory.addToHistory(value);

  // 清空输入
  inputBuffer.clear();

  // 如果正在处理中，将命令加入队列
  if (isThinking) {
    commandActions().enqueueCommand(value);
    return;
  }

  // 否则直接处理
  await processCommand(value);
}, [inputBuffer, commandHistory, isThinking, processCommand]);
```

## 11B.6 队列可视化

### 消息区域显示队列

在消息区域添加队列预览：

```tsx
{/* 消息区域 */}
<Box flexDirection="column" marginBottom={1}>
  {messages.map((msg, index) => (
    <MessageRenderer
      key={index}
      content={msg.content}
      role={msg.role}
      terminalWidth={terminalWidth - 2}
      showPrefix={true}
    />
  ))}

  {/* 加载指示器 */}
  {isThinking && <LoadingIndicator />}

  {/* 队列中的命令预览 */}
  {pendingCommands.length > 0 && (
    <Box flexDirection="column" marginTop={1}>
      <Text color={theme.colors.text.muted} dimColor>
        ── Queued ({pendingCommands.length}) ──
      </Text>
      {pendingCommands.map((cmd, index) => (
        <Box key={index} marginLeft={2}>
          <Text color={theme.colors.text.muted} dimColor>
            {index + 1}. {cmd.length > 60 ? cmd.slice(0, 57) + '...' : cmd}
          </Text>
        </Box>
      ))}
    </Box>
  )}
</Box>
```

### 输入区域动态提示

```tsx
{/* 输入区域 - 始终可见，处理中时显示队列提示 */}
<InputArea
  input={inputBuffer.value}
  cursorPosition={inputBuffer.cursorPosition}
  onChange={inputBuffer.setValue}
  onChangeCursorPosition={inputBuffer.setCursorPosition}
  onSubmit={handleSubmit}
  onArrowUp={handleArrowUp}
  onArrowDown={handleArrowDown}
  isProcessing={isThinking}
  placeholder={
    isThinking
      ? pendingCommands.length > 0
        ? `Queued: ${pendingCommands.length} command(s). Type to add more...`
        : 'Processing... Type to queue next command'
      : 'Type a message... (Ctrl+C to exit)'
  }
/>
```

### 状态栏显示队列数量

修改 `src/ui/components/layout/ChatStatusBar.tsx`：

```typescript
interface ChatStatusBarProps {
  // ... 现有 props
  /** 队列中的命令数量 */
  queuedCommands?: number;
}

export const ChatStatusBar: React.FC<ChatStatusBarProps> = ({
  // ... 现有解构
  queuedCommands,
}) => {
  const items: Array<{ label: string; value: string; color?: string }> = [];

  // ... 其他 items

  // 显示队列中的命令数量
  if (queuedCommands !== undefined && queuedCommands > 0) {
    items.push({
      label: '📋',
      value: `${queuedCommands} queued`,
      color: theme.colors.warning,
    });
  }

  // ...
};
```

在 ClawdInterface 中传递队列数量：

```tsx
<ChatStatusBar
  model={model}
  sessionId={sessionId}
  messageCount={messages.length}
  queuedCommands={pendingCommands.length}
  themeName={theme.name}
  tokenUsage={{
    input: tokenUsage.inputTokens,
    output: tokenUsage.outputTokens,
    total: tokenUsage.inputTokens + tokenUsage.outputTokens,
  }}
/>
```

## 11B.7 效果展示

### 命令历史

```
> 帮我写一个函数
🤖 好的，这是一个示例函数...

> ↑ (按上箭头)
> 帮我写一个函数  (自动填充历史命令)

> ↓ (按下箭头)
>   (清空，返回当前输入)
```

### 命令队列

```
> 帮我分析这段代码
🤖 正在分析...

⏳ Thinking...

── Queued (2) ──
  1. 优化性能
  2. 添加单元测试

╭────────────────────────────────────────────────╮
│ ⏳ Queued: 2 command(s). Type to add more...   │
╰────────────────────────────────────────────────╯

🤖 model │ 💬 3 │ 📋 2 queued │ 📊 1.2k/0.8k tokens
```

## 11B.8 本章小结

本章实现了两个提升用户体验的重要功能：

| 功能 | 实现方式 | 用户价值 |
|------|----------|----------|
| 命令历史 | `useCommandHistory` Hook | 快速重用历史命令 |
| 命令队列 | `commandSlice` + 队列处理 | 无需等待即可输入多个任务 |
| 队列可视化 | 消息区 + 状态栏 + 动态提示 | 清晰了解任务状态 |

### 关键设计决策

1. **始终允许输入**：即使 AI 处理中，输入框也不禁用
2. **自动队列处理**：通过 `useEffect` 监听状态变化，自动处理下一个命令
3. **清晰的视觉反馈**：队列数量在多处显示，用户不会迷失

### 下一步

在下一章（12a）中，我们将实现 Slash Commands 系统，包括 `/compact`、`/help`、`/mcp` 等内置命令。
