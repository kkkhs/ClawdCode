# 第 01 章：Coding Agent 概述与 Claude Code 架构解析

## 1.1 什么是 Coding Agent

### 1.1.1 从 Chatbot 到 Agent

传统 Chatbot 像一个"有丰富知识的军师"，给你谋略但执行要你亲自上阵。

**Coding Agent** 像一个"能听懂指令的实习生"，你说"把这个功能实现了"，它就会自己：
- 翻阅代码库
- 创建和修改文件
- 执行命令、跑测试
- 遇到问题先尝试自我定位和修复

**核心公式**：

```
Coding Agent = LLM + System Prompt + Context + Tools
```

- **LLM** - 大脑，提供逻辑推理与决策能力
- **System Prompt** - 性格、行为边界和能做什么
- **Context** - 当前项目、当前任务中"应该怎么做"
- **Tools** - 可以真正操作世界的手

### 1.1.2 核心特征

一个合格的 Coding Agent 具备四个核心能力：

1. **自主决策能力** - 理解高层需求，自动分解为可执行步骤

```
用户：「帮我修复这个 TypeScript 类型错误」

Agent 的思考过程：
1. 需要先读取报错的文件
2. 分析错误原因
3. 查找相关的类型定义
4. 修改代码修复问题
5. 运行类型检查验证
```

2. **工具调用能力** - 通过调用工具与外部世界交互

| 工具类别 | 示例 | 用途 |
|----------|------|------|
| 文件工具 | Read, Write, Edit | 读取、创建、修改文件 |
| 搜索工具 | Glob, Grep | 查找文件和代码 |
| 执行工具 | Bash | 运行命令 |
| 网络工具 | WebFetch, WebSearch | 获取网络资源 |

3. **循环执行能力** - 通过循环不断迭代（Agentic Loop）

```
观察 → 思考 → 行动 → 观察 → 思考 → 行动 → ...
```

4. **上下文感知能力** - 理解代码上下文，记住对话历史，感知项目结构

### 1.1.3 Coding Agent vs 传统 IDE 插件

| 特性 | 传统 IDE 插件 | Coding Agent |
|------|---------------|--------------|
| 交互方式 | 菜单/快捷键 | 自然语言 |
| 任务范围 | 单一功能 | 复杂任务链 |
| 执行策略 | 固定流程 | 动态规划 |
| 上下文理解 | 有限 | 全局感知 |
| 学习能力 | 无 | 可从反馈中调整 |

---

## 1.2 Claude Code 的设计理念

### 1.2.1 核心设计原则

**1. "On Distribution" 技术栈选择**

选择模型已经熟悉的技术：

```
技术栈：TypeScript + React + Ink + esbuild
```

- **TypeScript** - 模型训练数据中大量存在
- **React** - 组件化思维，模型容易理解
- **Ink** - React for CLI，复用 React 知识

**2. 极简架构**

大部分逻辑交给模型本身：

```
传统方法：复杂的规则引擎 + 大量业务逻辑
Claude Code：简单的工具接口 + 强大的模型能力
```

**3. 本地优先**

- 工具在本地执行，直接访问文件系统
- 不需要虚拟化或沙箱（默认情况下）
- 追求简单和低延迟

**4. 权限控制**

```
安全级别：
- 只读操作：自动允许（如 Read, Glob, Grep）
- 写入操作：需要用户确认（如 Edit, Write）
- 危险操作：明确提示风险（如 rm -rf）
```

### 1.2.2 Claude Code 架构概览

```
┌─────────────────────────────────────┐
│           用户交互层                 │
│    CLI 入口  ←→  终端 UI            │
└─────────────────────────────────────┘
                ↓
┌─────────────────────────────────────┐
│            核心引擎                  │
│  Agent 核心 → Agentic Loop → 工具系统│
└─────────────────────────────────────┘
                ↓
┌─────────────────────────────────────┐
│           基础设施                   │
│  配置管理 | 上下文管理 | 权限控制     │
└─────────────────────────────────────┘
                ↓
┌─────────────────────────────────────┐
│           外部服务                   │
│  Claude API | MCP 服务器 | 文件系统  │
└─────────────────────────────────────┘
```

**关键组件**：

1. **Agent 核心** - 协调所有组件，管理执行流程
2. **Agentic Loop** - LLM → 工具 → 结果注入的循环
3. **工具系统** - 标准化的工具定义和执行
4. **权限控制** - 安全的工具执行审批
5. **上下文管理** - 对话历史和自动压缩

---

## 1.3 Agentic Loop 核心概念

### 1.3.1 什么是 Agentic Loop

Agentic Loop 是 Coding Agent 的核心执行机制：

```
用户输入 → 构建消息 → 调用 LLM → 有工具调用？
                                    ↓ 是
                              执行工具 → 注入结果 → 继续循环
                                    ↓ 否
                              返回响应（任务完成）
```

### 1.3.2 关键流程（伪代码）

```typescript
async executeLoop(message: string, context: ChatContext): Promise<LoopResult> {
  // 1. 构建消息历史
  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    ...context.messages,
    { role: 'user', content: message }
  ];

  // 2. 获取可用工具
  const tools = this.registry.getFunctionDeclarations();

  // 3. 核心循环
  while (true) {
    // 3.1 调用 LLM
    const response = await this.chatService.chat(messages, tools);

    // 3.2 检查是否完成（无工具调用）
    if (!response.toolCalls || response.toolCalls.length === 0) {
      return { success: true, finalMessage: response.content };
    }

    // 3.3 执行工具调用
    for (const toolCall of response.toolCalls) {
      const result = await this.executionPipeline.execute(
        toolCall.function.name,
        JSON.parse(toolCall.function.arguments)
      );

      // 3.4 将结果注入消息历史
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: result.llmContent
      });
    }
    // 继续下一轮循环...
  }
}
```

### 1.3.3 工具调用协议

LLM 请求工具调用的格式（OpenAI 兼容）：

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

Agent 执行工具后，将结果以 `tool` 角色注入：

```json
{
  "role": "tool",
  "tool_call_id": "call_abc123",
  "content": "文件内容：\nimport React from 'react';\n..."
}
```

### 1.3.4 循环终止条件

1. **任务完成** - LLM 不再请求工具调用
2. **达到轮次上限** - 防止无限循环（默认 100 轮）
3. **用户中止** - 用户主动取消
4. **错误发生** - 不可恢复的错误

---

## 本章小结

- Coding Agent = LLM + System Prompt + Context + Tools
- 核心特征：自主决策、工具调用、循环执行、上下文感知
- Claude Code 设计原则：极简架构、本地优先、权限控制
- Agentic Loop：工具调用 → 执行 → 反馈 → 继续循环

---

## 技术亮点

### 1. "On Distribution" 技术栈哲学

```
选择模型已经熟悉的技术 → 模型输出质量更高
```

**为什么**：LLM 在训练数据中见过大量 TypeScript/React 代码，用这些技术实现 Agent，模型更容易理解和生成正确的代码。

### 2. 极简架构原则

```
传统方法：复杂规则引擎 + 大量业务逻辑
Claude Code：简单工具接口 + 强大模型能力
```

**为什么**：把复杂性交给模型，代码只负责提供工具和执行结果。减少代码量，降低维护成本。

### 3. 无状态 Agent 设计

```typescript
// Agent 不持有状态，所有状态通过 Context 传入
executeLoop(message: string, context: ChatContext): Promise<LoopResult>
```

**为什么**：
- 简单可靠，每次调用都是全新的
- 方便测试，无隐藏状态
- 支持并发，多个任务互不干扰

### 4. 权限分级模型

```
只读操作 → 自动执行（Read, Glob, Grep）
写入操作 → 需要确认（Write, Edit）
危险操作 → 强烈警告（rm -rf）
```

**为什么**：平衡效率和安全。读操作没有副作用可以自动执行，写操作需要人工把关。

### 5. 工具结果注入

```typescript
// LLM 请求工具
{ role: 'assistant', tool_calls: [{ name: 'Read', arguments: {...} }] }

// 执行后注入结果
{ role: 'tool', tool_call_id: 'xxx', content: '文件内容...' }
```

**为什么**：保持消息历史的完整性，让 LLM 能看到每个工具调用的结果，做出正确的下一步决策。
