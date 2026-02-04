# 第九章：UI 系统（React + Ink）

命令行界面（CLI）通常给人以"黑底白字"的刻板印象。但现代 CLI 工具如 Claude Code 已经将终端体验提升到了新高度——语法高亮、Markdown 渲染、主题切换、动态加载动画……本章将深入讲解如何使用 **React + Ink** 构建专业的终端 UI。

## 9.1 为什么选择 Ink？

### 传统 CLI 开发的痛点

```javascript
// 传统方式：手动拼接字符串
console.log('\x1b[32m✓\x1b[0m File saved: ' + filename)
console.log('\x1b[31m✗\x1b[0m Error: ' + message)

// 问题：
// 1. ANSI 转义码难以维护
// 2. 布局计算复杂
// 3. 状态管理混乱
// 4. 无法复用组件
```

### Ink 的优势

**Ink** 是 React 在终端的渲染器，让你可以用 React 组件模型构建 CLI：

```typescript
// Ink 方式：声明式 UI
const App = () => (
  <Box flexDirection="column">
    <Text color="green">✓ File saved: {filename}</Text>
    <Text color="red">✗ Error: {message}</Text>
  </Box>
);
```

| 特性     | 传统 CLI    | Ink                    |
| -------- | ----------- | ---------------------- |
| 组件复用 | ❌ 手动复制 | ✅ React 组件          |
| 状态管理 | ❌ 全局变量 | ✅ useState/Zustand    |
| 布局系统 | ❌ 手动计算 | ✅ Flexbox             |
| 样式系统 | ❌ ANSI 码  | ✅ color/bold/dimColor |
| 生态     | ❌ 碎片化   | ✅ npm 丰富组件        |

### 核心依赖

```json
{
  "dependencies": {
    "ink": "^6.0.0",
    "ink-select-input": "^6.0.0",
    "ink-spinner": "^5.0.0",
    "ink-text-input": "^6.0.0",
    "react": "^19.0.0",
    "lowlight": "^3.0.0",
    "string-width": "^7.0.0"
  }
}
```

## 9.2 整体架构

### UI 组件层次（当前实现）

```入口层
├── main.tsx (CLI 入口，yargs 解析)
└── App.tsx
    └── App (ErrorBoundary 包装)
        └── AppWrapper (版本检查 + 初始化)
            └── MainInterface (当前主界面)
                ├── MessageRenderer (消息渲染)
                │   ├── CodeHighlighter (代码高亮)
                │   ├── Heading (标题)
                │   ├── ListItem (列表)
                │   ├── TableRenderer (表格，内部组件)
                │   ├── Blockquote (引用)
                │   └── InlineText (内联格式：粗体/斜体/代码)
                ├── TextInput (ink-text-input)
                └── Spinner (ink-spinner)
```

### 组件目录结构

```
src/ui/components/
├── common/              # 通用组件
│   ├── ErrorBoundary.tsx    # 错误边界
│   └── LoadingIndicator.tsx # 加载指示器
├── input/               # 输入组件
│   ├── CustomTextInput.tsx  # 自定义输入框（光标可控）
│   └── InputArea.tsx        # 输入区域（含提示符）
├── markdown/            # Markdown 渲染
│   ├── CodeHighlighter.tsx  # 代码语法高亮
│   ├── MessageRenderer.tsx  # 消息渲染器
│   ├── parser.ts            # Markdown 解析器
│   └── types.ts             # 类型定义
├── dialog/              # 对话框组件
│   ├── ConfirmationPrompt.tsx # 权限确认
│   └── UpdatePrompt.tsx       # 版本更新提示
├── layout/              # 布局组件
│   ├── ChatStatusBar.tsx    # 状态栏
│   └── MessageArea.tsx      # 消息列表
├── ClawdInterface.tsx   # 主界面协调组件（顶层）
└── index.ts             # 统一导出
```

> **注意**：`ClawdInterface` 是更完整的主界面实现，包含焦点管理和自定义 Hooks 集成。当前 `App.tsx` 使用简化的 `MainInterface`，待后续章节集成。

### 数据流（当前）

```用户输入 ──> MainInterface
                │
                ↓
             Agent.chat()
                │
                ↓
          contextRef (本地状态)
                │
                ↓
          setUIMessages (更新 UI)
```

### 数据流（目标：Zustand 集成后）

```Zustand Store ──订阅──> UI 组件
      ↑                    │
      │                    ↓
   Agent <──调用── useCommandHandler
      │
      └──更新消息──> Store
```

## 9.3 AppWrapper - 应用初始化

`AppWrapper` 是 UI 的入口组件，当前负责：

1. 等待版本检查完成（与 yargs 解析并行）
2. 显示版本更新提示（如果有新版本）
3. 初始化主界面

```typescript
const AppWrapper: React.FC<AppProps> = (props) => {
  const { versionCheckPromise, ...mainProps } = props;

  const [isReady, setIsReady] = useState(false);
  const [versionInfo, setVersionInfo] = useState<VersionCheckResult | null>(null);
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);

  useEffect(() => {
    const initialize = async () => {
      // 1. 等待版本检查完成
      if (versionCheckPromise) {
        try {
          const versionResult = await versionCheckPromise;
          if (versionResult?.shouldPrompt) {
            setVersionInfo(versionResult);
            setShowUpdatePrompt(true);
            return;
          }
        } catch (error) {
          // 版本检查失败，继续启动
        }
      }
      // 2. 无需更新，直接初始化
      setIsReady(true);
    };
    initialize();
  }, [versionCheckPromise]);

  // 显示版本更新提示
  if (showUpdatePrompt && versionInfo) {
    return <UpdatePrompt versionInfo={versionInfo} onComplete={() => setIsReady(true)} />;
  }

  if (!isReady) {
    return <Text color="yellow"><Spinner /> Starting ClawdCode...</Text>;
  }

  return <MainInterface {...mainProps} />;
};

// 导出带 ErrorBoundary 的 App
export const App: React.FC<AppProps> = (props) => (
  <ErrorBoundary>
    <AppWrapper {...props} />
  </ErrorBoundary>
);
```

> **未来优化**（第 11 章 Zustand 集成后）：
>
> - 加载配置文件
> - 合并 CLI 参数生成 RuntimeConfig
> - 初始化 Zustand Store
> - 切换为 `ClawdInterface`

## 9.4 主界面组件

### 当前：MainInterface（简化版）

`MainInterface` 是当前使用的主界面，功能包括：

- Agent 初始化和消息处理
- 会话恢复（`--continue` 参数）
- 主题颜色应用
- Markdown 消息渲染

```typescript
const MainInterface: React.FC<MainInterfaceProps> = ({
  apiKey, baseURL, model, initialMessage, debug, resumeSessionId
}) => {
  const terminalWidth = useTerminalWidth();
  const theme = themeManager.getTheme();

  // Agent 和上下文
  const agentRef = useRef<Agent | null>(null);
  const contextRef = useRef<ChatContext>({ ... });

  // 消息渲染使用 MessageRenderer
  return (
    <Box flexDirection="column">
      {uiMessages.map((msg, i) => (
        <MessageRenderer key={i} content={msg.content} role={msg.role} />
      ))}
    </Box>
  );
};
```

### 备用：ClawdInterface（完整版）

`ClawdInterface` 是更完整的实现，额外支持：

- 焦点管理系统（解决多组件键盘监听冲突）
- 模态框显示（确认对话框）
- 自定义 Hooks 集成（useInputBuffer, useCommandHistory）
- 自定义输入组件（CustomTextInput）

### 焦点管理机制

#### 为什么需要焦点管理？

在终端 UI 中，多个组件可能都想监听键盘输入：

```
┌─────────────────────────────────┐
│  主输入框 (监听所有按键)         │  ← 用户正常输入
├─────────────────────────────────┤
│  确认对话框 (监听 Y/N/Esc)       │  ← 弹出时需要接管输入
├─────────────────────────────────┤
│  主题选择器 (监听 ↑/↓/Enter)    │  ← 选择时需要接管输入
└─────────────────────────────────┘
```

**问题**：Ink 的 `useInput` 默认所有组件都会收到键盘事件，导致：
- 用户按 `Y` 确认，主输入框也收到了 `Y`
- 用户按 `↑` 选择，历史命令也被触发

**解决方案**：焦点管理系统 —— 同一时间只有一个组件"拥有焦点"并响应输入。

#### 实现

```typescript
// 1. 定义焦点 ID
export enum FocusId {
  MAIN_INPUT = 'main-input',
  CONFIRMATION_PROMPT = 'confirmation-prompt',
  THEME_SELECTOR = 'theme-selector',
}

// 2. 组件中使用
const focusActions = useFocusActions();
const currentFocus = useCurrentFocus();
const isFocused = currentFocus === FocusId.MAIN_INPUT;

// 3. 只有获得焦点时才响应输入
useInput((input, key) => {
  // 处理输入...
}, { isActive: isFocused });  // ← 关键：isActive 控制是否响应

// 4. 切换焦点（如弹出确认框时）
focusActions.setFocus(FocusId.CONFIRMATION_PROMPT);
```

#### 焦点切换流程

```
用户输入 "rm -rf /"
      ↓
Agent 调用 Bash 工具
      ↓
触发权限确认 → setFocus(CONFIRMATION_PROMPT)
      ↓
主输入框停止响应，确认框接管
      ↓
用户按 Y/N → setFocus(MAIN_INPUT)
      ↓
确认框关闭，主输入框恢复响应
```

## 9.5 MessageRenderer - 消息渲染

消息渲染是 UI 系统的核心，需要支持完整的 Markdown 格式：

### 支持的格式

| 格式     | 语法             | 渲染组件/函数   |
| -------- | ---------------- | --------------- |
| 代码块   | \`\`\`lang\`\`\` | CodeHighlighter |
| 表格     | \| col \|        | TableRenderer   |
| 标题     | # ## ###         | Heading         |
| 有序列表 | 1. item          | ListItem        |
| 无序列表 | - item           | ListItem        |
| 粗体     | **text**         | InlineText      |
| 斜体     | _text_           | InlineText      |
| 内联代码 | \`code\`         | InlineText      |
| 删除线   | ~~text~~         | InlineText      |
| 链接     | [text](url)      | InlineText      |

### 内联格式渲染

`InlineText` 组件负责解析和渲染内联格式，支持嵌套在文本块、列表项、表格单元格中：

```typescript
// 内联格式解析正则
const pattern = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))|(~~(.+?)~~)/g;

// 渲染示例
<InlineText content="这是 **粗体** 和 `代码`" theme={theme} />
```

### 表格宽度计算

表格需要正确处理中文等宽字符的显示宽度：

```typescript
import stringWidth from 'string-width'

// 去除 Markdown 格式后计算实际显示宽度
const stripMarkdownForWidth = (text: string): string => {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1') // **bold** → bold
    .replace(/`([^`]+)`/g, '$1') // `code` → code
}

// 使用 stringWidth 而非 string.length
const actualWidth = stringWidth(stripMarkdownForWidth(content))
// "中文".length = 2，但 stringWidth("中文") = 4
```

### Markdown 解析器

```typescript
const MARKDOWN_PATTERNS = {
  codeBlock: /^```(\w+)?\s*$/,
  heading: /^ *(#{1,4}) +(.+)/,
  ulItem: /^([ \t]*)([-*+]) +(.+)/,
  olItem: /^([ \t]*)(\d+)\. +(.+)/,
  hr: /^ *([-*_] *){3,} *$/,
  table: /^\|(.+)\|$/,
} as const

interface ParsedBlock {
  type: 'text' | 'code' | 'heading' | 'table' | 'list' | 'hr' | 'empty'
  content: string
  language?: string
  level?: number
  listType?: 'ul' | 'ol'
}

function parseMarkdown(content: string): ParsedBlock[] {
  // 解析逻辑...
}
```

## 9.6 CodeHighlighter - 代码高亮

使用 `lowlight`（highlight.js 的虚拟 DOM 版本）实现语法高亮：

```typescript
import { common, createLowlight } from 'lowlight';

const lowlight = createLowlight(common);

function highlightLine(line: string, language?: string): React.ReactNode {
  try {
    if (!language || !lowlight.registered(language)) {
      const result = lowlight.highlightAuto(line);
      return renderHastNode(result, syntaxColors);
    }
    const result = lowlight.highlight(language, line);
    return renderHastNode(result, syntaxColors);
  } catch {
    return <Text>{line}</Text>;
  }
}
```

### 性能优化

```typescript
// 仅高亮可见行，避免大代码块卡顿
if (lines.length > availableHeight) {
  hiddenLinesCount = lines.length - availableHeight
  lines = lines.slice(hiddenLinesCount)
}
```

| 代码行数 | 优化前 | 优化后 | 提升 |
| -------- | ------ | ------ | ---- |
| 1000 行  | 150ms  | 15ms   | 90%  |
| 5000 行  | 800ms  | 15ms   | 98%  |

## 9.7 主题系统

### Theme 类型定义

```typescript
export interface BaseColors {
  primary: string
  secondary: string
  accent: string
  success: string
  warning: string
  error: string
  text: {
    primary: string
    secondary: string
    muted: string
  }
  background: {
    primary: string
    secondary: string
  }
  border: {
    light: string
    dark: string
  }
  syntax: SyntaxColors
}

export interface SyntaxColors {
  comment: string
  string: string
  number: string
  keyword: string
  function: string
  variable: string
  operator: string
  type: string
  default: string
}

export interface Theme {
  name: string
  colors: BaseColors
  spacing: { xs: number; sm: number; md: number; lg: number; xl: number }
}
```

### ThemeManager

```typescript
export class ThemeManager {
  private currentTheme: Theme = defaultTheme
  private themes: Map<string, Theme> = new Map()

  setTheme(themeName: string): void {
    const theme = this.themes.get(themeName)
    if (theme) {
      this.currentTheme = theme
    }
  }

  getTheme(): Theme {
    return this.currentTheme
  }

  getAvailableThemes(): string[] {
    return Array.from(this.themes.keys())
  }
}

export const themeManager = new ThemeManager()
```

## 9.8 确认对话框

```typescript
export const ConfirmationPrompt: React.FC<ConfirmationPromptProps> = ({
  details,
  onResponse,
}) => {
  const currentFocus = useCurrentFocus();
  const isFocused = currentFocus === FocusId.CONFIRMATION_PROMPT;

  useInput(
    (input, key) => {
      if (key.escape) {
        onResponse({ approved: false, reason: '用户取消' });
        return;
      }
      const lowerInput = input.toLowerCase();
      if (lowerInput === 'y') {
        onResponse({ approved: true, scope: 'once' });
      } else if (lowerInput === 's') {
        onResponse({ approved: true, scope: 'session' });
      } else if (lowerInput === 'n') {
        onResponse({ approved: false, reason: '用户拒绝' });
      }
    },
    { isActive: isFocused }
  );

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow">
      <Text bold color="yellow">🔔 Confirmation Required</Text>
      <Text>{details.message}</Text>
      {/* 选项 */}
    </Box>
  );
};
```

## 9.9 自定义 Hooks

### useTerminalWidth

```typescript
export const useTerminalWidth = () => {
  const [width, setWidth] = useState(process.stdout.columns || 80)

  useEffect(() => {
    const handleResize = () => {
      setWidth(process.stdout.columns || 80)
    }
    process.stdout.on('resize', handleResize)
    return () => {
      process.stdout.off('resize', handleResize)
    }
  }, [])

  return width
}
```

### useCommandHistory

```typescript
export const useCommandHistory = () => {
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)

  const addToHistory = useCallback((command: string) => {
    if (command.trim()) {
      setHistory((prev) => [...prev, command])
    }
    setHistoryIndex(-1)
  }, [])

  const getPreviousCommand = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1
      setHistoryIndex(newIndex)
      return history[history.length - 1 - newIndex]
    }
    return null
  }, [history, historyIndex])

  return { addToHistory, getPreviousCommand, getNextCommand }
}
```

## 9.10 踩坑记录

### 坑 1：ink-text-input 光标位置无法控制

**问题**：第三方 `ink-text-input` 无法程序化控制光标位置。

**解决方案**：实现自定义 `CustomTextInput` 组件，使用 `chalk.inverse` 渲染光标。

### 坑 2：Ink useInput 冲突

**问题**：多个组件同时使用 `useInput` 会产生冲突。

**解决方案**：使用 `isActive` 参数控制：

```typescript
useInput((input) => { ... }, { isActive: isFocused });
```

### 坑 3：代码高亮性能问题

**问题**：大型代码块渲染时间过长。

**解决方案**：智能截断，只高亮可见行。

### 坑 4：表格宽度计算错误

**问题**：中文字符和 Markdown 标记导致宽度计算错误，表格列无法对齐。

- `"中文".length` = 2，但终端实际显示占 4 列宽
- `"**粗体**".length` = 8，但显示时只有 2 列宽（格式符号不显示）

**解决方案**：

```typescript
import stringWidth from 'string-width'

// 1. 去除 Markdown 格式符号
const stripped = text.replace(/\*\*(.+?)\*\*/g, '$1')

// 2. 使用 stringWidth 计算实际显示宽度
const width = stringWidth(stripped) // 正确处理 CJK 字符
```

### 坑 5：内联格式未渲染

**问题**：Markdown 块解析后，文本块和列表项内的 `**粗体**`、`` `代码` `` 没有渲染。

**原因**：`TextBlock` 组件直接输出原始文本，没有调用内联格式解析。

**解决方案**：创建 `InlineText` 组件处理内联格式，并在所有文本输出位置使用：

```typescript
// TextBlock 组件
const TextBlock = ({ content, theme }) => (
  <Text wrap="wrap">
    <InlineText content={content} theme={theme} />  {/* ← 关键 */}
  </Text>
);

// ListItem 组件也要用
const ListItem = ({ content, theme }) => (
  <Box>
    <Text>{marker} </Text>
    <InlineText content={content} theme={theme} />  {/* ← 关键 */}
  </Box>
);
```

### 坑 6：表格单元格内联格式

**问题**：表格渲染时单元格内的 `**粗体**` 没有生效。

**原因**：`TableRenderer` 直接用 `<Text>` 渲染单元格内容。

**解决方案**：检测单元格是否包含内联格式，有则用 `InlineText` 渲染：

```typescript
const hasInlineFormat = /\*\*|`|~~/.test(cellContent);
return hasInlineFormat 
  ? <InlineText content={cellContent} theme={theme} />
  : <Text>{cellContent}</Text>;
```

### 坑 7：粘贴检测误判

**问题**：终端将粘贴文本拆分为多个小块。

**解决方案**：分片合并 + 启发式检测（时间间隔、文本长度）。

### 坑 8：主题切换后组件未重新渲染

**问题**：`ThemeManager` 单例模式不触发重渲染。

**解决方案**：使用 Zustand Store 管理主题状态（待第 11 章实现）。

---

## 测试方法

### 1. 基础测试

```bash
# 构建
bun run build

# 启动（默认主题）
bun run start "你好"
```

### 2. 主题切换测试

```bash
# 使用 --theme 或 -t 参数切换主题
bun run start --theme dark "写一段代码"
bun run start -t ocean "写一段代码"
bun run start --theme forest "写一段代码"
bun run start --theme sunset "写一段代码"

# 查看可用主题
bun run start --help
```

**可用主题：**

| 主题      | 说明               |
| --------- | ------------------ |
| `default` | 浅色主题（蓝色调） |
| `dark`    | 暗色主题           |
| `ocean`   | 深蓝海洋主题       |
| `forest`  | 绿色森林主题       |
| `sunset`  | 暖色日落主题       |

### 3. Markdown 渲染测试

```bash
# 测试代码高亮
bun run start "写一段 TypeScript 代码，包含类和接口"

# 测试表格渲染
bun run start "用表格对比 React 和 Vue"

# 测试列表渲染
bun run start "列出 5 个 JavaScript 最佳实践"
```

### 4. 代码高亮测试

让 Agent 生成不同语言的代码，观察语法高亮：

```bash
bun run start "分别用 Python、Go、Rust 写一个 Hello World"
```

**预期效果：**

- 关键字（function、class、if）高亮
- 字符串（"hello"）不同颜色
- 数字（123）不同颜色
- 注释（// comment）暗色
- 行号显示

### 5. 会话恢复（待实现）

> **注意**：`--continue` 参数的 CLI 解析和加载逻辑已实现，但消息**保存**逻辑需要第 11 章"Agent 集成 ContextManager"完成后才能正常工作。

---

## 本章新增功能清单

| 功能          | CLI 参数                        | 说明                               |
| ------------- | ------------------------------- | ---------------------------------- |
| 主题切换      | `--theme <name>` 或 `-t <name>` | 切换 UI 颜色主题                   |
| Markdown 渲染 | 自动                            | 代码块、表格、列表、标题、引用     |
| 内联格式      | 自动                            | **粗体**、_斜体_、`代码`、~~删除~~ |
| 代码高亮      | 自动                            | 140+ 语言语法高亮                  |
| 行号显示      | 自动                            | 代码块显示行号                     |
| CJK 对齐      | 自动                            | 表格正确处理中文宽度               |

---

## 技术亮点

1. **React + Ink**：声明式 CLI UI，复用 React 生态
2. **Flexbox 布局**：终端中使用现代布局系统
3. **焦点管理**：解决多组件键盘监听冲突
4. **性能优化**：智能截断大代码块（只渲染可见行）
5. **主题系统**：5 个预设主题，支持自定义扩展
6. **Markdown 渲染**：完整支持常用格式（标题、列表、表格、代码块）
7. **内联格式**：支持粗体、斜体、代码、删除线、链接
8. **CJK 字符支持**：使用 `string-width` 正确计算中文等宽字符的显示宽度
9. **lowlight 语法高亮**：基于 highlight.js，支持 140+ 语言

---

## 常见问题

**Q: 为什么不用 blessed/blessed-contrib？**

A: blessed 是命令式 API，代码冗长且难以维护。Ink 使用 React 声明式模型，更易于组件化和状态管理。

**Q: Ink 支持哪些终端？**

A: 支持所有兼容 ANSI 转义码的终端，包括 macOS Terminal、iTerm2、Windows Terminal、VS Code 内置终端等。

**Q: 如何处理终端不支持颜色的情况？**

A: Ink 内部会检测终端能力，自动降级。也可以通过 `NO_COLOR` 环境变量强制禁用颜色。
