# 第 15 章：流式输出与主题持久化

> 本章实现流式输出显示、思考过程渲染、UI 渲染优化和主题持久化功能。

## 15.1 概述

本章主要解决三个问题：

1. **流式输出**：实时显示 LLM 的响应内容和思考过程
2. **渲染优化**：避免输入和流式输出时的 UI 闪烁
3. **主题持久化**：自动检测终端颜色模式，保存用户主题偏好

## 15.2 流式输出实现

### 类型定义扩展

```typescript
// src/agent/types.ts

/**
 * 流式回调选项
 */
export interface StreamCallbacks {
  /** 内容增量回调 */
  onContentDelta?: (delta: string) => void;
  /** 思考内容增量回调 */
  onThinkingDelta?: (delta: string) => void;
  /** 工具调用开始回调 */
  onToolCallStart?: (toolCall: Partial<ToolCall>) => void;
  /** 工具调用参数增量回调 */
  onToolCallDelta?: (toolCallId: string, argumentsDelta: string) => void;
}

/**
 * IChatService 接口更新
 */
export interface IChatService {
  chat(
    messages: Message[],
    tools?: ToolDefinition[],
    signal?: AbortSignal,
    streamCallbacks?: StreamCallbacks  // 新增
  ): Promise<ChatResponse>;
}
```

### ChatService 流式处理

```typescript
// src/services/ChatService.ts

async chat(
  messages: Message[],
  tools?: ToolDefinition[],
  signal?: AbortSignal,
  streamCallbacks?: StreamCallbacks
): Promise<ChatResponse> {
  // 构建请求参数
  const requestParams: OpenAI.ChatCompletionCreateParams = {
    model: this.model,
    messages: openaiMessages,
    stream: true,  // 启用流式输出
  };

  // 发送流式请求
  const stream = await this.client.chat.completions.create(
    requestParams,
    { signal }
  );

  // 收集完整响应
  let content = '';
  let reasoningContent = '';
  const toolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();

  // 处理流式响应
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    if (!delta) continue;

    // 处理内容增量
    if (delta.content) {
      content += delta.content;
      streamCallbacks?.onContentDelta?.(delta.content);
    }

    // 处理思考内容增量（DeepSeek R1 / Claude 等模型）
    const reasoning = (delta as Record<string, unknown>).reasoning_content 
      || (delta as Record<string, unknown>).thinking
      || (delta as Record<string, unknown>).reasoning;
    if (reasoning && typeof reasoning === 'string') {
      reasoningContent += reasoning;
      streamCallbacks?.onThinkingDelta?.(reasoning);
    }

    // 处理工具调用增量
    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const index = tc.index;
        
        if (!toolCalls.has(index)) {
          // 新的工具调用
          toolCalls.set(index, {
            id: tc.id || '',
            name: tc.function?.name || '',
            arguments: tc.function?.arguments || '',
          });
          
          if (tc.id && tc.function?.name) {
            streamCallbacks?.onToolCallStart?.({
              id: tc.id,
              type: 'function',
              function: { name: tc.function.name, arguments: '' },
            });
          }
        } else {
          // 更新现有工具调用
          const existing = toolCalls.get(index)!;
          if (tc.function?.arguments) {
            existing.arguments += tc.function.arguments;
            streamCallbacks?.onToolCallDelta?.(existing.id, tc.function.arguments);
          }
        }
      }
    }
  }

  return { content, reasoningContent, toolCalls: Array.from(toolCalls.values()), usage };
}
```

### Store 流式消息管理

```typescript
// src/store/slices/sessionSlice.ts

/**
 * 开始流式助手消息（创建空消息占位）
 */
startStreamingMessage: () => {
  const id = `assistant-${generateId()}`;
  const message: SessionMessage = {
    id,
    role: 'assistant',
    content: '',
    thinking: '',
    timestamp: Date.now(),
    isStreaming: true,
  };
  set((state) => ({
    session: {
      ...state.session,
      messages: [...state.session.messages, message],
    },
  }));
  return id;
},

/**
 * 追加内容到流式消息
 */
appendToStreamingMessage: (id: string, contentDelta: string) => {
  set((state) => ({
    session: {
      ...state.session,
      messages: state.session.messages.map(msg =>
        msg.id === id
          ? { ...msg, content: msg.content + contentDelta }
          : msg
      ),
    },
  }));
},

/**
 * 追加思考内容到流式消息
 */
appendThinkingToStreamingMessage: (id: string, thinkingDelta: string) => {
  set((state) => ({
    session: {
      ...state.session,
      messages: state.session.messages.map(msg =>
        msg.id === id
          ? { ...msg, thinking: (msg.thinking || '') + thinkingDelta }
          : msg
      ),
    },
  }));
},

/**
 * 完成流式消息
 */
finishStreamingMessage: (id: string) => {
  set((state) => ({
    session: {
      ...state.session,
      messages: state.session.messages.map(msg =>
        msg.id === id ? { ...msg, isStreaming: false } : msg
      ),
    },
  }));
},
```

## 15.3 UI 渲染优化

### 节流更新器

为避免流式输出时频繁重绘导致闪烁，使用节流机制批量更新：

```typescript
// src/ui/components/ClawdInterface.tsx

/**
 * 创建节流的流式更新器
 * 累积 delta 内容，定期批量更新 UI，避免频繁重绘
 */
function createThrottledStreamUpdater(
  updateContent: (delta: string) => void,
  updateThinking: (delta: string) => void,
  intervalMs: number = 50
) {
  let contentBuffer = '';
  let thinkingBuffer = '';
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (contentBuffer) {
      updateContent(contentBuffer);
      contentBuffer = '';
    }
    if (thinkingBuffer) {
      updateThinking(thinkingBuffer);
      thinkingBuffer = '';
    }
    timer = null;
  };

  return {
    appendContent: (delta: string) => {
      contentBuffer += delta;
      if (!timer) {
        timer = setTimeout(flush, intervalMs);
      }
    },
    appendThinking: (delta: string) => {
      thinkingBuffer += delta;
      if (!timer) {
        timer = setTimeout(flush, intervalMs);
      }
    },
    flush: () => {
      if (timer) clearTimeout(timer);
      flush();
    },
    clear: () => {
      contentBuffer = '';
      thinkingBuffer = '';
      if (timer) clearTimeout(timer);
    },
  };
}
```

### 细粒度状态选择器

避免订阅整个 messages 数组，使用细粒度选择器减少重新渲染：

```typescript
// src/store/selectors.ts

/**
 * 获取消息数量（避免订阅整个 messages 数组）
 */
export const useMessageCount = () =>
  useClawdStore((state) => state.session.messages.length);

/**
 * 获取单条消息（通过 id）
 */
export const useMessageById = (id: string) =>
  useClawdStore((state) => state.session.messages.find(m => m.id === id));

/**
 * 获取消息 ID 列表（浅比较）
 */
export const useMessageIds = () =>
  useClawdStore(useShallow((state) => state.session.messages.map(m => m.id)));

/**
 * 判断是否有流式消息
 */
export const useHasStreamingMessage = () =>
  useClawdStore((state) => state.session.messages.some(m => m.isStreaming));
```

### 组件状态隔离

将状态订阅下沉到子组件，避免父组件因无关状态变化而重新渲染：

```typescript
// 队列命令预览组件 - 自己订阅状态
const QueuedCommands: React.FC = React.memo(() => {
  const pendingCommands = usePendingCommands();
  // ...
});

// 加载指示器 - 自己订阅状态
const ThinkingIndicator: React.FC = React.memo(() => {
  const isThinking = useIsThinking();
  const hasStreamingMessage = useHasStreamingMessage();
  
  if (!isThinking || hasStreamingMessage) return null;
  return <LoadingIndicator />;
});

// MessageList 使用 ID 列表而非整个消息数组
const MessageList: React.FC = React.memo(({ terminalWidth }) => {
  const messageIds = useMessageIds();
  
  return (
    <Box flexDirection="column">
      {messageIds.map((id) => (
        <MessageItem key={id} id={id} terminalWidth={terminalWidth} />
      ))}
    </Box>
  );
});

// 单条消息组件 - 独立订阅自己的状态
const MessageItem: React.FC<{ id: string }> = React.memo(({ id, terminalWidth }) => {
  const message = useMessageById(id);
  if (!message) return null;
  return <MessageRenderer {...message} />;
});
```

### InputArea 自管理状态

输入组件完全自管理状态，包括命令历史，避免状态变化影响父组件：

```typescript
// src/ui/components/input/InputArea.tsx

export const InputArea: React.FC<InputAreaProps> = React.memo(({ onSubmit }) => {
  // 使用 ref 保持回调引用稳定
  const onSubmitRef = useRef(onSubmit);
  useEffect(() => { onSubmitRef.current = onSubmit; });

  // 自管理命令历史（使用 ref 避免状态变化传播到父组件）
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);

  const addToHistory = useCallback((command: string) => {
    if (command.trim()) {
      const history = historyRef.current;
      if (history[history.length - 1] !== command) {
        history.push(command);
        if (history.length > 100) history.shift();
      }
    }
    historyIndexRef.current = -1;
  }, []);

  // 自己订阅需要的状态
  const isProcessing = useIsThinking();
  const pendingCommands = usePendingCommands();

  // 输入状态完全在组件内部管理
  const [value, setValue] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  // ...
}, () => true); // 自定义比较函数：忽略 props 变化
```

### Ink 渲染配置

```typescript
// src/main.tsx

render(<App />, {
  exitOnCtrlC: false,     // 由 useCtrlCHandler 处理退出
  patchConsole: false,    // 禁用 console patch，减少闪烁
});
```

## 15.4 主题持久化

### 终端颜色模式检测

```typescript
// src/ui/themes/ThemeManager.ts

/**
 * 检测终端/系统的颜色模式
 * 
 * 检测顺序：
 * 1. macOS 系统级暗色模式
 * 2. COLORFGBG 环境变量（一些终端会设置）
 * 3. VS Code 集成终端
 */
function detectColorMode(): ColorMode {
  // 1. macOS 系统级检测
  if (process.platform === 'darwin') {
    try {
      const result = execSync('defaults read -g AppleInterfaceStyle 2>/dev/null', {
        encoding: 'utf-8',
        timeout: 1000,
      }).trim();
      if (result === 'Dark') return 'dark';
    } catch {
      // 命令失败或返回空，说明是亮色模式
      return 'light';
    }
  }

  // 2. 检查 COLORFGBG 环境变量
  // 格式: "foreground;background" 如 "15;0" (白字黑底)
  const colorFgBg = process.env.COLORFGBG;
  if (colorFgBg) {
    const parts = colorFgBg.split(';');
    if (parts.length >= 2) {
      const bg = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(bg)) {
        if (bg === 0 || bg <= 6) return 'dark';
        else if (bg === 7 || bg >= 8) return 'light';
      }
    }
  }

  // 3. VS Code 集成终端
  if (process.env.TERM_PROGRAM === 'vscode') {
    const themeKind = process.env.VSCODE_THEME_KIND;
    if (themeKind === 'vscode-dark') return 'dark';
    else if (themeKind === 'vscode-light') return 'light';
  }

  return 'unknown';
}
```

### 主题初始化逻辑

```typescript
// src/ui/themes/ThemeManager.ts

/**
 * 从配置中初始化主题
 * 
 * 优先级：
 * 1. 用户保存的主题（用户配置文件中）
 * 2. 自动检测终端颜色模式，选择合适的主题
 * 3. 使用默认主题
 */
initializeFromConfig(): void {
  if (this.initialized) return;
  
  try {
    const savedTheme = configManager.getTheme();
    
    // 如果用户之前保存过主题，使用保存的主题
    if (savedTheme && this.themes.has(savedTheme)) {
      this.currentTheme = this.themes.get(savedTheme)!;
      this.initialized = true;
      return;
    }
    
    // 没有用户保存的主题，自动检测终端颜色模式
    const colorMode = detectColorMode();
    
    if (colorMode === 'dark') {
      this.currentTheme = this.themes.get('dark')!;
    } else if (colorMode === 'light') {
      this.currentTheme = this.themes.get('light')!;
    }
    // colorMode === 'unknown' 时保持默认主题
    
    this.initialized = true;
  } catch {
    this.initialized = true;
  }
}
```

### ConfigManager 主题读写

```typescript
// src/config/ConfigManager.ts

/**
 * 获取主题
 * 
 * 优先级：用户配置 > 项目配置 > 默认
 * 用户主动设置的主题应该优先于项目配置
 */
getTheme(): string | null {
  // 优先读取用户配置中的主题（用户主动设置的）
  const userConfigPath = this.getUserConfigPath();
  
  if (fs.existsSync(userConfigPath)) {
    try {
      const content = fs.readFileSync(userConfigPath, 'utf-8');
      const userConfig = JSON.parse(content);
      
      if (userConfig.theme) return userConfig.theme;
      if (userConfig.ui?.theme) return userConfig.ui.theme;
    } catch {
      // 解析失败
    }
  }
  
  // 没有用户设置的主题，返回 null 表示应该自动检测
  return null;
}

/**
 * 保存主题到用户配置（同步方法，确保立即保存）
 */
saveTheme(themeName: string): void {
  const configPath = this.getUserConfigPath();
  
  // 读取现有配置或创建新配置
  let existingConfig: Partial<Config> = {};
  if (fs.existsSync(configPath)) {
    existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }

  // 更新主题
  existingConfig.theme = themeName;
  if (!existingConfig.ui) existingConfig.ui = {};
  existingConfig.ui.theme = themeName;

  // 同步写入文件
  fs.writeFileSync(configPath, JSON.stringify(existingConfig, null, 2), 'utf-8');
}
```

### CLI 参数调整

移除 `--theme` 的默认值，避免覆盖用户保存的主题：

```typescript
// src/cli/config.ts

theme: {
  alias: 't',
  type: 'string',
  choices: ['default', 'light', 'dark', 'ocean', 'forest', 'sunset'] as const,
  describe: 'Color theme for the UI (overrides saved preference)',
  // 注意：不设置 default，让用户配置优先
  group: 'UI Options:',
},
```

### 启动流程

```typescript
// src/main.tsx

// 1. 初始化主题（从用户配置加载，或自动检测终端颜色模式）
themeManager.initializeFromConfig();

// 2. CLI 参数覆盖（如果指定了 --theme）
if (args.theme && themeManager.hasTheme(args.theme)) {
  themeManager.setTheme(args.theme);
}

// 3. App.tsx 中不再重复设置主题，避免项目配置覆盖用户选择
```

## 15.5 MessageRenderer 思考过程显示

```typescript
// src/ui/components/markdown/MessageRenderer.tsx

interface MessageRendererProps {
  content: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  terminalWidth?: number;
  showPrefix?: boolean;
  thinking?: string;       // 思考过程内容
  isStreaming?: boolean;   // 是否正在流式输出
}

export const MessageRenderer: React.FC<MessageRendererProps> = ({
  content,
  role,
  thinking,
  isStreaming,
  // ...
}) => {
  // 渲染思考过程（如果有）
  const thinkingSection = useMemo(() => {
    if (!thinking) return null;
    
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text color={theme.colors.text.muted} dimColor>
          💭 思考过程：
        </Text>
        <Box marginLeft={2}>
          <Text color={theme.colors.text.muted} dimColor wrap="wrap">
            {thinking}
            {isStreaming && <Text color={theme.colors.primary}>▌</Text>}
          </Text>
        </Box>
      </Box>
    );
  }, [thinking, isStreaming]);

  return (
    <Box flexDirection="column">
      {thinkingSection}
      {/* 正常内容渲染 */}
      {blocks.map((block, index) => (
        <BlockRenderer key={index} block={block} theme={theme} />
      ))}
      {isStreaming && !thinking && (
        <Text color={theme.colors.primary}>▌</Text>
      )}
    </Box>
  );
};
```

## 15.6 主题优先级总结

```
用户选择的主题 (~/.clawdcode/config.json)
    ↓ 如果没有
自动检测终端颜色模式
    ↓ 如果无法检测
默认主题 (default)
```

**CLI `--theme` 参数**会覆盖上述所有，但只在当前会话有效。

## 15.7 Ctrl+C 中断机制

使用 `AbortController` 实现完整的流式输出和 Agent 中断：

```typescript
// ClawdInterface.tsx
const abortControllerRef = useRef<AbortController | null>(null);

// Ctrl+C 中断
useCtrlCHandler({
  onInterrupt: () => {
    abortControllerRef.current?.abort();
    streamUpdaterRef.current?.clear();
    sessionActions().finishStreamingMessage(streamingMessageIdRef.current);
  },
});
```

- Agent 端在每次工具调用前检查 `signal.aborted`
- Stream 回调中使用 abort guard 跳过已中断的回调

## 15.8 Thinking 折叠与展开

思考块在流式输出完成后自动折叠：

```typescript
const [localExpanded, setLocalExpanded] = useState(true);
useEffect(() => {
  if (!hasStreamingMessage) setLocalExpanded(false);
}, [hasStreamingMessage]);
const isThinkingExpanded = showAllThinking || localExpanded;
```

- 折叠态显示：`▸ thought · N lines · preview...`
- `/thinking` 命令切换全局 `showAllThinking` 状态

## 15.9 Status Bar 优化

- Theme 名使用 accent 色
- Session ID 完整显示（不截断）+ info 色 dimColor

## 15.10 Tool Call 显示

Agent 执行工具时，`onToolCallStart` / `onToolResult` 回调追加紧凑日志到流式消息。`ToolCallLine` 组件以 dim 样式渲染，与正文视觉区分：

```
  Read src/file.tsx ✓
  Bash git status ✓
  Write src/new.ts ✗ permission denied
```

## 15.11 修改的文件

| 文件 | 说明 |
|------|------|
| `src/agent/types.ts` | 添加 `StreamCallbacks` 类型 |
| `src/agent/Agent.ts` | signal 检查、连续失败检测、拒绝即停 |
| `src/services/ChatService.ts` | 实现流式请求处理 |
| `src/store/types.ts` | 添加 `thinking`、`isStreaming`、`showAllThinking` 字段 |
| `src/store/slices/sessionSlice.ts` | 添加流式消息管理 actions |
| `src/store/slices/appSlice.ts` | showAllThinking state |
| `src/store/selectors.ts` | 添加细粒度消息选择器、useShowAllThinking |
| `src/ui/components/ClawdInterface.tsx` | AbortController、tool call display、内联确认 |
| `src/ui/components/input/InputArea.tsx` | Thinking indicator 上方显示 |
| `src/ui/components/input/CommandSuggestions.tsx` | 极简化、MAX_VISIBLE=10 |
| `src/ui/components/layout/ChatStatusBar.tsx` | 颜色修正、sid 完整显示 |
| `src/ui/components/markdown/MessageRenderer.tsx` | Thinking 折叠、ToolCallLine |
| `src/ui/components/markdown/CodeHighlighter.tsx` | filePath 显示、/copy 提示 |
| `src/ui/components/markdown/parser.ts` | parseCodeBlockSpec、缩进代码块 |
| `src/ui/components/dialog/ConfirmationPrompt.tsx` | 内联极简风格 |
| `src/ui/hooks/useConfirmation.ts` | 同步焦点切换 |
| `src/ui/themes/ThemeManager.ts` | 添加颜色模式检测和初始化逻辑 |
| `src/ui/themes/types.ts` | 添加 `ColorMode` 类型 |
| `src/config/ConfigManager.ts` | 添加 `getTheme`、`saveTheme` 方法 |
| `src/slash-commands/builtinCommands.ts` | /copy、/thinking、英文化 |
| `src/prompts/default.ts` | 代码块路径指令 |

## 15.12 技术亮点

1. **流式输出**
   - OpenAI SDK 原生流式 API
   - 支持 DeepSeek R1 等模型的思考过程
   - 节流批量更新，避免频繁重绘

2. **渲染优化**
   - 细粒度选择器减少不必要的重新渲染
   - 组件状态隔离，子组件自订阅状态
   - InputArea 完全自管理，包括命令历史

3. **主题持久化**
   - 多平台颜色模式检测（macOS、COLORFGBG、VS Code）
   - 用户配置优先于项目配置
   - 同步保存确保不丢失

4. **终端兼容性**
   - `patchConsole: false` 减少 Ink 闪烁
   - 注意：iTerm2 可能仍有闪烁，推荐使用 Terminal.app 或 Alacritty

5. **AbortController 中断**
   - Ctrl+C 正确中断流式输出和 Agent 循环
   - Stream 回调 abort guard 防止对已中断消息的更新

6. **Thinking 自动折叠**
   - 流式中展开，完成后自动折叠
   - `/thinking` 全局切换

7. **Tool Call 紧凑展示**
   - dim 样式与正文视觉区分
   - `ToolCallLine` 组件正则匹配渲染

## 15.13 测试方法

### 测试流式输出

1. 发送一条消息，观察响应是否逐字显示
2. 使用支持思考过程的模型（如 DeepSeek R1），观察是否显示思考过程
3. 思考完成后应自动折叠，输入 `/thinking` 可展开全部

### 测试主题持久化

```bash
# 1. 启动应用
clawdcode

# 2. 切换主题
/theme ocean

# 3. 退出应用
Ctrl+C

# 4. 检查配置是否保存
cat ~/.clawdcode/config.json
# 应该看到 "theme": "ocean"

# 5. 重新启动，应该仍然是 ocean 主题
clawdcode
```

### 测试自动检测

```bash
# 删除用户配置中的主题
# 编辑 ~/.clawdcode/config.json，删除 theme 字段

# 重新启动，应该根据终端颜色模式自动选择 dark 或 light
clawdcode --debug
# 观察日志：[DEBUG] Theme: dark 或 [DEBUG] Theme: light
```
