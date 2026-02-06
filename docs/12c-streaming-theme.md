# 第 12c 章：流式输出与主题持久化

> 本章实现流式输出显示、思考过程渲染、UI 渲染优化和主题持久化功能。

## 12c.1 概述

本章解决三个问题：

1. **流式输出**：实时显示 LLM 的响应内容和思考过程
2. **渲染优化**：避免输入和流式输出时的 UI 闪烁
3. **主题持久化**：自动检测终端颜色模式，保存用户主题偏好

## 12c.2 流式输出

### StreamCallbacks 类型

```typescript
// src/agent/types.ts

export interface StreamCallbacks {
  onContentDelta?: (delta: string) => void;
  onThinkingDelta?: (delta: string) => void;
  onToolCallStart?: (toolCall: Partial<ToolCall>) => void;
  onToolCallDelta?: (toolCallId: string, argumentsDelta: string) => void;
}
```

### ChatService 流式处理

```typescript
// src/services/ChatService.ts

const stream = await this.client.chat.completions.create(
  { ...requestParams, stream: true },
  { signal }
);

for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta;
  
  if (delta.content) {
    content += delta.content;
    streamCallbacks?.onContentDelta?.(delta.content);
  }
  
  // 处理思考内容（DeepSeek R1 等）
  const reasoning = (delta as any).reasoning_content || (delta as any).thinking;
  if (reasoning) {
    reasoningContent += reasoning;
    streamCallbacks?.onThinkingDelta?.(reasoning);
  }
}
```

### Store 流式消息管理

```typescript
// src/store/slices/sessionSlice.ts

startStreamingMessage: () => string;  // 创建占位消息
appendToStreamingMessage: (id: string, delta: string) => void;
appendThinkingToStreamingMessage: (id: string, delta: string) => void;
finishStreamingMessage: (id: string) => void;
```

## 12c.3 渲染优化

### 节流更新器

```typescript
// src/ui/components/ClawdInterface.tsx

function createThrottledStreamUpdater(
  updateContent: (delta: string) => void,
  updateThinking: (delta: string) => void,
  intervalMs: number = 50
) {
  let contentBuffer = '';
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    appendContent: (delta: string) => {
      contentBuffer += delta;
      if (!timer) timer = setTimeout(flush, intervalMs);
    },
    flush: () => { /* ... */ },
  };
}
```

### 细粒度选择器

```typescript
// src/store/selectors.ts

export const useMessageCount = () =>
  useClawdStore((state) => state.session.messages.length);

export const useMessageById = (id: string) =>
  useClawdStore((state) => state.session.messages.find(m => m.id === id));

export const useMessageIds = () =>
  useClawdStore(useShallow((state) => state.session.messages.map(m => m.id)));
```

## 12c.4 主题持久化

### 终端颜色模式检测

```typescript
// src/ui/themes/ThemeManager.ts

function detectColorMode(): ColorMode {
  // macOS 系统级检测
  if (process.platform === 'darwin') {
    const result = execSync('defaults read -g AppleInterfaceStyle 2>/dev/null');
    if (result.trim() === 'Dark') return 'dark';
    return 'light';
  }
  
  // COLORFGBG 环境变量
  // VS Code 集成终端
  // ...
  
  return 'unknown';
}
```

### ConfigManager 主题读写

```typescript
// src/config/ConfigManager.ts

getTheme(): string | null {
  // 优先读取用户配置（~/.clawdcode/config.json）
  // 返回 null 表示应自动检测
}

saveTheme(themeName: string): void {
  // 同步写入用户配置
}
```

### 主题初始化流程

```typescript
// src/main.tsx

// 1. 从用户配置加载，或自动检测
themeManager.initializeFromConfig();

// 2. CLI 参数覆盖（--theme）
if (args.theme) {
  themeManager.setTheme(args.theme);
}
```

## 12c.5 Ctrl+C 中断机制

使用 `AbortController` 实现 Ctrl+C 完整中断流式输出和 Agent 思考过程：

```typescript
// ClawdInterface.tsx
const abortControllerRef = useRef<AbortController | null>(null);

// 开始处理消息时创建 controller
const abortController = new AbortController();
abortControllerRef.current = abortController;

// 传递 signal 给 Agent
await agent.chat(messages, {
  ...callbacks,
  signal: abortController.signal,
});

// Ctrl+C 中断
useCtrlCHandler({
  onInterrupt: () => {
    abortControllerRef.current?.abort();
    streamUpdaterRef.current?.clear();
    sessionActions().finishStreamingMessage(streamingMessageIdRef.current);
  },
});
```

### Agent 端 signal 检查

```typescript
// Agent.ts executeLoop
for (const toolCall of toolCalls) {
  if (options?.signal?.aborted) break;  // 每次工具调用前检查
  // ...
}
```

### Stream 回调 abort guard

```typescript
onContentDelta: (delta) => {
  if (abortController.signal.aborted) return;  // 跳过已中断的回调
  streamUpdater.appendContent(delta);
},
```

## 12c.6 Thinking 折叠与展开

思考块（reasoning/thinking content）在流式输出完成后自动折叠，用户可手动展开：

```typescript
// MessageRenderer.tsx
const [localExpanded, setLocalExpanded] = useState(true);  // 流式中展开

// 流式结束后自动折叠
useEffect(() => {
  if (!hasStreamingMessage) setLocalExpanded(false);
}, [hasStreamingMessage]);

// 最终展开状态 = 全局开关 OR 局部状态
const isThinkingExpanded = showAllThinking || localExpanded;
```

**折叠态显示**：`▸ thought · N lines · preview...`，点击可展开。

`/thinking` 命令切换全局 `showAllThinking` 状态（Zustand store）。

## 12c.7 Status Bar 优化

```typescript
// ChatStatusBar.tsx
// Theme 名 - 使用 accent 色
<Text color={theme.colors.accent}>{themeName}</Text>

// Session ID - 完整显示（不截断）+ info 色 dimColor
<Text color={theme.colors.info} dimColor>{sessionId}</Text>
```

## 12c.8 Tool Call 显示

Agent 执行工具时，ClawdInterface 通过 `onToolCallStart` / `onToolResult` 回调在流式消息中追加紧凑日志：

```typescript
onToolCallStart: (toolCall) => {
  const summary = `  ${toolCall.name} ${formatToolArgs(toolCall)}`;
  streamUpdater.appendContent(`\n${summary}`);
},
onToolResult: (toolCall, result) => {
  const mark = result.success ? '✓' : `✗ ${brief(result.error)}`;
  streamUpdater.appendContent(` ${mark}\n`);
},
```

MessageRenderer 中 `ToolCallLine` 组件检测 `TOOLCALL_RE` 正则，以 dim 样式渲染，与正文形成视觉差异。

## 12c.9 新增/修改文件

| 文件 | 说明 |
|------|------|
| `src/agent/types.ts` | 添加 StreamCallbacks |
| `src/agent/Agent.ts` | signal 检查、连续失败检测、拒绝即停 |
| `src/services/ChatService.ts` | 流式请求处理 |
| `src/store/slices/sessionSlice.ts` | 流式消息 actions |
| `src/store/slices/appSlice.ts` | showAllThinking state |
| `src/store/selectors.ts` | 细粒度选择器、useShowAllThinking |
| `src/ui/components/ClawdInterface.tsx` | AbortController、tool call display、内联确认 |
| `src/ui/components/layout/ChatStatusBar.tsx` | 颜色修正、sid 完整显示 |
| `src/ui/components/markdown/MessageRenderer.tsx` | Thinking 折叠、ToolCallLine |
| `src/ui/components/markdown/CodeHighlighter.tsx` | filePath 显示、/copy 提示 |
| `src/ui/components/markdown/parser.ts` | parseCodeBlockSpec、缩进代码块 |
| `src/ui/components/dialog/ConfirmationPrompt.tsx` | 内联极简风格 |
| `src/ui/components/input/CommandSuggestions.tsx` | 极简化、MAX_VISIBLE=10 |
| `src/ui/components/input/InputArea.tsx` | Thinking indicator 上方显示 |
| `src/ui/hooks/useConfirmation.ts` | 同步焦点切换 |
| `src/ui/themes/ThemeManager.ts` | 颜色模式检测、初始化逻辑 |
| `src/ui/themes/lightTheme.ts` | 新增，亮色主题 |
| `src/config/ConfigManager.ts` | getTheme、saveTheme |
| `src/slash-commands/builtinCommands.ts` | /copy、/thinking、英文化 |
| `src/prompts/default.ts` | 代码块路径指令 |

## 12c.10 测试方法

### 1. 测试流式输出

```bash
node dist/main.js
```

发送任意消息，观察：
- 内容逐字显示（非一次性输出）
- 显示流式光标 `▌`
- 完成后光标消失

### 2. 测试思考过程（需支持 reasoning 的模型）

使用 DeepSeek 等支持 reasoning 的模型：

```bash
node dist/main.js --model deepseek-reasoner
```

发送消息后应显示：
- 灰色的思考过程
- 正常颜色的最终回复

### 3. 测试主题自动检测

```bash
# 清除已保存的主题
rm -f ~/.clawdcode/config.json

# 启动（应自动检测终端颜色模式）
node dist/main.js --debug
```

Debug 输出应显示：
```
[DEBUG] Detected color mode: dark/light
[DEBUG] Theme initialized to: ...
```

### 4. 测试主题持久化

```bash
# 选择主题
node dist/main.js
/theme light

# 退出后重启
node dist/main.js --debug
```

Debug 输出应显示：
```
[DEBUG] Loaded user theme from config: light
```

### 5. 测试 CLI 主题覆盖

```bash
# 即使保存了 light，CLI 参数应覆盖
node dist/main.js --theme dark --debug
```

应显示 dark 主题生效。

### 6. 测试亮色终端

在亮色背景终端中启动，验证：
- 文字颜色可读
- 自动检测到 `light` 模式
