# 第 14 章：交互式 Slash Commands

> 本章实现交互式 Slash Commands，包括 `/compact` 上下文压缩、`/model` 多模型选择、`/theme` 主题选择器。

## 14.1 概述

上一章实现了基础的 Slash Commands 系统，但一些命令缺乏真正的功能集成：

| 命令 | 之前状态 | 本章实现 |
|------|---------|---------|
| `/compact` | 仅显示提示信息 | 真正执行上下文压缩 |
| `/model` | 显示当前模型 | 交互式多模型选择 |
| `/theme` | 需要手动输入主题名 | ↑↓ 选择 + Enter 确认 |

**核心新增：**

1. **InteractiveSelector 组件** - 通用交互式选择器
2. **扩展 SlashCommandResult** - 支持返回选择器配置
3. **ClawdInterface 集成** - 处理选择器渲染和回调

## 14.2 InteractiveSelector 组件

创建通用的交互式选择器，支持键盘导航：

```typescript
// src/ui/components/dialog/InteractiveSelector.tsx

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { themeManager } from '../../themes/index.js';
import { useCurrentFocus, FocusId } from '../../../store/index.js';

export interface SelectorOption<T = string> {
  /** 选项值 */
  value: T;
  /** 显示标签 */
  label: string;
  /** 描述信息 */
  description?: string;
  /** 是否为当前选中项 */
  isCurrent?: boolean;
}

interface InteractiveSelectorProps<T = string> {
  title: string;
  options: SelectorOption<T>[];
  onSelect: (value: T) => void;
  onCancel: () => void;
  initialIndex?: number;
  focusId?: string;
}

export function InteractiveSelector<T = string>({
  title,
  options,
  onSelect,
  onCancel,
  initialIndex = 0,
  focusId = FocusId.SELECTOR,
}: InteractiveSelectorProps<T>): React.ReactElement {
  const theme = themeManager.getTheme();
  const currentFocus = useCurrentFocus();
  const isFocused = currentFocus === focusId;
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);

  // 处理键盘输入
  useInput(
    (input, key) => {
      if (!isFocused) return;

      if (key.upArrow || input === 'k') {
        // 上移，循环到末尾
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : options.length - 1));
      } else if (key.downArrow || input === 'j') {
        // 下移，循环到开头
        setSelectedIndex(prev => (prev < options.length - 1 ? prev + 1 : 0));
      } else if (key.return) {
        onSelect(options[selectedIndex].value);
      } else if (key.escape || input === 'q') {
        onCancel();
      }
    },
    { isActive: isFocused }
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.colors.primary}
      paddingX={2}
      paddingY={1}
    >
      {/* 标题 */}
      <Box marginBottom={1}>
        <Text bold color={theme.colors.primary}>{title}</Text>
      </Box>

      {/* 选项列表 */}
      <Box flexDirection="column">
        {options.map((option, index) => {
          const isSelected = index === selectedIndex;
          const indicator = isSelected ? '▸ ' : '  ';
          const currentMarker = option.isCurrent ? ' ✓' : '';
          
          return (
            <Box key={String(option.value)} flexDirection="row">
              <Text
                color={isSelected ? theme.colors.primary : theme.colors.text.primary}
                bold={isSelected}
              >
                {indicator}{option.label}{currentMarker}
              </Text>
              {option.description && (
                <Text color={theme.colors.text.muted} dimColor>
                  {' - '}{option.description}
                </Text>
              )}
            </Box>
          );
        })}
      </Box>

      {/* 操作提示 */}
      <Box marginTop={1}>
        <Text color={theme.colors.text.muted} dimColor>
          ↑/↓ 选择  Enter 确认  Esc 取消
        </Text>
      </Box>
    </Box>
  );
}
```

**关键设计：**

| 特性 | 说明 |
|------|------|
| **循环导航** | 到达边界时自动循环 |
| **当前项标记** | `isCurrent: true` 显示 ✓ |
| **Vim 键位** | 支持 `j`/`k` 上下移动 |
| **焦点控制** | 仅在获得焦点时响应输入 |

## 14.3 扩展类型定义

### 更新 SlashCommandContext

```typescript
// src/slash-commands/types.ts

/**
 * 选择器选项（用于交互式选择）
 */
export interface SelectorOption<T = string> {
  value: T;
  label: string;
  description?: string;
  isCurrent?: boolean;
}

/**
 * Slash 命令上下文 - 扩展
 */
export interface SlashCommandContext {
  cwd: string;
  sessionId?: string;
  messages?: any[];
  
  // 新增：用于 /compact 命令
  contextManager?: any;
  chatService?: any;
  modelName?: string;
}
```

### 更新 SlashCommandResult

```typescript
/**
 * Slash 命令结果 - 扩展
 */
export interface SlashCommandResult {
  success: boolean;
  type?: 'success' | 'error' | 'info' | 'silent' | 'selector';  // 新增 selector
  content?: string;
  message?: string;
  error?: string;
  shouldContinue?: boolean;
  data?: any;
  
  // 新增：选择器配置
  selector?: {
    title: string;
    options: SelectorOption[];
    handler: 'theme' | 'model';  // 选择后的处理器
  };
}
```

### 更新 FocusId

```typescript
// src/store/types.ts

export type FocusId = 'input' | 'messages' | 'confirmation' | 'modal' | 'none' 
  | 'theme-selector' | 'selector';  // 新增 selector

export const FocusId = {
  MAIN_INPUT: 'input' as FocusId,
  MESSAGES: 'messages' as FocusId,
  CONFIRMATION_PROMPT: 'confirmation' as FocusId,
  THEME_SELECTOR: 'theme-selector' as FocusId,
  SELECTOR: 'selector' as FocusId,  // 新增
  MODAL: 'modal' as FocusId,
  NONE: 'none' as FocusId,
} as const;
```

## 14.4 实现 /compact 命令

`/compact` 命令调用 `CompactionService` 执行真正的上下文压缩：

```typescript
// src/slash-commands/builtinCommands.ts

export const compactCommand: SlashCommand = {
  name: 'compact',
  description: '手动压缩上下文',
  category: 'session',
  usage: '/compact',
  fullDescription: '手动触发上下文压缩，将对话历史总结为简洁的摘要以节省 Token',

  async handler(_args: string, context: SlashCommandContext): Promise<SlashCommandResult> {
    const { contextManager, chatService, modelName } = context;
    
    if (!contextManager) {
      return {
        success: false,
        type: 'error',
        error: '上下文管理器不可用',
      };
    }

    try {
      // 标记开始压缩
      sessionActions().setCompacting(true);
      
      const contextMessages = contextManager.getMessages();
      const currentTokens = contextManager.getTokenCount();
      
      // 检查消息数量
      if (contextMessages.length < 4) {
        sessionActions().setCompacting(false);
        return {
          success: true,
          type: 'info',
          message: '📝 对话历史过短，无需压缩',
        };
      }

      // 动态导入压缩服务
      const { CompactionService } = await import('../context/CompactionService.js');
      
      // 获取配置
      const state = getState();
      const runtimeConfig = state.config.config;
      const maxContextTokens = runtimeConfig?.maxContextTokens || 200000;
      
      // 转换消息格式：ContextMessage -> Message
      const messages = contextMessages.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant' | 'system' | 'tool',
        content: m.content,
      }));
      
      // 执行压缩
      const result = await CompactionService.compact(messages, {
        modelName: modelName || 'gpt-4',
        maxContextTokens,
        chatService,
        trigger: 'manual',
        actualPreTokens: currentTokens,
      });

      if (result.success) {
        // 转换回 ContextMessage 格式
        const { nanoid } = await import('nanoid');
        const compactedContextMessages = result.compactedMessages.map(m => ({
          id: nanoid(),
          role: m.role as 'user' | 'assistant' | 'system' | 'tool',
          content: m.content,
          timestamp: Date.now(),
        }));
        
        // 更新 ContextManager
        contextManager.replaceMessages(compactedContextMessages);
        contextManager.updateTokenCount(result.postTokens);
        
        const savedTokens = result.preTokens - result.postTokens;
        const savedPercent = Math.round((savedTokens / result.preTokens) * 100);

        return {
          success: true,
          type: 'success',
          content: `## ✅ 上下文压缩完成

| 指标 | 值 |
|------|-----|
| 压缩前 | ${result.preTokens.toLocaleString()} tokens |
| 压缩后 | ${result.postTokens.toLocaleString()} tokens |
| 节省 | ${savedTokens.toLocaleString()} tokens (${savedPercent}%) |
| 包含文件 | ${result.filesIncluded.length} 个 |

对话可以正常继续。`,
        };
      } else {
        return {
          success: false,
          type: 'error',
          error: `压缩失败: ${result.error || '未知错误'}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        type: 'error',
        error: `压缩执行出错: ${error instanceof Error ? error.message : String(error)}`,
      };
    } finally {
      sessionActions().setCompacting(false);
    }
  },
};
```

**压缩流程：**

```
/compact 命令
    ↓
检查 contextManager 是否可用
    ↓
获取消息列表和 Token 计数
    ↓
调用 CompactionService.compact()
    ↓
转换消息格式 (ContextMessage ↔ Message)
    ↓
更新 ContextManager 中的消息
    ↓
显示压缩结果统计
```

## 14.5 实现 /model 命令

支持交互式多模型选择：

```typescript
export const modelCommand: SlashCommand = {
  name: 'model',
  aliases: ['m'],
  description: '显示或切换模型',
  category: 'config',
  usage: '/model [model-id]',
  examples: ['/model', '/model gpt-4', '/model claude-3-5-sonnet'],
  fullDescription: '显示当前模型信息，或切换到指定模型。不带参数时显示交互式选择器。',

  async handler(args: string, context: SlashCommandContext): Promise<SlashCommandResult> {
    const state = getState();
    const config = state.config.config;
    const models = config?.models || [];
    const currentModelId = config?.currentModelId;
    const defaultModel = config?.default;
    
    const trimmedArgs = args.trim();
    
    // 如果指定了模型名称，直接切换
    if (trimmedArgs) {
      const targetModel = models.find(
        m => m.id === trimmedArgs || m.model === trimmedArgs || m.name === trimmedArgs
      );
      
      if (targetModel) {
        const { configActions } = await import('../store/index.js');
        configActions().updateConfig({ currentModelId: targetModel.id });
        
        return {
          success: true,
          type: 'success',
          message: `✓ 已切换到模型: ${targetModel.name || targetModel.model || targetModel.id}`,
        };
      }
      
      // 未找到，显示可用模型
      let errorContent = `❌ 未找到模型: \`${trimmedArgs}\`\n\n`;
      if (models.length > 0) {
        errorContent += `**可用模型：**\n`;
        for (const m of models) {
          errorContent += `- \`${m.id || m.model}\` - ${m.name || m.model || 'unnamed'}\n`;
        }
      }
      
      return { success: false, type: 'error', content: errorContent };
    }
    
    // 无参数 + 无多模型配置
    if (models.length === 0) {
      const modelInfo = defaultModel?.model || currentModelId || 'unknown';
      return {
        success: true,
        type: 'info',
        content: `## 🤖 当前模型\n\n\`${modelInfo}\`\n\n未配置多模型，请在配置文件中添加 \`models\` 数组。`,
      };
    }
    
    // 返回选择器配置
    return {
      success: true,
      type: 'selector',
      selector: {
        title: '🤖 选择模型',
        options: models.map(m => ({
          value: m.id || m.model || '',
          label: m.name || m.model || m.id || 'unnamed',
          description: m.model,
          isCurrent: m.id === currentModelId,
        })),
        handler: 'model',
      },
    };
  },
};
```

**使用方式：**

```bash
# 显示交互式选择器
/model

# 直接切换（支持 id、model、name 匹配）
/model gpt-4
/model claude-3-5-sonnet
```

## 14.6 优化 /theme 命令

支持交互式主题选择：

```typescript
export const themeCommand: SlashCommand = {
  name: 'theme',
  aliases: ['t'],
  description: '显示或切换主题',
  category: 'config',
  usage: '/theme [theme-name]',
  examples: ['/theme', '/theme dark', '/theme ocean'],
  fullDescription: '显示当前主题信息，或切换到指定主题。不带参数时显示交互式选择器。',

  async handler(args: string): Promise<SlashCommandResult> {
    const { themeManager } = await import('../ui/themes/index.js');
    
    const trimmedArgs = args.trim().toLowerCase();
    const themePresets = themeManager.getThemePresets();
    const currentThemeName = themeManager.getCurrentThemeName();
    
    // 如果指定了主题名称，直接切换
    if (trimmedArgs) {
      const targetTheme = themePresets.find(
        t => t.id === trimmedArgs || t.name.toLowerCase() === trimmedArgs
      );
      
      if (targetTheme) {
        themeManager.setTheme(targetTheme.id);
        return {
          success: true,
          type: 'success',
          message: `✓ 主题已切换为 ${targetTheme.name}`,
        };
      }
      
      return {
        success: false,
        type: 'error',
        error: `未知主题: ${trimmedArgs}\n可用主题: ${themePresets.map(t => t.id).join(', ')}`,
      };
    }
    
    // 无参数时，返回选择器配置
    return {
      success: true,
      type: 'selector',
      selector: {
        title: '🎨 选择主题',
        options: themePresets.map(t => ({
          value: t.id,
          label: t.name,
          description: t.description,
          isCurrent: t.id === currentThemeName || t.name === currentThemeName,
        })),
        handler: 'theme',
      },
    };
  },
};
```

## 14.7 ClawdInterface 集成

### 添加选择器状态

```typescript
// src/ui/components/ClawdInterface.tsx

// 导入选择器组件
import { InteractiveSelector, type SelectorOption } from './dialog/InteractiveSelector.js';

// 选择器状态
const [selectorState, setSelectorState] = useState<{
  isVisible: boolean;
  title: string;
  options: SelectorOption[];
  handler: 'theme' | 'model' | null;
}>({
  isVisible: false,
  title: '',
  options: [],
  handler: null,
});
```

### 选择器回调处理

```typescript
// 处理选择
const handleSelectorSelect = useCallback(async (value: string) => {
  const { handler } = selectorState;
  
  if (handler === 'theme') {
    const { themeManager } = await import('../themes/index.js');
    themeManager.setTheme(value);
    sessionActions().addAssistantMessage(`✓ 主题已切换为 ${value}`);
  } else if (handler === 'model') {
    const { configActions } = await import('../../store/index.js');
    configActions().updateConfig({ currentModelId: value });
    sessionActions().addAssistantMessage(`✓ 模型已切换为 ${value}`);
  }
  
  // 关闭选择器，恢复焦点
  setSelectorState({ isVisible: false, title: '', options: [], handler: null });
  focusActions().setFocus(FocusId.MAIN_INPUT);
}, [selectorState]);

// 处理取消
const handleSelectorCancel = useCallback(() => {
  setSelectorState({ isVisible: false, title: '', options: [], handler: null });
  focusActions().setFocus(FocusId.MAIN_INPUT);
  sessionActions().addAssistantMessage('已取消选择');
}, []);
```

### 修改命令处理逻辑

在 `processCommand` 中处理 `selector` 类型的结果：

```typescript
const processCommand = useCallback(async (value: string) => {
  const { isSlashCommand, executeSlashCommand } = await import('../../slash-commands/index.js');
  
  if (isSlashCommand(value)) {
    sessionActions().addUserMessage(value);
    sessionActions().setThinking(true);
    
    try {
      const result = await executeSlashCommand(value, {
        cwd: process.cwd(),
        sessionId,
        messages,
        contextManager: contextManagerRef.current,  // 新增
        modelName: model,                           // 新增
      });
      
      // 处理选择器类型的结果
      if (result.type === 'selector' && result.selector) {
        sessionActions().setThinking(false);
        setSelectorState({
          isVisible: true,
          title: result.selector.title,
          options: result.selector.options,
          handler: result.selector.handler,
        });
        focusActions().setFocus(FocusId.SELECTOR);
        return;
      }
      
      // 显示普通命令结果...
    } finally {
      sessionActions().setThinking(false);
    }
    return;
  }
  
  // 正常消息处理...
}, [/* deps */]);
```

### 更新焦点管理

```typescript
useEffect(() => {
  if (confirmationState.isVisible) {
    focusActions().setFocus(FocusId.CONFIRMATION_PROMPT);
  } else if (selectorState.isVisible) {
    focusActions().setFocus(FocusId.SELECTOR);  // 新增
  } else {
    focusActions().setFocus(FocusId.MAIN_INPUT);
  }
}, [confirmationState.isVisible, selectorState.isVisible]);
```

### 渲染选择器

```tsx
// 交互式选择器
if (selectorState.isVisible) {
  return (
    <Box flexDirection="column" width="100%">
      {/* 标题 */}
      <Box marginBottom={1}>
        <Text bold color={theme.colors.primary}>🤖 ClawdCode</Text>
      </Box>

      {/* 最近消息（简化显示） */}
      <Box flexDirection="column" marginBottom={1}>
        {messages.slice(-3).map((msg, index) => (
          <MessageRenderer
            key={index}
            content={msg.content}
            role={msg.role}
            terminalWidth={terminalWidth - 2}
          />
        ))}
      </Box>

      {/* 选择器组件 */}
      <InteractiveSelector
        title={selectorState.title}
        options={selectorState.options}
        onSelect={handleSelectorSelect}
        onCancel={handleSelectorCancel}
        focusId={FocusId.SELECTOR}
      />
    </Box>
  );
}
```

## 14.8 ContextManager 扩展

添加 `replaceMessages` 方法用于压缩后更新消息：

```typescript
// src/context/ContextManager.ts

/**
 * 替换消息列表（用于压缩后更新）
 */
replaceMessages(messages: ContextMessage[]): void {
  this.memory.setMessages(messages);
}
```

## 14.9 效果演示

### /compact 效果

```
> /compact

## ✅ 上下文压缩完成

| 指标 | 值 |
|------|-----|
| 压缩前 | 45,230 tokens |
| 压缩后 | 8,150 tokens |
| 节省 | 37,080 tokens (82%) |
| 包含文件 | 5 个 |

对话可以正常继续。
```

### /model 效果

```
> /model

╭─────────────────────────────────────────────────╮
│ 🤖 选择模型                                      │
│                                                 │
│ ▸ GPT-4 Turbo - gpt-4-turbo-preview ✓          │
│   Claude 3.5 Sonnet - claude-3-5-sonnet        │
│   DeepSeek R1 - deepseek-reasoner              │
│                                                 │
│ ↑/↓ 选择  Enter 确认  Esc 取消                  │
╰─────────────────────────────────────────────────╯
```

### /theme 效果

```
> /theme

╭─────────────────────────────────────────────────╮
│ 🎨 选择主题                                      │
│                                                 │
│   Default - Light theme with blue accents       │
│ ▸ Dark - Dark theme for low-light environments ✓│
│   Ocean - Deep blue ocean theme                 │
│   Forest - Natural green forest theme           │
│   Sunset - Warm sunset colors                   │
│                                                 │
│ ↑/↓ 选择  Enter 确认  Esc 取消                  │
╰─────────────────────────────────────────────────╯
```

## 14.10 新增/修改文件

| 文件 | 说明 |
|------|------|
| `src/ui/components/dialog/InteractiveSelector.tsx` | 新增：交互式选择器组件 |
| `src/ui/components/dialog/index.ts` | 更新：导出 InteractiveSelector |
| `src/slash-commands/types.ts` | 更新：扩展 Context 和 Result 类型 |
| `src/slash-commands/builtinCommands.ts` | 更新：/compact、/model、/theme 命令 |
| `src/store/types.ts` | 更新：添加 FocusId.SELECTOR |
| `src/ui/focus/types.ts` | 更新：添加 FocusId.SELECTOR |
| `src/context/ContextManager.ts` | 更新：添加 replaceMessages 方法 |
| `src/ui/components/ClawdInterface.tsx` | 更新：选择器状态和处理逻辑 |

## 14.11 设计要点

### 1. 类型驱动的结果处理

通过 `result.type === 'selector'` 区分普通结果和选择器结果，实现统一的命令处理流程。

### 2. 焦点状态机

```
MAIN_INPUT ──(/theme)──> SELECTOR ──(Enter/Esc)──> MAIN_INPUT
```

### 3. 通用选择器模式

`InteractiveSelector` 组件可复用于：
- 主题选择
- 模型选择
- 会话选择
- 文件选择
- 任意列表选择场景

### 4. 消息类型转换

`/compact` 命令需要在两种消息格式间转换：

```
ContextMessage (id, role, content, timestamp)
      ↓ 转换
Message (role, content)
      ↓ 压缩
Message[] 
      ↓ 转换回
ContextMessage[]
```

## 14.12 测试方法

```bash
# 启动应用
bun run dev

# 测试 /compact
# 1. 进行几轮对话
# 2. 输入 /compact
# 3. 观察压缩结果统计

# 测试 /model
# 1. 在 config.json 中配置多个模型
# 2. 输入 /model
# 3. 使用 ↑↓ 选择，Enter 确认

# 测试 /theme
# 1. 输入 /theme
# 2. 使用 ↑↓ 选择主题
# 3. Enter 确认，观察界面颜色变化
# 4. 按 Esc 取消选择
```
