# 第七章：执行管道与权限控制

> **学习目标**：实现七阶段执行管道和完整的权限控制系统
> 
> **预计阅读时间**：60 分钟
> 
> **实践时间**：90 分钟
> 
> **前置要求**：已完成第六章的代码实现

---

## 7.1 执行管道概述

### 7.1.1 为什么需要执行管道

工具的执行至少要处理三个彼此独立但又至关重要的问题：

| 关注点 | 问题 | 解决方案 |
|--------|------|----------|
| **安全与信任** | Agent 能否被信任？如何确保不会执行危险操作？ | Permission（权限检查）、Confirmation（用户确认） |
| **灵活性与扩展性** | 如何方便地增加新工具？ | Discovery（工具发现）、Hook（钩子） |
| **一致性与健壮性** | 如何确保所有工具的输入输出都符合预期？ | Validation（参数验证）、Formatting（结果格式化） |

### 7.1.2 七阶段管道

```
工具调用请求 → Discovery → Permission → Hook/Pre → Confirmation → Execution → Hook/Post → Formatting → 返回结果
```

| 阶段 | 职责 |
|------|------|
| 1. **Discovery** | 从注册表查找工具 |
| 2. **Permission** | 参数验证 + 权限规则检查 + 敏感文件检测 |
| 3. **Hook (Pre)** | 执行 PreToolUse Hooks |
| 4. **Confirmation** | 危险操作请求用户确认 |
| 5. **Execution** | 实际执行工具 |
| 6. **Hook (Post)** | 执行 PostToolUse Hooks |
| 7. **Formatting** | 统一结果格式、添加元数据 |

### 7.1.3 目录结构

```
src/tools/
├── execution/                # 执行管道
│   ├── types.ts              # 类型定义
│   ├── ExecutionPipeline.ts  # 主管道类
│   ├── stages/               # 七个执行阶段
│   │   ├── DiscoveryStage.ts
│   │   ├── PermissionStage.ts
│   │   ├── HookStage.ts
│   │   ├── ConfirmationStage.ts
│   │   ├── ExecutionStage.ts
│   │   ├── PostHookStage.ts
│   │   ├── FormattingStage.ts
│   │   └── index.ts
│   └── index.ts
├── validation/               # 验证工具
│   ├── PermissionChecker.ts
│   └── SensitiveFileDetector.ts
└── ...
```

---

## 7.2 核心类型定义

### 7.2.1 创建执行管道类型

**文件位置**：`src/tools/execution/types.ts`

```typescript
/**
 * 执行管道类型定义
 */

import type { Tool, ToolResult, ToolInvocation } from '../types.js';

// ========== 权限模式 ==========

/**
 * 权限模式
 * 
 * 决定工具执行时的权限行为
 */
export enum PermissionMode {
  /** 默认模式：写操作需确认 */
  DEFAULT = 'default',
  /** 自动批准编辑 */
  AUTO_EDIT = 'autoEdit',
  /** 自动批准所有（危险！） */
  YOLO = 'yolo',
  /** 只读调研模式 */
  PLAN = 'plan',
}

// ========== 权限检查 ==========

/**
 * 权限检查结果枚举
 */
export enum PermissionResult {
  ALLOW = 'allow',  // 允许执行
  ASK = 'ask',      // 需要用户确认
  DENY = 'deny',    // 拒绝执行
}

/**
 * 权限检查结果详情
 */
export interface PermissionCheckResult {
  result: PermissionResult;
  matchedRule?: string;  // 匹配的规则
  reason?: string;       // 原因说明
}

/**
 * 权限配置
 */
export interface PermissionConfig {
  allow: string[];  // 允许规则列表
  deny: string[];   // 拒绝规则列表
  ask: string[];    // 询问规则列表
}

/**
 * 工具调用描述符（用于权限检查）
 */
export interface ToolInvocationDescriptor {
  toolName: string;
  params: Record<string, unknown>;
  affectedPaths?: string[];
  tool?: Tool;
}

// ========== 确认机制 ==========

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

// ========== 执行上下文 ==========

/**
 * 管道执行上下文
 */
export interface PipelineExecutionContext {
  sessionId: string;
  workspaceRoot: string;
  permissionMode: PermissionMode;
  signal?: AbortSignal;
  onProgress?: (progress: ToolProgress) => void;
  confirmationHandler?: ConfirmationHandler;
  messageId?: string;
}

/**
 * 工具进度
 */
export interface ToolProgress {
  stage: string;
  message: string;
  percent?: number;
}

// ========== 工具执行实例 ==========

/**
 * 工具执行内部状态
 */
export interface ToolExecutionInternal {
  tool?: Tool;
  invocation?: ToolInvocation;
  needsConfirmation?: boolean;
  confirmationReason?: string;
  permissionSignature?: string;
  hookToolUseId?: string;
}

/**
 * 工具执行实例类
 * 
 * 封装单次工具执行的所有状态
 */
export class ToolExecution {
  private result?: ToolResult;
  private aborted = false;
  private abortReason?: string;

  readonly _internal: ToolExecutionInternal = {};

  constructor(
    public readonly toolName: string,
    public params: Record<string, unknown>,
    public readonly context: PipelineExecutionContext
  ) {}

  /** 中止执行 */
  abort(reason: string): void {
    this.aborted = true;
    this.abortReason = reason;
  }

  /** 是否已中止 */
  isAborted(): boolean {
    return this.aborted;
  }

  /** 获取中止原因 */
  getAbortReason(): string | undefined {
    return this.abortReason;
  }

  /** 设置结果 */
  setResult(result: ToolResult): void {
    this.result = result;
  }

  /** 获取结果 */
  getResult(): ToolResult | undefined {
    return this.result;
  }
}

// ========== 管道阶段 ==========

/**
 * 管道阶段接口
 * 
 * 每个阶段必须实现此接口
 */
export interface PipelineStage {
  readonly name: string;
  process(execution: ToolExecution): Promise<void>;
}

// ========== 管道配置 ==========

/**
 * 执行管道配置
 */
export interface ExecutionPipelineConfig {
  permissions?: PermissionConfig;
  defaultMode?: PermissionMode;
}

// ========== 执行历史 ==========

/**
 * 执行历史条目
 */
export interface ExecutionHistoryEntry {
  toolName: string;
  params: Record<string, unknown>;
  result: ToolResult;
  timestamp: number;
  duration: number;
  permissionMode: PermissionMode;
  stages: string[];
}

// ========== 管道事件 ==========

export interface StageStartEvent {
  stage: string;
  execution: ToolExecution;
}

export interface StageCompleteEvent {
  stage: string;
  execution: ToolExecution;
}
```

**权限模式行为对比**：

| 模式 | ReadOnly 工具 | Write 工具 | Execute 工具 |
|------|---------------|------------|--------------|
| DEFAULT | ✅ 自动批准 | ❓ 需确认 | ❓ 需确认 |
| AUTO_EDIT | ✅ 自动批准 | ✅ 自动批准 | ❓ 需确认 |
| YOLO | ✅ 自动批准 | ✅ 自动批准 | ✅ 自动批准 |
| PLAN | ✅ 自动批准 | ❌ 拒绝 | ❌ 拒绝 |

---

## 7.3 权限检查器

### 7.3.1 创建 PermissionChecker

**文件位置**：`src/tools/validation/PermissionChecker.ts`

```typescript
/**
 * 权限检查器
 * 检查工具调用是否被允许
 */

import { minimatch } from 'minimatch';
import {
  PermissionResult,
  type PermissionCheckResult,
  type PermissionConfig,
  type ToolInvocationDescriptor,
} from '../execution/types.js';

/**
 * 默认权限配置
 */
export const DEFAULT_PERMISSION_CONFIG: PermissionConfig = {
  allow: [
    // 只读工具默认允许
    'Read(**/*)',
    'Glob(**/*)',
    'Grep(**/*)',
  ],
  deny: [
    // 危险命令默认拒绝
    'Bash(rm -rf:*)',
    'Bash(sudo:*)',
    'Write(/etc/*)',
    'Write(/usr/*)',
    'Write(/System/*)',
  ],
  ask: [],
};

/**
 * 权限检查器
 */
export class PermissionChecker {
  private config: PermissionConfig;

  constructor(config?: Partial<PermissionConfig>) {
    // 合并默认配置和用户配置
    this.config = {
      allow: [...DEFAULT_PERMISSION_CONFIG.allow, ...(config?.allow || [])],
      deny: [...DEFAULT_PERMISSION_CONFIG.deny, ...(config?.deny || [])],
      ask: [...DEFAULT_PERMISSION_CONFIG.ask, ...(config?.ask || [])],
    };
  }

  /**
   * 检查权限
   * 
   * 优先级：deny > allow > ask > 默认 ASK
   */
  check(descriptor: ToolInvocationDescriptor): PermissionCheckResult {
    const signature = PermissionChecker.buildSignature(descriptor);

    // 1. 检查 deny 规则（优先级最高）
    for (const rule of this.config.deny) {
      if (this.matchesRule(signature, rule, descriptor)) {
        return {
          result: PermissionResult.DENY,
          matchedRule: rule,
          reason: `Denied by rule: ${rule}`,
        };
      }
    }

    // 2. 检查 allow 规则
    for (const rule of this.config.allow) {
      if (this.matchesRule(signature, rule, descriptor)) {
        return {
          result: PermissionResult.ALLOW,
          matchedRule: rule,
          reason: `Allowed by rule: ${rule}`,
        };
      }
    }

    // 3. 检查 ask 规则
    for (const rule of this.config.ask) {
      if (this.matchesRule(signature, rule, descriptor)) {
        return {
          result: PermissionResult.ASK,
          matchedRule: rule,
          reason: `Requires confirmation by rule: ${rule}`,
        };
      }
    }

    // 4. 默认 ASK
    return {
      result: PermissionResult.ASK,
      matchedRule: 'default',
      reason: 'No matching rule, requires confirmation',
    };
  }

  /**
   * 构建权限签名
   * 
   * 将结构化的工具调用转换成可匹配的字符串
   * 
   * 例如：
   * { toolName: "Bash", params: { command: "npm install" } }
   *   → "Bash(npm install)"
   */
  static buildSignature(descriptor: ToolInvocationDescriptor): string {
    const { toolName, params, tool } = descriptor;

    // 使用工具的 extractSignatureContent 方法（如果存在）
    if (tool?.extractSignatureContent) {
      const content = tool.extractSignatureContent(params);
      return `${toolName}(${content})`;
    }

    // 从常见参数提取签名内容
    const signatureContent = this.extractDefaultSignatureContent(toolName, params);
    if (signatureContent) {
      return `${toolName}(${signatureContent})`;
    }

    // 默认：只返回工具名
    return toolName;
  }

  /**
   * 从常见参数提取默认签名内容
   */
  private static extractDefaultSignatureContent(
    toolName: string,
    params: Record<string, unknown>
  ): string | null {
    switch (toolName) {
      case 'Bash':
        return typeof params.command === 'string' ? params.command : null;
      case 'Read':
      case 'Write':
      case 'Edit':
        return typeof params.file_path === 'string' ? params.file_path : null;
      case 'Glob':
      case 'Grep':
        return typeof params.pattern === 'string' ? params.pattern : null;
    }
    return null;
  }

  /**
   * 匹配规则
   */
  private matchesRule(
    signature: string,
    rule: string,
    descriptor: ToolInvocationDescriptor
  ): boolean {
    // 1. 精确匹配工具名
    if (rule === descriptor.toolName) {
      return true;
    }

    // 2. 解析规则格式：ToolName(pattern)
    const match = rule.match(/^(\w+)(?:\((.+)\))?$/);
    if (!match) {
      return false;
    }

    const [, ruleTool, rulePattern] = match;

    // 工具名不匹配
    if (ruleTool !== descriptor.toolName) {
      return false;
    }

    // 没有参数模式，匹配所有该工具的调用
    if (!rulePattern) {
      return true;
    }

    // 3. 提取签名内容
    const signatureContent = this.extractSignatureContent(signature);

    // 4. 匹配模式
    return this.matchPattern(signatureContent, rulePattern);
  }

  /**
   * 从签名中提取内容
   */
  private extractSignatureContent(signature: string): string {
    const match = signature.match(/^\w+\((.+)\)$/);
    return match ? match[1] : '';
  }

  /**
   * 模式匹配
   */
  private matchPattern(content: string, pattern: string): boolean {
    // 1. 前缀通配符 (npm:* 匹配 npm install, npm test 等)
    if (pattern.endsWith(':*')) {
      const prefix = pattern.slice(0, -2);
      return content.startsWith(prefix);
    }

    // 2. Glob 模式
    if (pattern.includes('*') || pattern.includes('?')) {
      return minimatch(content, pattern, { dot: true });
    }

    // 3. 精确匹配
    return content === pattern;
  }

  /**
   * 添加规则
   */
  addRule(type: 'allow' | 'deny' | 'ask', rule: string): void {
    this.config[type].push(rule);
  }

  /**
   * 获取配置
   */
  getConfig(): PermissionConfig {
    return { ...this.config };
  }
}
```

### 7.3.2 权限签名示例

| 工具 | 参数 | 签名 | 匹配规则示例 |
|------|------|------|--------------|
| Bash | `{ command: "npm test" }` | `Bash(npm test)` | `Bash(npm:*)` |
| Read | `{ file_path: "/src/main.ts" }` | `Read(/src/main.ts)` | `Read(**/*.ts)` |
| Write | `{ file_path: "/etc/passwd" }` | `Write(/etc/passwd)` | `Write(/etc/*)` ❌ DENY |

---

## 7.4 敏感文件检测

### 7.4.1 创建 SensitiveFileDetector

**文件位置**：`src/tools/validation/SensitiveFileDetector.ts`

```typescript
/**
 * 敏感文件检测器
 * 检测操作是否涉及敏感文件
 */

/**
 * 敏感级别
 */
export enum SensitivityLevel {
  LOW = 'low',       // 低敏感：配置文件
  MEDIUM = 'medium', // 中敏感：数据库、日志
  HIGH = 'high',     // 高敏感：密钥、凭证
}

/**
 * 敏感检测结果
 */
export interface SensitivityResult {
  sensitive: boolean;
  level?: SensitivityLevel;
  reason?: string;
}

/**
 * 敏感文件规则
 */
interface SensitivePattern {
  pattern: RegExp;
  level: SensitivityLevel;
  reason: string;
}

/**
 * 敏感文件检测器
 */
export class SensitiveFileDetector {
  /**
   * 敏感文件模式列表
   */
  private static readonly SENSITIVE_PATTERNS: SensitivePattern[] = [
    // 高敏感 - 密钥和凭证
    { pattern: /\.env$/, level: SensitivityLevel.HIGH, reason: '环境变量文件可能包含密钥' },
    { pattern: /\.env\.\w+$/, level: SensitivityLevel.HIGH, reason: '环境变量文件可能包含密钥' },
    { pattern: /credentials?\.json$/i, level: SensitivityLevel.HIGH, reason: '凭证文件' },
    { pattern: /secrets?\.json$/i, level: SensitivityLevel.HIGH, reason: '密钥文件' },
    { pattern: /\.pem$/, level: SensitivityLevel.HIGH, reason: '私钥文件' },
    { pattern: /\.key$/, level: SensitivityLevel.HIGH, reason: '密钥文件' },
    { pattern: /id_rsa/, level: SensitivityLevel.HIGH, reason: 'SSH 私钥' },
    { pattern: /id_ed25519/, level: SensitivityLevel.HIGH, reason: 'SSH 私钥' },
    { pattern: /\.p12$/, level: SensitivityLevel.HIGH, reason: '证书文件' },
    { pattern: /\.pfx$/, level: SensitivityLevel.HIGH, reason: '证书文件' },

    // 中敏感 - 数据和日志
    { pattern: /\.sqlite3?$/, level: SensitivityLevel.MEDIUM, reason: '数据库文件' },
    { pattern: /\.db$/, level: SensitivityLevel.MEDIUM, reason: '数据库文件' },
    { pattern: /\.log$/, level: SensitivityLevel.MEDIUM, reason: '日志文件可能包含敏感信息' },
    { pattern: /password/i, level: SensitivityLevel.MEDIUM, reason: '文件名包含 password' },

    // 低敏感 - 配置文件
    { pattern: /config\.json$/i, level: SensitivityLevel.LOW, reason: '配置文件' },
    { pattern: /settings\.json$/i, level: SensitivityLevel.LOW, reason: '设置文件' },
  ];

  /**
   * 检查单个文件
   */
  static check(filePath: string): SensitivityResult {
    for (const rule of this.SENSITIVE_PATTERNS) {
      if (rule.pattern.test(filePath)) {
        return {
          sensitive: true,
          level: rule.level,
          reason: rule.reason,
        };
      }
    }
    return { sensitive: false };
  }

  /**
   * 过滤出敏感文件
   */
  static filterSensitive(
    paths: string[],
    minLevel: SensitivityLevel = SensitivityLevel.LOW
  ): Array<{ path: string; result: SensitivityResult }> {
    const levelOrder = {
      [SensitivityLevel.LOW]: 1,
      [SensitivityLevel.MEDIUM]: 2,
      [SensitivityLevel.HIGH]: 3,
    };
    const minLevelOrder = levelOrder[minLevel];

    return paths
      .map(path => ({ path, result: this.check(path) }))
      .filter(item => {
        if (!item.result.sensitive || !item.result.level) {
          return false;
        }
        return levelOrder[item.result.level] >= minLevelOrder;
      });
  }

  /**
   * 获取最高敏感级别
   */
  static getHighestLevel(paths: string[]): SensitivityLevel | null {
    let highest: SensitivityLevel | null = null;
    const levelOrder = {
      [SensitivityLevel.LOW]: 1,
      [SensitivityLevel.MEDIUM]: 2,
      [SensitivityLevel.HIGH]: 3,
    };

    for (const path of paths) {
      const result = this.check(path);
      if (result.sensitive && result.level) {
        if (!highest || levelOrder[result.level] > levelOrder[highest]) {
          highest = result.level;
        }
      }
    }

    return highest;
  }
}
```

**敏感文件处理策略**：

| 敏感级别 | 处理策略 |
|----------|----------|
| HIGH | 直接拒绝（除非显式 allow） |
| MEDIUM | 强制用户确认 |
| LOW | 正常流程（根据权限模式） |

---

## 7.5 七个执行阶段实现

### 7.5.1 Stage 1: Discovery（工具发现）

**文件位置**：`src/tools/execution/stages/DiscoveryStage.ts`

```typescript
/**
 * Discovery Stage - 工具发现阶段
 * 从注册表中查找工具
 */

import type { PipelineStage, ToolExecution } from '../types.js';
import type { ToolRegistry } from '../../registry.js';

export class DiscoveryStage implements PipelineStage {
  readonly name = 'discovery';

  constructor(private registry: ToolRegistry) {}

  async process(execution: ToolExecution): Promise<void> {
    const tool = this.registry.get(execution.toolName);

    if (!tool) {
      execution.abort(`Tool "${execution.toolName}" not found in registry`);
      return;
    }

    // 将工具实例存入内部状态
    execution._internal.tool = tool;
  }
}
```

### 7.5.2 Stage 2: Permission（权限检查）

**文件位置**：`src/tools/execution/stages/PermissionStage.ts`

```typescript
/**
 * Permission Stage - 权限检查阶段
 * 验证参数、检查权限规则、检测敏感文件
 */

import { ToolKind } from '../../types.js';
import {
  PermissionMode,
  PermissionResult,
  type PipelineStage,
  type ToolExecution,
  type PermissionConfig,
  type PermissionCheckResult,
} from '../types.js';
import { PermissionChecker } from '../../validation/PermissionChecker.js';
import { SensitiveFileDetector, SensitivityLevel } from '../../validation/SensitiveFileDetector.js';

export class PermissionStage implements PipelineStage {
  readonly name = 'permission';
  private permissionChecker: PermissionChecker;
  private defaultMode: PermissionMode;

  constructor(
    config?: Partial<PermissionConfig>,
    private sessionApprovals?: Set<string>,
    defaultMode: PermissionMode = PermissionMode.DEFAULT
  ) {
    this.permissionChecker = new PermissionChecker(config);
    this.defaultMode = defaultMode;
  }

  async process(execution: ToolExecution): Promise<void> {
    const tool = execution._internal.tool;

    if (!tool) {
      execution.abort('Tool not found in execution context');
      return;
    }

    // 1. 创建工具调用实例（含 Zod 验证）
    try {
      const invocation = tool.build(execution.params);
      execution._internal.invocation = invocation;
    } catch (error) {
      execution.abort(
        `Parameter validation failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return;
    }

    // 2. 构建权限签名
    const signature = PermissionChecker.buildSignature({
      toolName: tool.name,
      params: execution.params,
      tool,
    });
    execution._internal.permissionSignature = signature;

    // 3. 检查会话批准列表
    if (this.sessionApprovals?.has(signature)) {
      return; // 已在会话中批准，跳过权限检查
    }

    // 4. 执行权限检查
    let checkResult = this.permissionChecker.check({
      toolName: tool.name,
      params: execution.params,
      tool,
    });

    // 5. 应用权限模式覆盖
    const currentMode = execution.context.permissionMode || this.defaultMode;
    checkResult = this.applyModeOverrides(tool.kind, checkResult, currentMode);

    // 6. 根据结果采取行动
    switch (checkResult.result) {
      case PermissionResult.DENY:
        execution.abort(checkResult.reason || 'Permission denied');
        return;

      case PermissionResult.ASK:
        execution._internal.needsConfirmation = true;
        execution._internal.confirmationReason =
          checkResult.reason || 'This operation requires confirmation';
        break;

      case PermissionResult.ALLOW:
        break; // 继续执行
    }

    // 7. 额外安全检查：敏感文件
    this.checkSensitiveFiles(execution);
  }

  /**
   * 应用权限模式覆盖
   * 
   * 优先级：YOLO > PLAN > deny规则 > allow规则 > 模式规则 > 默认ASK
   */
  private applyModeOverrides(
    toolKind: ToolKind,
    checkResult: PermissionCheckResult,
    permissionMode: PermissionMode
  ): PermissionCheckResult {
    // 1. YOLO 模式：批准所有
    if (permissionMode === PermissionMode.YOLO) {
      return {
        result: PermissionResult.ALLOW,
        matchedRule: 'mode:yolo',
        reason: 'YOLO mode: auto-approve all operations',
      };
    }

    // 2. PLAN 模式：拒绝非只读工具
    if (permissionMode === PermissionMode.PLAN) {
      if (toolKind !== ToolKind.ReadOnly) {
        return {
          result: PermissionResult.DENY,
          matchedRule: 'mode:plan',
          reason: 'Plan mode: only read-only tools allowed',
        };
      }
    }

    // 3. 已被 deny/allow 规则处理，不覆盖
    if (checkResult.result !== PermissionResult.ASK) {
      return checkResult;
    }

    // 4. 只读工具：所有模式下都批准
    if (toolKind === ToolKind.ReadOnly) {
      return {
        result: PermissionResult.ALLOW,
        matchedRule: `mode:${permissionMode}:readonly`,
        reason: 'Read-only tools are auto-approved',
      };
    }

    // 5. AUTO_EDIT 模式：批准 Write 工具
    if (permissionMode === PermissionMode.AUTO_EDIT && toolKind === ToolKind.Write) {
      return {
        result: PermissionResult.ALLOW,
        matchedRule: 'mode:autoEdit:write',
        reason: 'AUTO_EDIT mode: auto-approve write tools',
      };
    }

    // 6. 其他情况：保持原检查结果
    return checkResult;
  }

  /**
   * 检查敏感文件
   */
  private checkSensitiveFiles(execution: ToolExecution): void {
    const tool = execution._internal.tool;
    if (!tool || tool.kind === ToolKind.ReadOnly) return;

    // 获取受影响的文件路径
    const affectedPaths = this.getAffectedPaths(execution);
    if (affectedPaths.length === 0) return;

    // 检查敏感文件
    const sensitiveFiles = SensitiveFileDetector.filterSensitive(
      affectedPaths,
      SensitivityLevel.MEDIUM
    );

    if (sensitiveFiles.length === 0) return;

    // 高敏感文件直接拒绝
    const highSensitive = sensitiveFiles.filter(
      f => f.result.level === SensitivityLevel.HIGH
    );

    if (highSensitive.length > 0) {
      const files = highSensitive.map(f => f.path).join(', ');
      execution.abort(`Access to highly sensitive files denied: ${files}`);
      return;
    }

    // 中敏感文件需要确认
    execution._internal.needsConfirmation = true;
    const reasons = sensitiveFiles.map(f => `${f.path}: ${f.result.reason}`);
    execution._internal.confirmationReason = `Sensitive file access:\n${reasons.join('\n')}`;
  }

  private getAffectedPaths(execution: ToolExecution): string[] {
    const params = execution.params;
    const pathKeys = ['file_path', 'path', 'target', 'destination'];
    const paths: string[] = [];

    for (const key of pathKeys) {
      if (typeof params[key] === 'string') {
        paths.push(params[key] as string);
      }
    }

    return paths;
  }
}
```

### 7.5.3 Stage 3: Hook (Pre)

**文件位置**：`src/tools/execution/stages/HookStage.ts`

```typescript
/**
 * Hook Stage - Pre-Tool Hook 阶段
 * 执行工具使用前的钩子
 */

import type { PipelineStage, ToolExecution } from '../types.js';

export class HookStage implements PipelineStage {
  readonly name = 'hook';

  async process(execution: ToolExecution): Promise<void> {
    // TODO: 实现 HookManager 集成
    // 目前是空实现，后续可以添加：
    // - 日志记录
    // - 参数修改
    // - 自定义验证
    // - 指标收集
  }
}
```

### 7.5.4 Stage 4: Confirmation（用户确认）

**文件位置**：`src/tools/execution/stages/ConfirmationStage.ts`

```typescript
/**
 * Confirmation Stage - 用户确认阶段
 * 请求用户确认危险操作
 */

import type {
  PipelineStage,
  ToolExecution,
  ConfirmationDetails,
} from '../types.js';

export class ConfirmationStage implements PipelineStage {
  readonly name = 'confirmation';

  constructor(private sessionApprovals: Set<string>) {}

  async process(execution: ToolExecution): Promise<void> {
    // 如果不需要确认，直接通过
    if (!execution._internal.needsConfirmation) {
      return;
    }

    const tool = execution._internal.tool;
    if (!tool) {
      execution.abort('Tool not found in execution context');
      return;
    }

    // 检查是否已在会话中批准
    const signature = execution._internal.permissionSignature;
    if (signature && this.sessionApprovals.has(signature)) {
      return;
    }

    // 构建确认详情
    const confirmationDetails: ConfirmationDetails = {
      title: `Permission Required: ${tool.name}`,
      message: execution._internal.confirmationReason || 'This operation requires your confirmation',
      details: this.generatePreview(execution),
      risks: this.extractRisks(execution),
      affectedFiles: this.getAffectedPaths(execution),
    };

    // 请求用户确认
    const handler = execution.context.confirmationHandler;
    if (!handler) {
      execution.abort('No confirmation handler - operation requires user approval');
      return;
    }

    const response = await handler.requestConfirmation(confirmationDetails);

    if (!response.approved) {
      execution.abort(`User rejected: ${response.reason || 'No reason provided'}`);
      return;
    }

    // 如果用户选择"记住此决定"，保存到会话批准列表
    if (response.scope === 'session' && signature) {
      this.sessionApprovals.add(signature);
    }
  }

  /**
   * 生成操作预览
   */
  private generatePreview(execution: ToolExecution): string | undefined {
    const { toolName, params } = execution;

    switch (toolName) {
      case 'Edit': {
        const oldString = params.old_string as string;
        const newString = params.new_string as string;
        const filePath = params.file_path as string;

        return `**File:** ${filePath}\n\n**Before:**\n\`\`\`\n${this.truncate(oldString, 10)}\n\`\`\`\n\n**After:**\n\`\`\`\n${this.truncate(newString, 10)}\n\`\`\``;
      }

      case 'Write': {
        const content = params.contents as string;
        const filePath = params.file_path as string;

        return `**File:** ${filePath}\n\n**Content Preview:**\n\`\`\`\n${this.truncate(content, 20)}\n\`\`\``;
      }

      case 'Bash': {
        const command = params.command as string;
        const cwd = params.working_directory as string;

        return `**Command:** \`${command}\`${cwd ? `\n**Directory:** ${cwd}` : ''}`;
      }

      default:
        return undefined;
    }
  }

  /**
   * 提取风险信息
   */
  private extractRisks(execution: ToolExecution): string[] {
    const risks: string[] = [];
    const { toolName, params } = execution;
    const tool = execution._internal.tool;

    if (tool?.kind === 'write') {
      risks.push('This operation will modify files');
    } else if (tool?.kind === 'execute') {
      risks.push('This operation will execute system commands');
    }

    if (toolName === 'Bash') {
      const command = params.command as string;
      if (command.includes('rm')) risks.push('Command may delete files');
      if (command.includes('sudo')) risks.push('Command requires elevated privileges');
      if (command.includes('|')) risks.push('Command uses piping');
    }

    return risks;
  }

  private getAffectedPaths(execution: ToolExecution): string[] {
    const params = execution.params;
    const pathKeys = ['file_path', 'path', 'target', 'destination'];
    return pathKeys
      .filter(key => typeof params[key] === 'string')
      .map(key => params[key] as string);
  }

  private truncate(text: string, maxLines: number = 10): string {
    const lines = text.split('\n');
    if (lines.length <= maxLines) return text;
    return lines.slice(0, maxLines).join('\n') + `\n... (${lines.length - maxLines} more lines)`;
  }
}
```

### 7.5.5 Stage 5: Execution（实际执行）

**文件位置**：`src/tools/execution/stages/ExecutionStage.ts`

```typescript
/**
 * Execution Stage - 实际执行阶段
 * 执行工具
 */

import type { PipelineStage, ToolExecution } from '../types.js';

export class ExecutionStage implements PipelineStage {
  readonly name = 'execution';

  async process(execution: ToolExecution): Promise<void> {
    const tool = execution._internal.tool;

    if (!tool) {
      execution.abort('Tool not found in execution context');
      return;
    }

    try {
      // 执行工具
      const result = await tool.execute(execution.params, {
        sessionId: execution.context.sessionId,
        signal: execution.context.signal,
        cwd: execution.context.workspaceRoot,
      });

      execution.setResult(result);
    } catch (error) {
      execution.abort(
        `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
```

### 7.5.6 Stage 6: PostHook

**文件位置**：`src/tools/execution/stages/PostHookStage.ts`

```typescript
/**
 * PostHook Stage - Post-Tool Hook 阶段
 */

import type { PipelineStage, ToolExecution } from '../types.js';

export class PostHookStage implements PipelineStage {
  readonly name = 'postHook';

  async process(execution: ToolExecution): Promise<void> {
    // TODO: 实现 PostToolUse Hooks
    // - 结果日志记录
    // - 指标上报
    // - 结果修改
  }
}
```

### 7.5.7 Stage 7: Formatting（结果格式化）

**文件位置**：`src/tools/execution/stages/FormattingStage.ts`

```typescript
/**
 * Formatting Stage - 结果格式化阶段
 */

import type { PipelineStage, ToolExecution } from '../types.js';

export class FormattingStage implements PipelineStage {
  readonly name = 'formatting';

  async process(execution: ToolExecution): Promise<void> {
    const result = execution.getResult();
    if (!result) return;

    // 确保格式正确
    if (!result.llmContent) {
      result.llmContent = result.success ? 'Execution completed' : 'Execution failed';
    }
    if (!result.displayContent) {
      result.displayContent = result.success ? '✅ 执行成功' : '❌ 执行失败';
    }

    // 添加元数据
    result.metadata = {
      ...result.metadata,
      executionId: execution.context.sessionId,
      toolName: execution.toolName,
      timestamp: Date.now(),
    };

    execution.setResult(result);
  }
}
```

### 7.5.8 阶段导出

**文件位置**：`src/tools/execution/stages/index.ts`

```typescript
/**
 * 执行阶段导出
 */

export { DiscoveryStage } from './DiscoveryStage.js';
export { PermissionStage } from './PermissionStage.js';
export { HookStage } from './HookStage.js';
export { ConfirmationStage } from './ConfirmationStage.js';
export { ExecutionStage } from './ExecutionStage.js';
export { PostHookStage } from './PostHookStage.js';
export { FormattingStage } from './FormattingStage.js';
```

---

## 7.6 ExecutionPipeline 主类

**文件位置**：`src/tools/execution/ExecutionPipeline.ts`

```typescript
/**
 * ExecutionPipeline - 执行管道
 * 七阶段管道，将工具系统与 Agent 连接
 */

import { EventEmitter } from 'events';
import {
  ToolExecution,
  PermissionMode,
  type PipelineStage,
  type PipelineExecutionContext,
  type ExecutionPipelineConfig,
  type ExecutionHistoryEntry,
} from './types.js';
import type { ToolResult, ToolErrorType } from '../types.js';
import type { ToolRegistry } from '../registry.js';
import {
  DiscoveryStage,
  PermissionStage,
  HookStage,
  ConfirmationStage,
  ExecutionStage,
  PostHookStage,
  FormattingStage,
} from './stages/index.js';

/**
 * 执行管道
 */
export class ExecutionPipeline extends EventEmitter {
  private stages: PipelineStage[];
  private executionHistory: ExecutionHistoryEntry[] = [];
  private readonly sessionApprovals = new Set<string>();
  private readonly maxHistorySize = 1000;

  constructor(
    private registry: ToolRegistry,
    config: ExecutionPipelineConfig = {}
  ) {
    super();

    const defaultMode = config.defaultMode || PermissionMode.DEFAULT;

    // 初始化七个执行阶段
    this.stages = [
      new DiscoveryStage(this.registry),
      new PermissionStage(config.permissions, this.sessionApprovals, defaultMode),
      new HookStage(),
      new ConfirmationStage(this.sessionApprovals),
      new ExecutionStage(),
      new PostHookStage(),
      new FormattingStage(),
    ];
  }

  /**
   * 执行工具调用
   */
  async execute(
    toolName: string,
    params: Record<string, unknown>,
    context: PipelineExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now();
    const executedStages: string[] = [];

    // 创建执行实例
    const execution = new ToolExecution(toolName, params, context);

    // 发出执行开始事件
    this.emit('executionStart', execution);

    try {
      // 依次执行各阶段
      for (const stage of this.stages) {
        if (execution.isAborted()) {
          break;
        }

        this.emit('stageStart', { stage: stage.name, execution });
        await stage.process(execution);
        executedStages.push(stage.name);
        this.emit('stageComplete', { stage: stage.name, execution });
      }

      // 获取或创建结果
      const result = execution.getResult() || this.createErrorResult(execution);

      // 记录执行历史
      this.recordExecution({
        toolName,
        params,
        result,
        timestamp: startTime,
        duration: Date.now() - startTime,
        permissionMode: context.permissionMode,
        stages: executedStages,
      });

      this.emit('executionComplete', execution, result);

      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('executionError', execution, err);

      return {
        success: false,
        llmContent: `Pipeline error: ${err.message}`,
        displayContent: `❌ Pipeline error: ${err.message}`,
        error: {
          type: 'execution_error' as ToolErrorType,
          message: err.message,
        },
      };
    }
  }

  private createErrorResult(execution: ToolExecution): ToolResult {
    const reason = execution.getAbortReason() || 'Unknown error';
    return {
      success: false,
      llmContent: `Tool execution aborted: ${reason}`,
      displayContent: `❌ ${execution.toolName}: ${reason}`,
      error: {
        type: 'execution_error' as ToolErrorType,
        message: reason,
      },
    };
  }

  private recordExecution(entry: ExecutionHistoryEntry): void {
    this.executionHistory.push(entry);
    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory.shift();
    }
  }

  getRegistry(): ToolRegistry {
    return this.registry;
  }

  getHistory(): ExecutionHistoryEntry[] {
    return [...this.executionHistory];
  }

  clearSessionApprovals(): void {
    this.sessionApprovals.clear();
  }

  addSessionApproval(signature: string): void {
    this.sessionApprovals.add(signature);
  }

  hasSessionApproval(signature: string): boolean {
    return this.sessionApprovals.has(signature);
  }
}
```

---

## 7.7 集成到 Agent

### 7.7.1 更新 Agent 初始化

**文件位置**：`src/agent/Agent.ts`（在第 4 章基础上修改）

```typescript
// 【第 7 章修改】导入执行管道
import {
  ExecutionPipeline,
  ToolRegistry,
  createToolRegistry,
  getBuiltinTools,
  PermissionMode,
  type PipelineExecutionContext,
} from '../tools/index.js';
import { configManager } from '../config/ConfigManager.js';

export class Agent {
  // ...原有代码...
  
  // 【新增】执行管道
  private executionPipeline!: ExecutionPipeline;

  private async initialize(): Promise<void> {
    // ...原有初始化代码...

    // 3. 初始化工具系统
    this.toolRegistry = createToolRegistry();
    const builtinTools = getBuiltinTools();
    for (const tool of builtinTools) {
      this.toolRegistry.register(tool);
    }

    // 【新增】4. 创建执行管道
    const permissionConfig = configManager.getPermissionConfig();
    const defaultMode = configManager.getDefaultPermissionMode() as 'default' | 'autoEdit' | 'yolo' | 'plan';
    
    this.executionPipeline = new ExecutionPipeline(this.toolRegistry, {
      permissions: permissionConfig,
      defaultMode: this.mapPermissionMode(defaultMode),
    });

    this.isInitialized = true;
  }

  // 【修改】使用执行管道执行工具
  private async executeToolCall(
    toolCall: ToolCall,
    context: ChatContext
  ): Promise<ToolResult> {
    // 解析工具参数
    let params: Record<string, unknown>;
    try {
      params = JSON.parse(toolCall.function.arguments);
    } catch {
      return {
        success: false,
        error: `Invalid tool arguments`,
        displayContent: `❌ Invalid arguments for ${toolCall.function.name}`,
        llmContent: `Error: Failed to parse tool arguments as JSON.`,
      };
    }

    // 构建执行上下文
    const pipelineContext: PipelineExecutionContext = {
      sessionId: context.sessionId,
      workspaceRoot: process.cwd(),
      permissionMode: this.mapPermissionMode(context.permissionMode),
      signal: context.signal,
      confirmationHandler: context.confirmationHandler,
      messageId: toolCall.id,
    };

    // 通过执行管道执行工具
    const result = await this.executionPipeline.execute(
      toolCall.function.name,
      params,
      pipelineContext
    );

    return {
      success: result.success,
      displayContent: result.displayContent,
      llmContent: result.llmContent,
      error: result.error?.message,
      metadata: result.metadata,
    };
  }

  private mapPermissionMode(mode?: string): PermissionMode {
    switch (mode) {
      case 'autoEdit': return PermissionMode.AUTO_EDIT;
      case 'yolo': return PermissionMode.YOLO;
      case 'plan': return PermissionMode.PLAN;
      default: return PermissionMode.DEFAULT;
    }
  }
}
```

---

## 7.8 执行流程图

```
┌─────────────────────────────────────────────────────────────────┐
│                        工具调用请求                              │
└─────────────────────────┬───────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. Discovery                                                    │
│  ├─ 查找工具                                                     │
│  └─ 找不到 → 中止                                                │
└─────────────────────────┬───────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. Permission                                                   │
│  ├─ Zod 参数验证                                                 │
│  ├─ 构建权限签名                                                 │
│  ├─ 检查 deny 规则 → 匹配则中止                                   │
│  ├─ 检查 allow 规则                                              │
│  ├─ 应用模式覆盖                                                 │
│  └─ 检查敏感文件                                                 │
└─────────────────────────┬───────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. Hook (Pre)                                                   │
│  └─ 执行 PreToolUse Hooks                                        │
└─────────────────────────┬───────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. Confirmation                                                 │
│  ├─ 不需要确认 → 跳过                                            │
│  ├─ 请求用户确认                                                 │
│  ├─ 用户拒绝 → 中止                                              │
│  └─ 用户批准 → 继续（可记住决定）                                 │
└─────────────────────────┬───────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. Execution                                                    │
│  └─ 执行工具                                                     │
└─────────────────────────┬───────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  6. Hook (Post)                                                  │
│  └─ 执行 PostToolUse Hooks                                       │
└─────────────────────────┬───────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  7. Formatting                                                   │
│  └─ 格式化结果、添加元数据                                       │
└─────────────────────────┬───────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                        返回结果                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7.9 本章小结

### 完成的内容

| 文件 | 内容 |
|------|------|
| `src/tools/execution/types.ts` | 执行管道类型定义 |
| `src/tools/validation/PermissionChecker.ts` | 权限检查器 |
| `src/tools/validation/SensitiveFileDetector.ts` | 敏感文件检测器 |
| `src/tools/execution/stages/*.ts` | 七个执行阶段 |
| `src/tools/execution/ExecutionPipeline.ts` | 执行管道主类 |

### 技术亮点

| 亮点 | 说明 |
|------|------|
| **七阶段分离** | 每个阶段只关注一件事，易于测试和扩展 |
| **权限模式覆盖** | YOLO > PLAN > deny > allow > mode > ASK |
| **敏感文件分级** | HIGH → 拒绝, MEDIUM → 确认, LOW → 正常 |
| **会话批准记忆** | 避免重复确认相同操作 |
| **权限签名** | 将工具调用转换为可匹配的字符串 |

---

## 7.10 本章遗留项

::: info 以下功能将在后续章节实现
根据项目规划，部分功能需要其他模块支持，将在后续章节补充。
:::

| 功能 | 说明 | 计划章节 |
|------|------|----------|
| **HookManager 完整实现** | Pre/Post Tool Hooks 管理器 | 第 12 章 |
| **交互式确认 UI 集成** | 将 ConfirmationPrompt 集成到主 UI 流程 | 第 11 章 |

### 当前状态

本章实现的执行管道是**完整可用**的，包括：
- ✅ 七阶段管道架构
- ✅ 权限检查和敏感文件检测
- ✅ 权限模式（DEFAULT/AUTO_EDIT/YOLO/PLAN）
- ✅ ConfirmationPrompt 组件（独立可用）
- ⏳ HookStage 和 PostHookStage 目前是空实现

---

## 下一章预告

在 **第八章** 中，我们将：
1. 实现上下文管理器
2. 实现 Token 计数
3. 实现对话压缩服务
4. 实现会话持久化（JSONL 格式）

这将让 Agent 能够处理长对话并支持会话恢复！
