# 第一章：Coding Agent 概述与架构设计

> **学习目标**：理解 Coding Agent 的核心概念、设计理念和整体架构
> 
> **预计阅读时间**：15 分钟

---

## 1.1 什么是 Coding Agent

### 1.1.1 从 Chatbot 到 Agent

传统的 AI Chatbot（如 ChatGPT 网页版）像一个"知识渊博的军师"——它能给你建议和方案，但执行要你亲自动手。

**Coding Agent** 则像一个"能听懂指令的实习生"。当你说"帮我修复这个 TypeScript 类型错误"，它会自己：

1. 翻阅代码库，找到相关文件
2. 读取并理解代码内容
3. 修改文件修复问题
4. 执行测试验证修复
5. 遇到新问题时自动定位和修复

### 1.1.2 核心公式

```
Coding Agent = LLM + System Prompt + Context + Tools
```

| 组件 | 类比 | 作用 |
|------|------|------|
| **LLM** | 大脑 | 提供逻辑推理与决策能力 |
| **System Prompt** | 性格 | 定义行为边界、能力范围 |
| **Context** | 记忆 | 当前项目信息、任务上下文 |
| **Tools** | 双手 | 真正操作世界（读写文件、执行命令） |

### 1.1.3 四大核心能力

一个合格的 Coding Agent 必须具备：

**1. 自主决策能力**

```
用户：「帮我修复这个 TypeScript 类型错误」

Agent 的思考过程：
1. 需要先读取报错的文件        → 调用 Read 工具
2. 分析错误原因                → LLM 推理
3. 查找相关的类型定义          → 调用 Glob + Read 工具
4. 修改代码修复问题            → 调用 Edit 工具
5. 运行类型检查验证            → 调用 Bash 工具
```

**2. 工具调用能力**

| 工具类别 | 示例 | 用途 |
|----------|------|------|
| 文件工具 | Read, Write, Edit | 读取、创建、修改文件 |
| 搜索工具 | Glob, Grep | 按名称或内容查找 |
| 执行工具 | Bash | 运行 shell 命令 |
| 网络工具 | WebFetch | 获取网络资源 |

**3. 循环执行能力（Agentic Loop）**

```
观察 → 思考 → 行动 → 观察 → 思考 → 行动 → ...
```

Agent 不是一次性输出结果，而是通过多轮循环逐步完成任务。

**4. 上下文感知能力**

- 理解代码上下文（项目结构、依赖关系）
- 记住对话历史（之前做了什么）
- 感知运行环境（操作系统、当前目录）

---

## 1.2 Claude Code 的设计理念

我们的项目 **ClawdCode** 参考了 Anthropic 官方的 Claude Code，采用了相同的设计理念。

### 1.2.1 "On Distribution" 技术栈哲学

> 选择模型训练数据中大量存在的技术

```
技术栈选择：TypeScript + React + Ink
```

**为什么？**

LLM 在训练数据中见过大量 TypeScript 和 React 代码。使用这些技术：
- 模型更容易理解项目代码
- 生成的代码质量更高
- 出错时模型更容易自我修复

### 1.2.2 极简架构原则

```
传统方法：复杂的规则引擎 + 大量业务逻辑
Claude Code：简单的工具接口 + 强大的模型能力
```

**核心思想**：把复杂性交给模型，代码只负责提供工具和执行结果。

**好处**：
- 代码量少，维护成本低
- 逻辑清晰，易于理解
- 模型升级自动提升能力

### 1.2.3 本地优先

```
特点：
- 工具在本地执行，直接访问文件系统
- 不需要虚拟化或沙箱（默认情况）
- 追求简单和低延迟
```

### 1.2.4 权限控制

```
安全级别：
┌─────────────────────────────────────────┐
│ 只读操作 → 自动允许                      │
│ （Read, Glob, Grep）                     │
├─────────────────────────────────────────┤
│ 写入操作 → 需要用户确认                  │
│ （Write, Edit）                          │
├─────────────────────────────────────────┤
│ 危险操作 → 明确提示风险                  │
│ （rm -rf, git push --force）            │
└─────────────────────────────────────────┘
```

---

## 1.3 系统架构概览

### 1.3.1 四层架构

```
┌─────────────────────────────────────────┐
│             用户交互层                   │
│      CLI 入口  ←→  终端 UI (Ink)        │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│              核心引擎                    │
│   Agent 核心 → Agentic Loop → 工具系统  │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│             基础设施                     │
│   配置管理 | 上下文管理 | 权限控制       │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│             外部服务                     │
│   LLM API | MCP 服务器 | 文件系统       │
└─────────────────────────────────────────┘
```

### 1.3.2 关键组件

| 组件 | 职责 | 对应章节 |
|------|------|----------|
| **CLI 入口** | 解析命令行参数，启动应用 | 第 3 章 |
| **Agent 核心** | 协调所有组件，管理执行流程 | 第 4 章 |
| **System Prompt** | 定义 Agent 的行为规范 | 第 5 章 |
| **工具系统** | 标准化的工具定义和执行 | 第 6 章 |
| **执行管道** | 权限检查、确认机制 | 第 7 章 |
| **上下文管理** | 对话历史、Token 统计、自动压缩 | 第 8 章 |

---

## 1.4 Agentic Loop 详解

### 1.4.1 核心流程

```
用户输入
    ↓
构建消息（System Prompt + 历史 + 用户消息）
    ↓
调用 LLM
    ↓
检查响应 ─────────────────────────────────┐
    ↓                                     │
有工具调用？                              │
    ↓ 是                     否 ↓         │
执行工具                    返回响应      │
    ↓                       (任务完成)    │
注入结果                                  │
    ↓                                     │
继续循环 ←────────────────────────────────┘
```

### 1.4.2 伪代码实现

```typescript
async function agenticLoop(userMessage: string, context: ChatContext) {
  // 1. 构建消息历史
  const messages = [
    { role: 'system', content: systemPrompt },
    ...context.messages,
    { role: 'user', content: userMessage }
  ];

  // 2. 获取可用工具定义
  const tools = toolRegistry.getToolDefinitions();

  // 3. 核心循环
  while (true) {
    // 3.1 调用 LLM
    const response = await llm.chat(messages, tools);

    // 3.2 检查是否完成（无工具调用）
    if (!response.toolCalls || response.toolCalls.length === 0) {
      return response.content; // 任务完成
    }

    // 3.3 执行每个工具调用
    for (const toolCall of response.toolCalls) {
      const result = await executeTool(toolCall);
      
      // 3.4 将结果注入消息历史
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: result
      });
    }
    
    // 继续下一轮循环...
  }
}
```

### 1.4.3 工具调用协议（OpenAI 格式）

**LLM 请求工具调用**：

```json
{
  "role": "assistant",
  "content": "让我先读取这个文件的内容...",
  "tool_calls": [
    {
      "id": "call_abc123",
      "type": "function",
      "function": {
        "name": "Read",
        "arguments": "{\"file_path\": \"/src/app.ts\"}"
      }
    }
  ]
}
```

**Agent 注入工具结果**：

```json
{
  "role": "tool",
  "tool_call_id": "call_abc123",
  "content": "文件内容：\nimport React from 'react';\n..."
}
```

### 1.4.4 循环终止条件

| 条件 | 说明 |
|------|------|
| 任务完成 | LLM 不再请求工具调用 |
| 轮次上限 | 防止无限循环（默认 100 轮） |
| 用户中止 | 用户按 Ctrl+C |
| 错误发生 | 不可恢复的错误 |

---

## 1.5 项目目录结构预览

```
clawdcode/
├── src/
│   ├── main.tsx              # CLI 入口（第 3 章）
│   │
│   ├── agent/                # Agent 核心（第 4 章）
│   │   ├── Agent.ts          # 主 Agent 类
│   │   ├── SimpleAgent.ts    # Hello World Agent（第 2 章）
│   │   └── types.ts          # 类型定义
│   │
│   ├── cli/                  # CLI 模块（第 3 章）
│   │   ├── types.ts          # CLI 类型定义
│   │   ├── config.ts         # yargs 选项配置
│   │   ├── middleware.ts     # 中间件函数
│   │   └── index.ts          # 模块导出
│   │
│   ├── config/               # 配置管理（第 2-3 章）
│   │   ├── ConfigManager.ts  # 配置管理器
│   │   └── types.ts          # 配置类型（Zod Schema）
│   │
│   ├── prompts/              # 提示词管理（第 5 章）
│   │   ├── default.ts        # 默认系统提示词
│   │   ├── plan.ts           # Plan 模式提示词
│   │   └── builder.ts        # 提示词构建器
│   │
│   ├── tools/                # 工具系统（第 6-7 章）
│   │   ├── builtin/          # 内置工具
│   │   │   ├── read.ts       # Read 工具
│   │   │   ├── write.ts      # Write 工具
│   │   │   ├── edit.ts       # Edit 工具
│   │   │   ├── bash.ts       # Bash 工具
│   │   │   ├── glob.ts       # Glob 工具
│   │   │   └── grep.ts       # Grep 工具
│   │   ├── registry.ts       # 工具注册表
│   │   ├── createTool.ts     # 工具创建工厂
│   │   └── execution/        # 执行管道（第 7 章）
│   │       ├── ExecutionPipeline.ts
│   │       └── stages/       # 各阶段实现
│   │
│   ├── context/              # 上下文管理（第 8 章）
│   │   ├── ContextManager.ts # 上下文管理器
│   │   ├── TokenCounter.ts   # Token 计算
│   │   ├── CompactionService.ts # 压缩服务
│   │   └── storage/          # 存储实现
│   │
│   ├── services/             # 服务层
│   │   ├── ChatService.ts    # LLM 调用封装
│   │   └── VersionChecker.ts # 版本检查
│   │
│   └── ui/                   # UI 组件
│       ├── App.tsx           # 主界面
│       └── components/       # UI 组件
│
├── tutorials/                # 教程文档
├── docs/                     # 设计文档
├── package.json
└── tsconfig.json
```

---

## 1.6 本章小结

### 核心概念

- **Coding Agent** = LLM + System Prompt + Context + Tools
- **Agentic Loop** = 工具调用 → 执行 → 反馈 → 继续循环
- **权限控制** = 只读自动 / 写入确认 / 危险警告

### 设计原则

1. **On Distribution** - 选择模型熟悉的技术
2. **极简架构** - 复杂性交给模型
3. **本地优先** - 直接访问文件系统
4. **无状态 Agent** - 状态通过 Context 传入

### 技术亮点预览

| 亮点 | 说明 |
|------|------|
| 无状态设计 | Agent 不持有状态，所有状态通过 Context 传入 |
| 权限分级 | 不同操作不同确认级别 |
| 工具结果注入 | 保持消息历史完整性 |
| 轮次控制 | 防止无限循环 |

---

## 下一章预告

在 **第二章** 中，我们将：
1. 选择并配置技术栈
2. 初始化项目结构
3. 实现第一个 Hello World Agent
4. 搭建 Ink 终端界面

让我们开始动手实践！
