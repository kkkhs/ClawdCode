# 第八章：上下文管理

## 8.1 上下文管理的挑战

### 为什么需要上下文管理？

Coding Agent 与 LLM 的交互有几个特点：

1. **对话可能很长** - 一次代码重构可能涉及几十个文件操作
2. **工具调用产生大量输出** - 读取文件、执行命令的结果都需要注入上下文
3. **Token 有上限** - 超出限制会导致 API 调用失败
4. **需要跨会话延续** - 用户可能希望"继续昨天的工作"

### 核心设计目标

- **高效存储** - 快速读写当前会话
- **持久化** - 支持会话恢复
- **自动压缩** - Token 接近上限时自动压缩
- **优雅降级** - 压缩失败时有兜底策略

## 8.2 整体架构设计

### 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    ContextManager                            │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│  MemoryStore  │     │PersistentStore│     │  CacheStore   │
│  (内存存储)    │     │  (持久化存储)  │     │   (缓存层)    │
└───────────────┘     └───────────────┘     └───────────────┘
        │                     │                     │
        │                     ▼                     │
        │             ┌───────────────┐             │
        │             │  JSONL 文件   │             │
        │             └───────────────┘             │
        │                                           │
        └───────────────────┬───────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                       处理器                                 │
├─────────────────┬─────────────────┬─────────────────────────┤
│ TokenCounter    │ ContextFilter   │ ContextCompressor       │
│ (Token 计算)    │ (上下文过滤)    │ (上下文压缩)            │
└─────────────────┴─────────────────┴─────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   CompactionService                          │
│                   (压缩服务)                                 │
├─────────────────────────────────────────────────────────────┤
│ FileAnalyzer (文件分析)                                      │
└─────────────────────────────────────────────────────────────┘
```

### 分层设计

| 层级 | 组件 | 职责 | 特点 |
|------|------|------|------|
| 内存层 | `MemoryStore` | 当前会话的快速访问 | 最快、易失 |
| 持久层 | `PersistentStore` | 会话历史保存 | JSONL 格式、可恢复 |
| 缓存层 | `CacheStore` | 工具结果和压缩缓存 | TTL 过期、LRU 淘汰 |

## 8.3 数据结构设计

### 上下文数据模型

```typescript
// src/context/types.ts

// 消息结构
export interface ContextMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

// 工具调用记录
export interface ToolCallRecord {
  id: string;
  name: string;
  input: unknown;
  output?: unknown;
  timestamp: number;
  status: 'pending' | 'success' | 'error';
  error?: string;
}

// 上下文分层
export interface ContextLayer {
  system: SystemContext;        // 系统信息
  session: SessionContext;      // 会话元数据
  conversation: ConversationContext;  // 对话历史
  tool: ToolContext;            // 工具状态
  workspace: WorkspaceContext;  // 工作空间
}

// 完整上下文数据
export interface ContextData {
  layers: ContextLayer;
  metadata: {
    totalTokens: number;
    priority: number;
    relevanceScore?: number;
    lastUpdated: number;
  };
}
```

### JSONL 条目格式

持久化存储采用 JSONL（JSON Lines）格式，每行一个独立的 JSON 对象：

```typescript
export interface JSONLEntry {
  /** 消息唯一 ID (nanoid) */
  uuid: string;
  /** 父消息 ID (用于对话线程追踪) */
  parentUuid: string | null;
  /** 会话 ID */
  sessionId: string;
  /** ISO 8601 时间戳 */
  timestamp: string;
  /** 消息类型 */
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'system';
  /** 子类型 */
  subtype?: 'compact_boundary';
  /** 工作目录 */
  cwd: string;
  /** Git 分支 */
  gitBranch?: string;
  /** 版本号 */
  version: string;
  /** 消息内容 */
  message: {
    role: 'user' | 'assistant' | 'system';
    content: string | unknown;
    model?: string;
    usage?: { input_tokens: number; output_tokens: number };
  };
  /** 工具调用信息 */
  tool?: { id: string; name: string; input: unknown };
  /** 工具结果 */
  toolResult?: { id: string; output: unknown; error?: string };
  /** 压缩标记 */
  isCompactSummary?: boolean;
  compactMetadata?: {
    trigger: 'auto' | 'manual';
    preTokens: number;
    postTokens?: number;
    filesIncluded?: string[];
  };
}
```

### 为什么选择 JSONL？

```
JSONL vs JSON vs SQLite 对比
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
特性        │ JSONL      │ JSON       │ SQLite
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
追加写入     │ ✅ 高效    │ ❌ 需重写   │ ✅ 支持
流式读取     │ ✅ 支持    │ ❌ 全量加载  │ ✅ 支持
人类可读     │ ✅ 是      │ ✅ 是       │ ❌ 二进制
依赖         │ 无         │ 无          │ 需要库
并发安全     │ ⚠️ 需注意   │ ❌ 不安全    │ ✅ 支持
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

JSONL 的核心优势：
- **追加友好** - 新消息直接 append，无需读取整个文件
- **故障恢复** - 即使部分行损坏，其他行仍可读取
- **便于调试** - 直接用文本编辑器查看

## 8.4 ContextManager 核心实现

### 初始化与创建会话

```typescript
// src/context/ContextManager.ts
export class ContextManager {
  private readonly memory: MemoryStore;
  private readonly persistent: PersistentStore;
  private readonly cache: CacheStore;
  private currentSessionId: string | null = null;

  constructor(options: Partial<ContextManagerOptions> = {}) {
    this.options = {
      storage: {
        maxMemorySize: 1000,
        persistentPath: getStorageRoot(),
        cacheSize: 100,
        compressionEnabled: true,
        ...options.storage,
      },
      defaultFilter: {
        maxTokens: 32000,
        maxMessages: 50,
        timeWindow: 24 * 60 * 60 * 1000,  // 24小时
        ...options.defaultFilter,
      },
      compressionThreshold: options.compressionThreshold || 6000,
    };

    // 初始化存储层
    this.memory = new MemoryStore(this.options.storage.maxMemorySize);
    this.persistent = new PersistentStore(process.cwd(), 100);
    this.cache = new CacheStore(this.options.storage.cacheSize, 5 * 60 * 1000);
  }

  async createSession(userId?: string, preferences: Record<string, unknown> = {}): Promise<string> {
    const sessionId = nanoid();
    const now = Date.now();

    const contextData: ContextData = {
      layers: {
        system: await this.createSystemContext(),
        session: { sessionId, userId, preferences, startTime: now },
        conversation: { messages: [], topics: [], lastActivity: now },
        tool: { recentCalls: [], toolStates: {}, dependencies: {} },
        workspace: await this.createWorkspaceContext(),
      },
      metadata: { totalTokens: 0, priority: 1, lastUpdated: now },
    };

    this.memory.setContext(contextData);
    await this.persistent.saveContext(sessionId, contextData);
    this.currentSessionId = sessionId;
    return sessionId;
  }
}
```

### 消息添加与自动压缩检测

```typescript
async addMessage(
  role: ContextMessage['role'],
  content: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  if (!this.currentSessionId) {
    throw new Error('没有活动会话');
  }

  const message: ContextMessage = {
    id: nanoid(),
    role,
    content,
    timestamp: Date.now(),
    metadata,
  };

  // 添加到内存
  this.memory.addMessage(message);

  // 检查是否需要压缩
  const contextData = this.memory.getContext();
  if (contextData && this.shouldCompress(contextData)) {
    await this.compressCurrentContext();
  }

  // 异步保存到持久化存储（不阻塞主流程）
  this.saveCurrentSessionAsync();
}

private shouldCompress(contextData: ContextData): boolean {
  return contextData.metadata.totalTokens > this.options.compressionThreshold;
}
```

## 8.5 存储层实现

### MemoryStore - 内存存储

```typescript
// src/context/storage/MemoryStore.ts
export class MemoryStore {
  private contextData: ContextData | null = null;
  private readonly maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  addMessage(message: ContextMessage): void {
    if (!this.contextData) {
      throw new Error('上下文数据未初始化');
    }

    this.contextData.layers.conversation.messages.push(message);
    this.contextData.layers.conversation.lastActivity = Date.now();
    this.contextData.metadata.lastUpdated = Date.now();

    this.enforceMemoryLimit();
  }

  private enforceMemoryLimit(): void {
    if (!this.contextData) return;

    const messages = this.contextData.layers.conversation.messages;
    if (messages.length > this.maxSize) {
      const keepCount = Math.floor(this.maxSize * 0.8);
      this.contextData.layers.conversation.messages = messages.slice(-keepCount);
    }
  }
}
```

### JSONLStore - JSONL 文件操作

```typescript
// src/context/storage/JSONLStore.ts
export class JSONLStore {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async append(entry: JSONLEntry): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const line = JSON.stringify(entry) + '\n';
    await fs.appendFile(this.filePath, line, 'utf-8');
  }

  async readAll(): Promise<JSONLEntry[]> {
    if (!existsSync(this.filePath)) {
      return [];
    }

    const content = await fs.readFile(this.filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim().length > 0);

    const entries: JSONLEntry[] = [];
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line) as JSONLEntry);
      } catch {
        console.warn(`[JSONLStore] 解析 JSON 行失败`);
      }
    }
    return entries;
  }

  async readStream(callback: (entry: JSONLEntry) => void | Promise<void>): Promise<void> {
    // 流式读取实现，适合大文件
  }
}
```

### 路径工具函数

```typescript
// src/context/storage/pathUtils.ts

/**
 * 转义项目路径为目录名
 * /Users/foo/project → -Users-foo-project
 */
export function escapeProjectPath(absPath: string): string {
  const normalized = path.resolve(absPath);
  return normalized.replace(/\//g, '-');
}

/**
 * 获取项目的存储路径
 * @returns ~/.clawdcode/projects/{escaped-path}/
 */
export function getProjectStoragePath(projectPath: string): string {
  const homeDir = os.homedir();
  const escaped = escapeProjectPath(projectPath);
  return path.join(homeDir, '.clawdcode', 'projects', escaped);
}

/**
 * 获取会话文件路径
 */
export function getSessionFilePath(projectPath: string, sessionId: string): string {
  return path.join(getProjectStoragePath(projectPath), `${sessionId}.jsonl`);
}
```

## 8.6 Token 计算

### TokenCounter 实现

```typescript
// src/context/TokenCounter.ts
import { encodingForModel } from 'js-tiktoken';

export class TokenCounter {
  private static encodingCache = new Map<string, Tiktoken>();

  static countTokens(messages: Message[], modelName: string): number {
    const encoding = this.getEncoding(modelName);
    let totalTokens = 0;

    for (const msg of messages) {
      totalTokens += 4;  // 每条消息的固定开销

      if (msg.role) {
        totalTokens += encoding.encode(msg.role).length;
      }

      if (msg.content) {
        const content = typeof msg.content === 'string' 
          ? msg.content 
          : JSON.stringify(msg.content);
        totalTokens += encoding.encode(content).length;
      }

      if (msg.tool_calls) {
        totalTokens += this.countToolCallTokens(msg.tool_calls, encoding);
      }
    }

    return totalTokens;
  }

  static shouldCompact(
    messages: Message[],
    modelName: string,
    maxTokens: number,
    thresholdPercent: number = 0.8
  ): boolean {
    const currentTokens = this.countTokens(messages, modelName);
    const threshold = Math.floor(maxTokens * thresholdPercent);
    return currentTokens >= threshold;
  }

  /**
   * 快速粗略估算（不需要 encoding）
   */
  static estimateTokens(text: string): number {
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
  }
}
```

## 8.7 对话压缩服务

### 压缩触发条件

```
           ↓ 当前 Token
═══════════════════════════════════
0%                              100%
          80% (阈值)
           │
           ▼ 触发压缩
```

### CompactionService 实现

```typescript
// src/context/CompactionService.ts
export class CompactionService {
  private static readonly THRESHOLD_PERCENT = 0.8;
  private static readonly RETAIN_PERCENT = 0.2;
  private static readonly FALLBACK_RETAIN_PERCENT = 0.3;

  static async compact(
    messages: Message[],
    options: CompactionOptions
  ): Promise<CompactionResult> {
    const preTokens = options.actualPreTokens
      ?? TokenCounter.countTokens(messages, options.modelName);

    try {
      // 1. 分析并读取重点文件
      const fileRefs = FileAnalyzer.analyzeFiles(messages);
      const filePaths = fileRefs.map(f => f.path);
      const fileContents = await FileAnalyzer.readFilesContent(filePaths);

      // 2. 调用 LLM 生成总结
      const summary = await this.generateSummary(messages, fileContents, options);

      // 3. 计算保留范围并过滤孤儿 tool 消息
      const retainCount = Math.ceil(messages.length * this.RETAIN_PERCENT);
      const candidateMessages = messages.slice(-retainCount);
      const retainedMessages = this.filterOrphanToolMessages(candidateMessages);

      // 4. 创建压缩消息
      const summaryMessage = this.createSummaryMessage(nanoid(), summary);
      const compactedMessages = [summaryMessage, ...retainedMessages];

      const postTokens = TokenCounter.countTokens(compactedMessages, options.modelName);

      return {
        success: true,
        summary,
        preTokens,
        postTokens,
        filesIncluded: filePaths,
        compactedMessages,
      };
    } catch (error) {
      return this.fallbackCompact(messages, options, preTokens, error);
    }
  }
}
```

### 文件分析器

```typescript
// src/context/FileAnalyzer.ts
export class FileAnalyzer {
  private static readonly MAX_FILES = 5;
  private static readonly MAX_LINES_PER_FILE = 1000;

  static analyzeFiles(messages: Message[]): FileReference[] {
    const fileMap = new Map<string, FileReference>();

    messages.forEach((msg, index) => {
      // 从消息内容中提取文件路径
      const contentFiles = this.extractFilePathsFromContent(msg.content || '');
      contentFiles.forEach(path => {
        this.updateFileReference(fileMap, path, index, false);
      });

      // 从工具调用中提取文件路径
      if (msg.tool_calls) {
        msg.tool_calls.forEach(call => {
          const toolFiles = this.extractFilePathsFromToolCall(call);
          const wasModified = ['Write', 'Edit'].includes(call.function?.name || '');
          toolFiles.forEach(path => {
            this.updateFileReference(fileMap, path, index, wasModified);
          });
        });
      }
    });

    // 按重要性排序：1. 是否被修改 2. 提及次数 3. 最近度
    return Array.from(fileMap.values())
      .sort((a, b) => {
        if (a.wasModified !== b.wasModified) return a.wasModified ? -1 : 1;
        if (a.mentions !== b.mentions) return b.mentions - a.mentions;
        return b.lastMentioned - a.lastMentioned;
      })
      .slice(0, this.MAX_FILES);
  }
}
```

## 8.8 降级策略

当 LLM 调用失败时，使用简单截断作为降级策略：

```typescript
private static fallbackCompact(
  messages: Message[],
  options: CompactionOptions,
  preTokens: number,
  error: unknown
): CompactionResult {
  // 保留 30% 的最近消息
  const retainCount = Math.ceil(messages.length * this.FALLBACK_RETAIN_PERCENT);
  const candidateMessages = messages.slice(-retainCount);
  const retainedMessages = this.filterOrphanToolMessages(candidateMessages);

  const errorMsg = error instanceof Error ? error.message : String(error);
  const summaryMessage = this.createSummaryMessage(
    nanoid(),
    `[Automatic compaction failed; using fallback]

An error occurred during compaction. Retained the latest ${retainCount} messages (~30%).

Error: ${errorMsg}

The conversation can continue, but consider retrying with /compact.`
  );

  return {
    success: false,
    summary: summaryMessage.content,
    preTokens,
    postTokens: TokenCounter.countTokens([summaryMessage, ...retainedMessages], options.modelName),
    filesIncluded: [],
    compactedMessages: [summaryMessage, ...retainedMessages],
    error: errorMsg,
  };
}
```

## 8.9 /compact 命令实现

```typescript
// src/slash-commands/compact.ts
export const compactCommand: SlashCommand = {
  name: 'compact',
  description: '手动压缩上下文，生成总结并节省 token',
  aliases: ['c'],

  async handler(args, context) {
    const { sessionContext } = context;

    if (!sessionContext?.messages || sessionContext.messages.length < 2) {
      return {
        type: 'error',
        content: '没有足够的对话历史需要压缩',
      };
    }

    const result = await CompactionService.compact(
      sessionContext.messages,
      {
        trigger: 'manual',
        modelName: config.currentModel?.model || 'gpt-4',
        maxContextTokens: config.maxContextTokens || 128000,
      }
    );

    if (result.success) {
      sessionContext.messages = result.compactedMessages;

      return {
        type: 'success',
        content: `✅ 压缩完成！

Token 变化: ${result.preTokens} → ${result.postTokens} (-${((1 - result.postTokens / result.preTokens) * 100).toFixed(1)}%)
包含文件: ${result.filesIncluded.join(', ') || '无'}`,
      };
    } else {
      return {
        type: 'warning',
        content: `⚠️ 压缩使用降级策略

${result.error}

已保留最近 30% 的消息。`,
      };
    }
  },
};
```

## 8.10 会话存储示例

### JSONL 文件内容示例

文件路径：`~/.clawdcode/projects/-Users-foo-myproject/abc123.jsonl`

```json
{"uuid":"msg_001","parentUuid":null,"sessionId":"abc123","timestamp":"2024-01-15T10:00:00Z","type":"user","cwd":"/Users/foo/myproject","gitBranch":"main","version":"0.1.0","message":{"role":"user","content":"帮我重构 utils.ts 文件"}}
{"uuid":"msg_002","parentUuid":"msg_001","sessionId":"abc123","timestamp":"2024-01-15T10:00:05Z","type":"tool_use","tool":{"id":"tool_001","name":"Read","input":{"file_path":"src/utils.ts"}}}
{"uuid":"msg_003","parentUuid":"msg_002","sessionId":"abc123","timestamp":"2024-01-15T10:00:06Z","type":"tool_result","toolResult":{"id":"tool_001","output":"export function add(a, b) { return a + b; }"}}
{"uuid":"boundary_001","parentUuid":"msg_004","sessionId":"abc123","timestamp":"2024-01-15T11:00:00Z","type":"system","subtype":"compact_boundary","message":{"role":"system","content":"=== 上下文压缩边界 ==="},"compactMetadata":{"trigger":"auto","preTokens":50000}}
{"uuid":"summary_001","parentUuid":"boundary_001","sessionId":"abc123","timestamp":"2024-01-15T11:00:01Z","type":"user","isCompactSummary":true,"message":{"role":"user","content":"## Summary\n用户请求重构 utils.ts..."},"compactMetadata":{"trigger":"auto","preTokens":50000,"postTokens":8000,"filesIncluded":["src/utils.ts"]}}
```

## 8.11 最佳实践

### 压缩阈值设置

```typescript
const contextConfig = {
  maxContextTokens: 128000,      // 模型上下文窗口
  compressionThreshold: 0.8,     // 80% 触发压缩
  retainPercent: 0.2,            // 保留最近 20% 消息
};

// 计算
// 128000 * 0.8 = 102400 tokens 时触发
// 保留约 20% 的最近消息 + 总结
```

### 文件包含策略

```
优先级排序
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 被修改的文件（Write/Edit）
2. 提及次数多的文件
3. 最近提及的文件
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
最多包含 5 个文件
每个文件最多 1000 行
```

### 孤儿消息处理

工具调用必须成对出现（assistant 的 tool_calls 和 tool 的响应）。压缩时如果只保留了部分消息，可能出现"孤儿"tool 消息：

```typescript
// 过滤孤儿消息
const availableToolCallIds = new Set<string>();
for (const msg of candidateMessages) {
  if (msg.role === 'assistant' && msg.tool_calls) {
    for (const tc of msg.tool_calls) {
      availableToolCallIds.add(tc.id);
    }
  }
}

const retainedMessages = candidateMessages.filter(msg => {
  if (msg.role === 'tool' && msg.tool_call_id) {
    return availableToolCallIds.has(msg.tool_call_id);
  }
  return true;
});
```

## 8.12 测试方法

```bash
# 运行上下文管理测试
bun run test:context

# 测试 Token 计算
bun run src/context/test.ts
```

预期输出：
```
✅ TokenCounter: 计算 Token 数量
✅ TokenCounter: 快速估算
✅ MemoryStore: 添加消息
✅ MemoryStore: 内存限制
✅ JSONLStore: 追加和读取
✅ CompactionService: 压缩成功
✅ CompactionService: 降级策略
✅ FileAnalyzer: 提取文件路径
```

---

## 技术亮点

1. **三层存储架构** - 内存/持久化/缓存分离，各司其职
2. **JSONL 格式** - 追加友好、故障恢复、人类可读
3. **智能压缩** - 80% 阈值自动触发，LLM 生成高质量总结
4. **优雅降级** - LLM 失败时有简单截断兜底
5. **孤儿消息过滤** - 保证工具调用消息的完整性
6. **项目隔离存储** - 不同项目的会话互不干扰

---

## 常见问题

### Q1: 为什么 80% 触发压缩而不是 100%？

保留 20% 的缓冲区有几个好处：
- 避免压缩后立即又触发压缩
- 给 LLM 响应预留空间
- 降低 Token 超限导致 API 失败的风险

### Q2: 压缩总结会丢失信息吗？

会有一定程度的信息损失，但通过以下策略最小化：
- LLM 生成结构化总结，保留关键信息
- 保留最近 20% 的原始消息
- 包含被修改文件的当前内容

### Q3: 为什么选择 JSONL 而不是 SQLite？

- **简单** - 无需额外依赖
- **可调试** - 直接用文本编辑器查看
- **追加友好** - 新消息直接 append
- **部分恢复** - 即使部分行损坏，其他行仍可读取

对于大多数 CLI 工具场景，JSONL 足够用。如果需要复杂查询，可以考虑升级到 SQLite。

### Q4: 如何实现跨会话延续？

使用 `--continue` 参数：
```bash
clawdcode --continue  # 继续上次对话
```

实现原理：
1. 从 `~/.clawdcode/projects/{project}/` 找到最新的 `.jsonl` 文件
2. 加载该会话的消息历史
3. 继续对话
