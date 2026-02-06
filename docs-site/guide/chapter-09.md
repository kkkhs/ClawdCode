# 第九章：UI 系统

> **学习目标**：实现 Ink 终端 UI 系统、主题管理、确认提示和 Markdown 渲染
> 
> **预计阅读时间**：50 分钟
> 
> **实践时间**：60 分钟
> 
> **前置要求**：已完成第八章的代码实现

---

## 9.1 Ink - React for CLI

### 9.1.1 为什么选择 Ink

Ink 是一个使用 React 构建命令行界面的库。选择 Ink 的原因：

| 优势 | 说明 |
|------|------|
| **React 语法** | 开发者熟悉，LLM 也很熟悉 |
| **组件化** | 复用 React 生态的设计模式 |
| **声明式** | 状态驱动 UI，无需手动刷新 |
| **丰富生态** | ink-spinner、ink-text-input 等现成组件 |

### 9.1.2 Ink 基础概念

```tsx
import { Box, Text } from 'ink';

// Box 类似 div，用于布局
<Box flexDirection="column" padding={1}>
  <Text color="green">Hello</Text>
  <Text bold>World</Text>
</Box>
```

**常用组件**：
- `<Box>` - 布局容器（支持 Flexbox）
- `<Text>` - 文本（支持颜色、加粗等）
- `<Newline>` - 换行
- `useInput()` - 键盘输入监听
- `useApp()` - 应用级操作（如退出）

### 9.1.3 目录结构

```
src/ui/
├── App.tsx                    # 主应用组件
├── components/
│   ├── dialog/
│   │   ├── ConfirmationPrompt.tsx   # 确认提示
│   │   ├── UpdatePrompt.tsx         # 更新提示
│   │   └── index.ts
│   ├── markdown/
│   │   ├── MessageRenderer.tsx      # 消息渲染
│   │   ├── CodeHighlighter.tsx      # 代码高亮
│   │   ├── parser.ts                # Markdown 解析
│   │   ├── types.ts
│   │   └── index.ts
│   ├── common/
│   │   ├── ErrorBoundary.tsx        # 错误边界
│   │   ├── LoadingIndicator.tsx     # 加载指示器
│   │   └── index.ts
│   ├── input/
│   │   └── InputArea.tsx            # 输入区域
│   └── layout/
│       ├── MessageArea.tsx          # 消息区域
│       └── ChatStatusBar.tsx        # 状态栏
├── themes/
│   ├── types.ts                     # 主题类型
│   ├── ThemeManager.ts              # 主题管理器
│   ├── defaultTheme.ts              # 默认主题
│   ├── darkTheme.ts                 # 暗色主题
│   └── index.ts
├── hooks/
│   ├── useTerminalWidth.ts          # 终端宽度
│   ├── useConfirmation.ts           # 确认处理
│   ├── useCtrlCHandler.ts           # Ctrl+C 处理
│   └── index.ts
└── focus/
    ├── FocusManager.ts              # 焦点管理
    └── useFocus.ts
```

---

## 9.2 主题系统

### 9.2.1 主题类型定义

**文件位置**：`src/ui/themes/types.ts`

```typescript
/**
 * 主题系统类型定义
 */

/**
 * 语法高亮颜色
 */
export interface SyntaxColors {
  comment: string;
  string: string;
  number: string;
  keyword: string;
  function: string;
  variable: string;
  operator: string;
  type: string;
  tag: string;
  attr: string;
  default: string;
}

/**
 * 基础颜色配置
 */
export interface BaseColors {
  primary: string;      // 主色调
  secondary: string;    // 次要色调
  accent: string;       // 强调色
  success: string;      // 成功状态
  warning: string;      // 警告状态
  error: string;        // 错误状态
  info: string;         // 信息状态
  text: {
    primary: string;    // 主要文本
    secondary: string;  // 次要文本
    muted: string;      // 弱化文本
    light: string;      // 浅色文本
  };
  background: {
    primary: string;    // 主要背景
    secondary: string;  // 次要背景
    dark: string;       // 深色背景
  };
  border: {
    light: string;
    dark: string;
  };
  syntax: SyntaxColors;
}

/**
 * 间距配置
 */
export interface Spacing {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
}

/**
 * 主题配置
 */
export interface Theme {
  name: string;
  colors: BaseColors;
  spacing: Spacing;
}

/**
 * 角色样式配置
 */
export interface RoleStyle {
  color: string;
  prefix: string;
  bold?: boolean;
}

/**
 * 主题预设项
 */
export interface ThemePreset {
  id: string;
  name: string;
  description?: string;
  theme: Theme;
}
```

### 9.2.2 默认主题

**文件位置**：`src/ui/themes/defaultTheme.ts`

```typescript
/**
 * 默认主题（亮色）
 */

import type { Theme } from './types.js';

export const defaultTheme: Theme = {
  name: 'default',
  colors: {
    primary: '#3b82f6',      // blue-500
    secondary: '#6366f1',    // indigo-500
    accent: '#8b5cf6',       // violet-500
    success: '#22c55e',      // green-500
    warning: '#eab308',      // yellow-500
    error: '#ef4444',        // red-500
    info: '#06b6d4',         // cyan-500
    text: {
      primary: '#1f2937',    // gray-800
      secondary: '#4b5563',  // gray-600
      muted: '#9ca3af',      // gray-400
      light: '#d1d5db',      // gray-300
    },
    background: {
      primary: '#ffffff',
      secondary: '#f9fafb',  // gray-50
      dark: '#1f2937',       // gray-800
    },
    border: {
      light: '#e5e7eb',      // gray-200
      dark: '#374151',       // gray-700
    },
    syntax: {
      comment: '#6b7280',    // gray-500
      string: '#22c55e',     // green-500
      number: '#f59e0b',     // amber-500
      keyword: '#8b5cf6',    // violet-500
      function: '#3b82f6',   // blue-500
      variable: '#ef4444',   // red-500
      operator: '#ec4899',   // pink-500
      type: '#06b6d4',       // cyan-500
      tag: '#f97316',        // orange-500
      attr: '#eab308',       // yellow-500
      default: '#1f2937',    // gray-800
    },
  },
  spacing: {
    xs: 1,
    sm: 2,
    md: 4,
    lg: 6,
    xl: 8,
  },
};
```

### 9.2.3 暗色主题

**文件位置**：`src/ui/themes/darkTheme.ts`

```typescript
/**
 * 暗色主题
 */

import type { Theme } from './types.js';

export const darkTheme: Theme = {
  name: 'dark',
  colors: {
    primary: '#60a5fa',      // blue-400
    secondary: '#818cf8',    // indigo-400
    accent: '#a78bfa',       // violet-400
    success: '#4ade80',      // green-400
    warning: '#facc15',      // yellow-400
    error: '#f87171',        // red-400
    info: '#22d3ee',         // cyan-400
    text: {
      primary: '#f3f4f6',    // gray-100
      secondary: '#d1d5db',  // gray-300
      muted: '#9ca3af',      // gray-400
      light: '#6b7280',      // gray-500
    },
    background: {
      primary: '#111827',    // gray-900
      secondary: '#1f2937',  // gray-800
      dark: '#030712',       // gray-950
    },
    border: {
      light: '#374151',      // gray-700
      dark: '#4b5563',       // gray-600
    },
    syntax: {
      comment: '#9ca3af',    // gray-400
      string: '#4ade80',     // green-400
      number: '#fbbf24',     // amber-400
      keyword: '#a78bfa',    // violet-400
      function: '#60a5fa',   // blue-400
      variable: '#f87171',   // red-400
      operator: '#f472b6',   // pink-400
      type: '#22d3ee',       // cyan-400
      tag: '#fb923c',        // orange-400
      attr: '#facc15',       // yellow-400
      default: '#f3f4f6',    // gray-100
    },
  },
  spacing: {
    xs: 1,
    sm: 2,
    md: 4,
    lg: 6,
    xl: 8,
  },
};
```

### 9.2.4 主题管理器

**文件位置**：`src/ui/themes/ThemeManager.ts`

```typescript
/**
 * 主题管理器
 * 
 * 管理主题的注册、切换和获取
 */

import type { Theme, ThemePreset, RoleStyle } from './types.js';
import { defaultTheme } from './defaultTheme.js';
import { darkTheme } from './darkTheme.js';

/**
 * 预设主题列表
 */
const presetThemes: ThemePreset[] = [
  {
    id: 'default',
    name: 'Default',
    description: 'Light theme with blue accents',
    theme: defaultTheme,
  },
  {
    id: 'dark',
    name: 'Dark',
    description: 'Dark theme for low-light environments',
    theme: darkTheme,
  },
  {
    id: 'ocean',
    name: 'Ocean',
    description: 'Deep blue ocean theme',
    theme: {
      ...darkTheme,
      name: 'ocean',
      colors: {
        ...darkTheme.colors,
        primary: '#0ea5e9',
        secondary: '#06b6d4',
        accent: '#14b8a6',
        background: {
          primary: '#0c4a6e',
          secondary: '#075985',
          dark: '#082f49',
        },
      },
    },
  },
];

/**
 * 主题管理器类
 */
export class ThemeManager {
  private currentTheme: Theme = defaultTheme;
  private themes: Map<string, Theme> = new Map();

  constructor() {
    // 注册预设主题
    for (const preset of presetThemes) {
      this.themes.set(preset.id, preset.theme);
    }
  }

  /**
   * 设置当前主题
   */
  setTheme(themeName: string): void {
    const theme = this.themes.get(themeName);
    if (theme) {
      this.currentTheme = theme;
    } else {
      throw new Error(`Theme '${themeName}' not found`);
    }
  }

  /**
   * 获取当前主题
   */
  getTheme(): Theme {
    return this.currentTheme;
  }

  /**
   * 获取所有可用主题名称
   */
  getAvailableThemes(): string[] {
    return Array.from(this.themes.keys());
  }

  /**
   * 获取角色样式
   */
  getRoleStyle(role: 'user' | 'assistant' | 'system' | 'tool'): RoleStyle {
    const colors = this.currentTheme.colors;
    
    switch (role) {
      case 'user':
        return { color: colors.success, prefix: '> ', bold: false };
      case 'assistant':
        return { color: colors.primary, prefix: '🤖 ', bold: false };
      case 'system':
        return { color: colors.warning, prefix: '⚙️ ', bold: true };
      case 'tool':
        return { color: colors.info, prefix: '🔧 ', bold: false };
      default:
        return { color: colors.text.primary, prefix: '' };
    }
  }

  /**
   * 注册自定义主题
   */
  registerTheme(id: string, theme: Theme): void {
    this.themes.set(id, theme);
  }
}

// 导出单例
export const themeManager = new ThemeManager();
```

---

## 9.3 确认提示组件

### 9.3.1 ConfirmationPrompt

**文件位置**：`src/ui/components/dialog/ConfirmationPrompt.tsx`

这是执行管道（第 7 章）中 `ConfirmationStage` 使用的 UI 组件。

```tsx
/**
 * ConfirmationPrompt - 权限确认组件
 * 
 * 用于在执行危险操作前请求用户确认
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ConfirmationDetails, ConfirmationResponse } from '../../../agent/types.js';

interface ConfirmationPromptProps {
  details: ConfirmationDetails;
  onResponse: (response: ConfirmationResponse) => void;
}

type SelectionOption = 'approve' | 'deny' | 'approve_session';

const OPTIONS: { value: SelectionOption; label: string }[] = [
  { value: 'approve', label: '✅ Approve' },
  { value: 'deny', label: '❌ Deny' },
  { value: 'approve_session', label: '✅ Approve & Remember' },
];

export const ConfirmationPrompt: React.FC<ConfirmationPromptProps> = ({
  details,
  onResponse,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // 键盘输入处理
  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : OPTIONS.length - 1));
    } else if (key.downArrow) {
      setSelectedIndex(prev => (prev < OPTIONS.length - 1 ? prev + 1 : 0));
    } else if (key.return) {
      const selected = OPTIONS[selectedIndex];
      onResponse({
        approved: selected.value.startsWith('approve'),
        scope: selected.value === 'approve_session' ? 'session' : 'once',
      });
    } else if (input === 'y' || input === 'Y') {
      onResponse({ approved: true, scope: 'once' });
    } else if (input === 'n' || input === 'N') {
      onResponse({ approved: false, reason: 'User pressed N' });
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
      {/* 标题 */}
      <Box marginBottom={1}>
        <Text bold color="yellow">⚠️  {details.title}</Text>
      </Box>

      {/* 消息 */}
      <Box marginBottom={1}>
        <Text>{details.message}</Text>
      </Box>

      {/* 详情（如果有） */}
      {details.details && (
        <Box marginBottom={1} flexDirection="column">
          <Text dimColor>Details:</Text>
          <Box marginLeft={2}>
            <Text dimColor>{details.details}</Text>
          </Box>
        </Box>
      )}

      {/* 风险（如果有） */}
      {details.risks && details.risks.length > 0 && (
        <Box marginBottom={1} flexDirection="column">
          <Text color="red">Risks:</Text>
          {details.risks.map((risk, i) => (
            <Box key={i} marginLeft={2}>
              <Text color="red">• {risk}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* 受影响的文件 */}
      {details.affectedFiles && details.affectedFiles.length > 0 && (
        <Box marginBottom={1} flexDirection="column">
          <Text color="cyan">Affected files:</Text>
          {details.affectedFiles.map((file, i) => (
            <Box key={i} marginLeft={2}>
              <Text color="cyan">• {file}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* 选项 */}
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>Use ↑/↓ to select, Enter to confirm, or press Y/N:</Text>
        {OPTIONS.map((option, index) => (
          <Box key={option.value}>
            <Text
              color={index === selectedIndex ? 'green' : undefined}
              bold={index === selectedIndex}
            >
              {index === selectedIndex ? '❯ ' : '  '}
              {option.label}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

/**
 * 创建自动确认处理器（用于非交互式环境）
 */
export function createAutoConfirmationHandler(
  mode: 'approve' | 'deny' | 'approve_session' = 'deny'
): (details: ConfirmationDetails) => Promise<ConfirmationResponse> {
  return async () => ({
    approved: mode.startsWith('approve'),
    scope: mode === 'approve_session' ? 'session' : 'once',
    reason: `Auto-${mode} by non-interactive mode`,
  });
}
```

### 9.3.2 确认类型定义

**文件位置**：`src/agent/types.ts`（添加到现有文件）

```typescript
// 【第 9 章添加】确认相关类型

/**
 * 确认详情（传递给 UI）
 */
export interface ConfirmationDetails {
  title: string;
  message: string;
  details?: string;          // 操作预览
  risks?: string[];          // 风险列表
  affectedFiles?: string[];  // 受影响的文件
}

/**
 * 确认响应（来自用户）
 */
export interface ConfirmationResponse {
  approved: boolean;
  reason?: string;
  scope?: 'once' | 'session';  // 批准范围
}

/**
 * 确认处理器接口
 */
export interface ConfirmationHandler {
  requestConfirmation(details: ConfirmationDetails): Promise<ConfirmationResponse>;
}
```

### 9.3.3 useConfirmation Hook

**文件位置**：`src/ui/hooks/useConfirmation.ts`

```typescript
/**
 * useConfirmation - 确认处理 Hook
 */

import { useState, useCallback } from 'react';
import type { ConfirmationDetails, ConfirmationResponse, ConfirmationHandler } from '../../agent/types.js';

interface UseConfirmationReturn {
  pendingConfirmation: ConfirmationDetails | null;
  confirmationHandler: ConfirmationHandler;
  handleResponse: (response: ConfirmationResponse) => void;
}

export function useConfirmation(): UseConfirmationReturn {
  const [pendingConfirmation, setPendingConfirmation] = useState<ConfirmationDetails | null>(null);
  const [resolver, setResolver] = useState<((response: ConfirmationResponse) => void) | null>(null);

  const confirmationHandler: ConfirmationHandler = {
    requestConfirmation: useCallback(async (details: ConfirmationDetails) => {
      return new Promise<ConfirmationResponse>((resolve) => {
        setPendingConfirmation(details);
        setResolver(() => resolve);
      });
    }, []),
  };

  const handleResponse = useCallback((response: ConfirmationResponse) => {
    if (resolver) {
      resolver(response);
      setResolver(null);
      setPendingConfirmation(null);
    }
  }, [resolver]);

  return {
    pendingConfirmation,
    confirmationHandler,
    handleResponse,
  };
}
```

---

## 9.4 Markdown 渲染

### 9.4.1 解析器类型

**文件位置**：`src/ui/components/markdown/types.ts`

```typescript
/**
 * Markdown 解析类型
 */

/**
 * 解析后的块类型
 */
export interface ParsedBlock {
  type: 'text' | 'code' | 'heading' | 'list' | 'hr' | 'table' | 'blockquote' | 'empty';
  content: string;
  language?: string;      // 代码块语言
  level?: number;         // 标题级别
  listType?: 'ul' | 'ol'; // 列表类型
  marker?: string;        // 列表标记
  indent?: number;        // 缩进级别
  tableData?: {           // 表格数据
    headers: string[];
    rows: string[][];
    alignments: ('left' | 'center' | 'right')[];
  };
}
```

### 9.4.2 Markdown 解析器

**文件位置**：`src/ui/components/markdown/parser.ts`

```typescript
/**
 * 简单的 Markdown 解析器
 */

import type { ParsedBlock } from './types.js';

/**
 * 解析 Markdown 文本为块列表
 */
export function parseMarkdown(text: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 空行
    if (line.trim() === '') {
      blocks.push({ type: 'empty', content: '' });
      i++;
      continue;
    }

    // 代码块 ```
    if (line.startsWith('```')) {
      const language = line.slice(3).trim() || undefined;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({
        type: 'code',
        content: codeLines.join('\n'),
        language,
      });
      i++; // 跳过结束的 ```
      continue;
    }

    // 标题 #
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        content: headingMatch[2],
        level: headingMatch[1].length,
      });
      i++;
      continue;
    }

    // 水平线
    if (/^[-*_]{3,}$/.test(line.trim())) {
      blocks.push({ type: 'hr', content: '' });
      i++;
      continue;
    }

    // 无序列表
    const ulMatch = line.match(/^(\s*)([-*+])\s+(.+)$/);
    if (ulMatch) {
      blocks.push({
        type: 'list',
        content: ulMatch[3],
        listType: 'ul',
        marker: '•',
        indent: ulMatch[1].length,
      });
      i++;
      continue;
    }

    // 有序列表
    const olMatch = line.match(/^(\s*)(\d+)[.)]\s+(.+)$/);
    if (olMatch) {
      blocks.push({
        type: 'list',
        content: olMatch[3],
        listType: 'ol',
        marker: olMatch[2] + '.',
        indent: olMatch[1].length,
      });
      i++;
      continue;
    }

    // 引用
    if (line.startsWith('>')) {
      blocks.push({
        type: 'blockquote',
        content: line.slice(1).trim(),
      });
      i++;
      continue;
    }

    // 表格（检测表头分隔符）
    if (i + 1 < lines.length && /^\|?[\s:-]+\|[\s:-]+\|?$/.test(lines[i + 1])) {
      const tableData = parseTable(lines, i);
      if (tableData) {
        blocks.push({
          type: 'table',
          content: '',
          tableData,
        });
        i = tableData.endIndex;
        continue;
      }
    }

    // 普通文本
    blocks.push({ type: 'text', content: line });
    i++;
  }

  return blocks;
}

/**
 * 解析表格
 */
function parseTable(
  lines: string[],
  startIndex: number
): { headers: string[]; rows: string[][]; alignments: ('left' | 'center' | 'right')[]; endIndex: number } | null {
  const headerLine = lines[startIndex];
  const separatorLine = lines[startIndex + 1];

  // 解析表头
  const headers = headerLine.split('|').map(s => s.trim()).filter(s => s);
  
  // 解析对齐
  const alignments: ('left' | 'center' | 'right')[] = separatorLine
    .split('|')
    .map(s => s.trim())
    .filter(s => s)
    .map(s => {
      if (s.startsWith(':') && s.endsWith(':')) return 'center';
      if (s.endsWith(':')) return 'right';
      return 'left';
    });

  // 解析数据行
  const rows: string[][] = [];
  let i = startIndex + 2;
  while (i < lines.length && lines[i].includes('|')) {
    const row = lines[i].split('|').map(s => s.trim()).filter(s => s);
    rows.push(row);
    i++;
  }

  return { headers, rows, alignments, endIndex: i };
}
```

### 9.4.3 消息渲染器

**文件位置**：`src/ui/components/markdown/MessageRenderer.tsx`

```tsx
/**
 * MessageRenderer - 消息渲染组件
 * 
 * 解析 Markdown 并渲染为终端友好的格式
 */

import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { parseMarkdown } from './parser.js';
import { themeManager } from '../../themes/index.js';
import { CodeHighlighter } from './CodeHighlighter.js';
import type { ParsedBlock } from './types.js';

interface MessageRendererProps {
  content: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  terminalWidth?: number;
  showPrefix?: boolean;
}

export const MessageRenderer: React.FC<MessageRendererProps> = React.memo(
  ({ content, role, terminalWidth = 80, showPrefix = true }) => {
    const theme = themeManager.getTheme();
    const roleStyle = themeManager.getRoleStyle(role);

    // 解析 Markdown（缓存结果）
    const blocks = useMemo(() => parseMarkdown(content), [content]);

    return (
      <Box flexDirection="column" marginBottom={1}>
        {blocks.map((block, index) => (
          <BlockRenderer
            key={index}
            block={block}
            isFirst={index === 0}
            roleStyle={showPrefix ? roleStyle : undefined}
            terminalWidth={terminalWidth}
            theme={theme}
          />
        ))}
      </Box>
    );
  }
);

// ===== 块渲染器 =====

interface BlockRendererProps {
  block: ParsedBlock;
  isFirst: boolean;
  roleStyle?: { color: string; prefix: string; bold?: boolean };
  terminalWidth: number;
  theme: ReturnType<typeof themeManager.getTheme>;
}

const BlockRenderer: React.FC<BlockRendererProps> = ({
  block,
  isFirst,
  roleStyle,
  terminalWidth,
  theme,
}) => {
  const prefixWidth = roleStyle?.prefix.length ?? 0;

  if (block.type === 'empty') {
    return <Box height={1} />;
  }

  return (
    <Box flexDirection="row">
      {/* 角色前缀（只在第一行显示） */}
      {isFirst && roleStyle && (
        <Box marginRight={1}>
          <Text color={roleStyle.color} bold={roleStyle.bold}>
            {roleStyle.prefix}
          </Text>
        </Box>
      )}
      {!isFirst && roleStyle && <Box width={prefixWidth + 1} />}

      {/* 根据类型渲染内容 */}
      <Box flexGrow={1} flexShrink={1}>
        {block.type === 'code' ? (
          <CodeHighlighter
            content={block.content}
            language={block.language}
            showLineNumbers={true}
          />
        ) : block.type === 'heading' ? (
          <Heading content={block.content} level={block.level || 1} theme={theme} />
        ) : block.type === 'list' ? (
          <ListItem
            content={block.content}
            listType={block.listType}
            marker={block.marker}
            indent={block.indent}
            theme={theme}
          />
        ) : block.type === 'hr' ? (
          <HorizontalRule width={terminalWidth - prefixWidth - 2} theme={theme} />
        ) : block.type === 'blockquote' ? (
          <Blockquote content={block.content} theme={theme} />
        ) : (
          <TextBlock content={block.content} theme={theme} />
        )}
      </Box>
    </Box>
  );
};

// ===== 子组件 =====

const Heading: React.FC<{ content: string; level: number; theme: any }> = ({
  content,
  level,
  theme,
}) => {
  const color = level === 1 ? theme.colors.primary : 
                level === 2 ? theme.colors.secondary : 
                theme.colors.accent;
  
  return (
    <Box marginY={level <= 2 ? 1 : 0}>
      <Text color={color} bold underline={level === 1}>
        {content}
      </Text>
    </Box>
  );
};

const ListItem: React.FC<{
  content: string;
  listType?: 'ul' | 'ol';
  marker?: string;
  indent?: number;
  theme: any;
}> = ({ content, listType, marker, indent = 0, theme }) => {
  const indentStr = '  '.repeat(Math.floor(indent / 2));
  const bulletColor = listType === 'ol' ? theme.colors.info : theme.colors.success;
  
  return (
    <Box>
      <Text>
        {indentStr}
        <Text color={bulletColor}>{marker || '•'}</Text>
        {' '}{content}
      </Text>
    </Box>
  );
};

const HorizontalRule: React.FC<{ width: number; theme: any }> = ({ width, theme }) => (
  <Box marginY={1}>
    <Text color={theme.colors.border.light}>{'─'.repeat(Math.max(width, 10))}</Text>
  </Box>
);

const Blockquote: React.FC<{ content: string; theme: any }> = ({ content, theme }) => (
  <Box>
    <Text color={theme.colors.border.light}>│ </Text>
    <Text color={theme.colors.text.muted} italic>{content}</Text>
  </Box>
);

const TextBlock: React.FC<{ content: string; theme: any }> = ({ content, theme }) => (
  <Text wrap="wrap" color={theme.colors.text.primary}>{content}</Text>
);

export default MessageRenderer;
```

---

## 9.5 主应用组件

### 9.5.1 App.tsx 结构

**文件位置**：`src/ui/App.tsx`

```tsx
/**
 * App.tsx - 主 UI 组件
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { Agent } from '../agent/Agent.js';
import type { Message, ChatContext } from '../agent/types.js';
import { ErrorBoundary } from './components/common/ErrorBoundary.js';
import { UpdatePrompt } from './components/dialog/UpdatePrompt.js';
import { MessageRenderer } from './components/markdown/MessageRenderer.js';
import { ConfirmationPrompt } from './components/dialog/ConfirmationPrompt.js';
import { useTerminalWidth } from './hooks/useTerminalWidth.js';
import { useConfirmation } from './hooks/useConfirmation.js';
import { themeManager } from './themes/ThemeManager.js';

// ========== 类型定义 ==========

interface UIMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AppProps {
  apiKey: string;
  baseURL?: string;
  model?: string;
  initialMessage?: string;
  debug?: boolean;
  permissionMode?: string;
}

// ========== 主界面组件 ==========

const MainInterface: React.FC<AppProps> = ({ 
  apiKey, 
  baseURL, 
  model,
  initialMessage,
  debug,
}) => {
  const [input, setInput] = useState('');
  const [uiMessages, setUIMessages] = useState<UIMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  
  const terminalWidth = useTerminalWidth();
  const theme = themeManager.getTheme();
  const { pendingConfirmation, confirmationHandler, handleResponse } = useConfirmation();
  
  const agentRef = useRef<Agent | null>(null);
  const contextRef = useRef<ChatContext>({
    sessionId: `session-${Date.now()}`,
    messages: [],
    confirmationHandler, // 【重要】传递确认处理器
  });

  // 初始化 Agent
  useEffect(() => {
    const initAgent = async () => {
      try {
        agentRef.current = await Agent.create({ apiKey, baseURL, model });
        setIsInitializing(false);
      } catch (error) {
        setInitError(error instanceof Error ? error.message : '初始化失败');
        setIsInitializing(false);
      }
    };
    initAgent();
  }, [apiKey, baseURL, model]);

  // 处理消息提交
  const handleSubmit = useCallback(async (value: string) => {
    if (!value.trim() || !agentRef.current) return;

    setUIMessages(prev => [...prev, { role: 'user', content: value }]);
    setInput('');
    setIsLoading(true);

    contextRef.current.messages.push({ role: 'user', content: value });

    try {
      const result = await agentRef.current.chat(value, contextRef.current);
      setUIMessages(prev => [...prev, { role: 'assistant', content: result }]);
      contextRef.current.messages.push({ role: 'assistant', content: result });
    } catch (error) {
      setUIMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `Error: ${(error as Error).message}` 
      }]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 初始化中
  if (isInitializing) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box>
          <Text color="yellow"><Spinner type="dots" /></Text>
          <Text color="yellow"> Initializing Agent...</Text>
        </Box>
      </Box>
    );
  }

  // 初始化失败
  if (initError) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">❌ Agent initialization failed:</Text>
        <Text color="red">{initError}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      {/* 标题 */}
      <Box marginBottom={1}>
        <Text bold color={theme.colors.primary}>🤖 ClawdCode - CLI Coding Agent</Text>
      </Box>

      {/* 消息历史 */}
      <Box flexDirection="column" marginBottom={1}>
        {uiMessages.map((msg, index) => (
          <MessageRenderer
            key={index}
            content={msg.content}
            role={msg.role}
            terminalWidth={terminalWidth - 2}
          />
        ))}

        {isLoading && (
          <Box>
            <Text color={theme.colors.warning}><Spinner type="dots" /></Text>
            <Text color={theme.colors.warning}> Thinking...</Text>
          </Box>
        )}
      </Box>

      {/* 确认提示（如果有） */}
      {pendingConfirmation && (
        <ConfirmationPrompt
          details={pendingConfirmation}
          onResponse={handleResponse}
        />
      )}

      {/* 输入框 */}
      {!isLoading && !pendingConfirmation && (
        <Box>
          <Text color={theme.colors.success}>{'> '}</Text>
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

export const App: React.FC<AppProps> = (props) => {
  return (
    <ErrorBoundary>
      <MainInterface {...props} />
    </ErrorBoundary>
  );
};
```

---

## 9.6 错误边界

**文件位置**：`src/ui/components/common/ErrorBoundary.tsx`

```tsx
/**
 * ErrorBoundary - React 错误边界
 */

import React from 'react';
import { Box, Text } from 'ink';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Error info:', errorInfo);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Box flexDirection="column" padding={1}>
          <Text color="red" bold>❌ Application Error</Text>
          <Box marginTop={1}>
            <Text color="red">{this.state.error?.message || 'Unknown error'}</Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>
              Please restart the application. If the problem persists, report the issue.
            </Text>
          </Box>
        </Box>
      );
    }

    return this.props.children;
  }
}
```

---

## 9.7 常用 Hooks

### 9.7.1 useTerminalWidth

**文件位置**：`src/ui/hooks/useTerminalWidth.ts`

```typescript
/**
 * useTerminalWidth - 获取终端宽度
 */

import { useState, useEffect } from 'react';

export function useTerminalWidth(): number {
  const [width, setWidth] = useState(process.stdout.columns || 80);

  useEffect(() => {
    const handleResize = () => {
      setWidth(process.stdout.columns || 80);
    };

    process.stdout.on('resize', handleResize);
    return () => {
      process.stdout.off('resize', handleResize);
    };
  }, []);

  return width;
}
```

### 9.7.2 useCtrlCHandler

**文件位置**：`src/ui/hooks/useCtrlCHandler.ts`

```typescript
/**
 * useCtrlCHandler - Ctrl+C 处理
 */

import { useEffect } from 'react';
import { useApp, useInput } from 'ink';

export function useCtrlCHandler(onExit?: () => void): void {
  const { exit } = useApp();

  useInput((input, key) => {
    if (input === 'c' && key.ctrl) {
      onExit?.();
      exit();
    }
  });

  useEffect(() => {
    const handleSignal = () => {
      onExit?.();
      process.exit(0);
    };

    process.on('SIGINT', handleSignal);
    return () => {
      process.off('SIGINT', handleSignal);
    };
  }, [onExit]);
}
```

---

## 9.8 本章小结

### 完成的内容

| 文件 | 内容 |
|------|------|
| `src/ui/themes/*.ts` | 主题系统（类型、管理器、预设主题） |
| `src/ui/components/dialog/*.tsx` | 对话框组件（确认、更新提示） |
| `src/ui/components/markdown/*.tsx` | Markdown 渲染系统 |
| `src/ui/components/common/*.tsx` | 通用组件（错误边界、加载指示器） |
| `src/ui/hooks/*.ts` | 常用 Hooks |
| `src/ui/App.tsx` | 主应用组件 |

### 技术亮点

| 亮点 | 说明 |
|------|------|
| **Ink + React** | 熟悉的组件化开发方式 |
| **主题系统** | 支持多主题切换和自定义 |
| **Markdown 渲染** | 终端友好的格式化输出 |
| **确认机制** | 内联确认（输入框上方），与执行管道无缝集成 |
| **错误边界** | 优雅的错误处理 |
| **代码块路径** | 解析 `language:filepath` 格式，头部显示文件路径和 `/copy` 提示 |
| **Tool Call 展示** | 紧凑 dim 样式 `ToolCallLine` 组件，与正文视觉区分 |
| **Thinking 折叠** | 思考块完成后自动折叠，`/thinking` 全局切换 |
| **AbortController** | Ctrl+C 正确中断流式输出和 Agent 循环 |
| **焦点同步** | 命令式焦点检查 + 同步焦点切换，避免 useInput 竞态 |

### UI 与 Agent 的连接

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│     App     │────▶│    Agent    │────▶│  Pipeline   │
└─────────────┘     └─────────────┘     └─────────────┘
       │                                       │
       │                                       │
       ▼                                       ▼
┌─────────────────────────────────────────────────────┐
│              ConfirmationHandler                     │
│  (传递给 context → Pipeline → ConfirmationStage)    │
└─────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────┐
│Confirmation │
│   Prompt    │
└─────────────┘
```

---

## 9.9 本章遗留项

::: info 以下功能将在后续章节实现
根据项目规划，UI 组件的完整集成需要 Zustand Store 支持，将在第 11 章完成。
:::

| 功能 | 说明 | 计划章节 |
|------|------|----------|
| **App.tsx 切换到 ClawdInterface** | 使用完整主界面替换简化版 MainInterface | 第 11 章 |
| **集成 MessageArea/InputArea** | 使用新组件替换 ink-text-input | 第 11 章 |
| **集成 LoadingIndicator/ChatStatusBar** | 使用完整的状态显示组件 | 第 11 章 |

### 当前状态

本章实现的 UI 组件是**独立完整**的：

- ✅ ThemeManager 主题系统
- ✅ ConfirmationPrompt 确认提示（内联渲染，极简风格）
- ✅ MessageRenderer 消息渲染（含 ToolCallLine、Thinking 折叠）
- ✅ Markdown 解析器（支持 filePath、缩进代码块）
- ✅ CodeHighlighter（含文件路径展示和 `/copy` 提示）
- ✅ ErrorBoundary 错误边界
- ✅ 常用 Hooks（useTerminalWidth、useConfirmation 同步焦点等）
- ✅ ClawdInterface 完整主界面组件（AbortController、Tool Call Display）

### 项目中已有的完整实现

本章讲解的 `App.tsx` 是**简化的教学版本**。项目中实际存在功能更完整的 `ClawdInterface` 组件：

**文件位置**：`src/ui/components/ClawdInterface.tsx`

| 特性 | App.tsx（教学版） | ClawdInterface（完整版） |
|------|-------------------|--------------------------|
| **焦点管理** | ❌ 无 | ✅ FocusManager |
| **输入缓冲** | 基础 TextInput | ✅ useInputBuffer + 光标控制 |
| **命令历史** | ❌ 无 | ✅ useCommandHistory (↑↓ 键) |
| **状态栏** | ❌ 无 | ✅ ChatStatusBar |
| **布局结构** | 简单 Box | ✅ 分层组件 |
| **代码复杂度** | ~150 行 | ~250 行 |

### 本教程未详细讲解的组件

以下组件在项目中**已完整实现**，将在第 11 章集成：

```
src/ui/
├── components/
│   ├── ClawdInterface.tsx        # ← 完整主界面（第 11 章集成）
│   ├── input/
│   │   ├── InputArea.tsx         # 带光标控制的输入区域
│   │   └── CustomTextInput.tsx   # 增强的文本输入组件
│   └── layout/
│       ├── ChatStatusBar.tsx     # 状态栏（模型、会话、主题）
│       └── MessageArea.tsx       # 消息区域布局
├── hooks/
│   ├── useCommandHistory.ts      # 命令历史（↑↓ 键浏览）
│   └── useInputBuffer.ts         # 输入缓冲 + 光标位置
└── focus/
    ├── FocusManager.ts           # 焦点管理器
    └── useFocus.ts               # 焦点 Hook
```

### 为什么教程使用简化版 App.tsx？

1. **降低学习门槛** - App.tsx 约 150 行，ClawdInterface 约 250 行
2. **聚焦核心概念** - 理解 Agent + UI 的基本交互模式
3. **渐进式学习** - 掌握基础后在第 11 章学习完整集成

---

## 下一章预告

在 **第十章** 中，我们将：
1. 深入理解 MCP（Model Context Protocol）
2. 实现 MCP 客户端
3. 集成外部工具服务
4. 支持动态工具注册

这将让 ClawdCode 能够连接更多外部工具和服务！

::: tip 后续章节规划
- **第 11 章**：完整集成（Zustand Store、ClawdInterface 集成、Agent + ContextManager + UI 连接）
- **第 12 章**：进阶功能（HookManager、诊断命令、Subagent 等）
:::
