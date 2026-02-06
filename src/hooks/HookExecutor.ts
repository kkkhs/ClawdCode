/**
 * Hook 执行器
 * 
 * 负责执行 Hook 命令，处理输入输出，解析结果。
 */

import { spawn } from 'node:child_process';
import type {
  Hook,
  CommandHook,
  HookInput,
  HookExecutionContext,
  HookExecutionResult,
  HookExitCode,
  HookSpecificOutput,
  PreToolHookResult,
  PostToolHookResult,
  PermissionHookResult,
  StopHookResult,
  UserPromptHookResult,
  CompactionHookResult,
} from './types.js';

/**
 * Hook 执行器
 */
export class HookExecutor {
  /**
   * 执行 PreToolUse Hooks（串行）
   * 
   * 串行原因：
   * 1. 第一个 deny 需要立即中断
   * 2. updatedInput 需要累积应用
   */
  async executePreToolHooks(
    hooks: Hook[],
    input: HookInput,
    context: HookExecutionContext
  ): Promise<PreToolHookResult> {
    let cumulativeInput = (input as { tool_input?: Record<string, unknown> }).tool_input || {};
    const warnings: string[] = [];

    for (const hook of hooks) {
      const hookInput = { ...input, tool_input: cumulativeInput };
      const result = await this.executeHook(hook, hookInput, context);

      // 处理执行失败
      if (!result.success) {
        if (result.blocking) {
          return { decision: 'deny', reason: result.error };
        }
        if (result.needsConfirmation) {
          return { decision: 'ask', reason: result.warning };
        }
        if (result.warning) {
          warnings.push(result.warning);
        }
        continue;
      }

      // 处理 hookSpecificOutput
      const specific = result.output?.hookSpecificOutput;
      if (specific && 'permissionDecision' in specific) {
        if (specific.permissionDecision === 'deny') {
          return { decision: 'deny', reason: specific.permissionDecisionReason };
        }
        if (specific.permissionDecision === 'ask') {
          return { decision: 'ask', reason: specific.permissionDecisionReason };
        }
        // 累积 updatedInput
        if (specific.updatedInput) {
          cumulativeInput = { ...cumulativeInput, ...specific.updatedInput };
        }
      }
    }

    return {
      decision: 'allow',
      modifiedInput: cumulativeInput,
      warning: warnings.length > 0 ? warnings.join('\n') : undefined,
    };
  }

  /**
   * 执行 PostToolUse Hooks（并行）
   * 
   * 并行原因：提高性能，结果可合并
   */
  async executePostToolHooks(
    hooks: Hook[],
    input: HookInput,
    context: HookExecutionContext
  ): Promise<PostToolHookResult> {
    const maxConcurrent = context.config.maxConcurrentHooks || 5;
    const results = await this.executeHooksConcurrently(hooks, input, context, maxConcurrent);

    // 合并结果
    const additionalContexts: string[] = [];
    let modifiedOutput: unknown;

    for (const result of results) {
      // 如果有 stdout 输出，作为额外上下文
      if (result.stdout && result.stdout.trim()) {
        additionalContexts.push(result.stdout.trim());
      }

      const specific = result.output?.hookSpecificOutput;
      if (specific && 'additionalContext' in specific) {
        if (specific.additionalContext) {
          additionalContexts.push(specific.additionalContext);
        }
        if (specific.updatedOutput !== undefined) {
          modifiedOutput = specific.updatedOutput;
        }
      }
    }

    return {
      additionalContext: additionalContexts.length > 0 
        ? additionalContexts.join('\n\n') 
        : undefined,
      modifiedOutput,
    };
  }

  /**
   * 执行 PermissionRequest Hooks（串行）
   * 
   * 第一个明确决策即返回
   */
  async executePermissionHooks(
    hooks: Hook[],
    input: HookInput,
    context: HookExecutionContext
  ): Promise<PermissionHookResult> {
    for (const hook of hooks) {
      const result = await this.executeHook(hook, input, context);

      if (!result.success) continue;

      const specific = result.output?.hookSpecificOutput;
      if (specific && 'decision' in specific) {
        if (specific.decision === 'approve' || specific.decision === 'deny') {
          return { decision: specific.decision, reason: specific.reason };
        }
      }
    }

    return { decision: 'ask' };
  }

  /**
   * 执行 Stop Hooks（串行）
   * 
   * 第一个 continue:true 即返回
   */
  async executeStopHooks(
    hooks: Hook[],
    input: HookInput,
    context: HookExecutionContext
  ): Promise<StopHookResult> {
    for (const hook of hooks) {
      const result = await this.executeHook(hook, input, context);

      if (!result.success) continue;

      const specific = result.output?.hookSpecificOutput;
      if (specific && 'continue' in specific && specific.continue) {
        return { shouldContinue: true, reason: specific.reason };
      }
    }

    return { shouldContinue: false };
  }

  /**
   * 执行 UserPromptSubmit Hooks（并行）
   * 
   * stdout 合并注入
   */
  async executeUserPromptHooks(
    hooks: Hook[],
    input: HookInput,
    context: HookExecutionContext
  ): Promise<UserPromptHookResult> {
    const maxConcurrent = context.config.maxConcurrentHooks || 5;
    const results = await this.executeHooksConcurrently(hooks, input, context, maxConcurrent);

    const contexts: string[] = [];

    for (const result of results) {
      if (result.success && result.stdout && result.stdout.trim()) {
        contexts.push(result.stdout.trim());
      }
    }

    return {
      injectedContext: contexts.length > 0 ? contexts.join('\n\n') : undefined,
    };
  }

  /**
   * 执行 Compaction Hooks（串行）
   */
  async executeCompactionHooks(
    hooks: Hook[],
    input: HookInput,
    context: HookExecutionContext
  ): Promise<CompactionHookResult> {
    for (const hook of hooks) {
      const result = await this.executeHook(hook, input, context);

      if (!result.success) continue;

      const specific = result.output?.hookSpecificOutput;
      if (specific && 'prevent' in specific && specific.prevent) {
        return { shouldPrevent: true, reason: specific.reason };
      }
    }

    return { shouldPrevent: false };
  }

  /**
   * 执行通用 Hooks（并行，无返回值处理）
   */
  async executeGenericHooks(
    hooks: Hook[],
    input: HookInput,
    context: HookExecutionContext
  ): Promise<void> {
    const maxConcurrent = context.config.maxConcurrentHooks || 5;
    await this.executeHooksConcurrently(hooks, input, context, maxConcurrent);
  }

  /**
   * 并发执行 Hooks
   */
  private async executeHooksConcurrently(
    hooks: Hook[],
    input: HookInput,
    context: HookExecutionContext,
    maxConcurrent: number
  ): Promise<HookExecutionResult[]> {
    const results: HookExecutionResult[] = [];
    
    // 分批执行
    for (let i = 0; i < hooks.length; i += maxConcurrent) {
      const batch = hooks.slice(i, i + maxConcurrent);
      const batchResults = await Promise.all(
        batch.map(hook => this.executeHook(hook, input, context))
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * 执行单个 Hook
   */
  private async executeHook(
    hook: Hook,
    input: HookInput,
    context: HookExecutionContext
  ): Promise<HookExecutionResult> {
    if (hook.type === 'command') {
      return this.executeCommandHook(hook, input, context);
    }

    return {
      success: false,
      exitCode: 1,
      stdout: '',
      stderr: `Unknown hook type: ${(hook as { type: string }).type}`,
      duration: 0,
      error: 'Unknown hook type',
    };
  }

  /**
   * 执行命令 Hook
   */
  private async executeCommandHook(
    hook: CommandHook,
    input: HookInput,
    context: HookExecutionContext
  ): Promise<HookExecutionResult> {
    const timeoutMs = (hook.timeout ?? context.config.defaultTimeout ?? 60) * 1000;
    const startTime = Date.now();

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      // 启动子进程
      const child = spawn('sh', ['-c', hook.command], {
        cwd: context.projectDir,
        env: {
          ...process.env,
          // 注入环境变量
          HOOK_EVENT: input.hook_event_name,
          SESSION_ID: input.session_id,
          PROJECT_DIR: input.project_dir,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // 发送 JSON 输入到 stdin
      child.stdin.write(JSON.stringify(input));
      child.stdin.end();

      // 收集输出
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // 超时处理
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, timeoutMs);

      // 完成处理
      child.on('close', (code) => {
        clearTimeout(timer);
        const duration = Date.now() - startTime;

        if (timedOut) {
          resolve(this.handleTimeout(context, duration));
          return;
        }

        const exitCode = code ?? 0;
        resolve(this.parseResult(exitCode, stdout, stderr, duration, context));
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        const duration = Date.now() - startTime;
        resolve({
          success: false,
          exitCode: 1,
          stdout,
          stderr: err.message,
          duration,
          error: err.message,
        });
      });
    });
  }

  /**
   * 处理超时
   */
  private handleTimeout(
    context: HookExecutionContext,
    duration: number
  ): HookExecutionResult {
    const behavior = context.config.timeoutBehavior || 'ignore';

    return {
      success: behavior === 'ignore',
      exitCode: 124, // HookExitCode.TIMEOUT
      stdout: '',
      stderr: 'Hook execution timed out',
      duration,
      error: 'Timeout',
      blocking: behavior === 'deny',
      needsConfirmation: behavior === 'ask',
      warning: 'Hook timed out',
    };
  }

  /**
   * 解析执行结果
   */
  private parseResult(
    exitCode: number,
    stdout: string,
    stderr: string,
    duration: number,
    context: HookExecutionContext
  ): HookExecutionResult {
    const result: HookExecutionResult = {
      success: exitCode === 0,
      exitCode,
      stdout,
      stderr,
      duration,
    };

    // 处理退出码
    if (exitCode === 2) {
      // BLOCKING_ERROR
      result.blocking = true;
      result.error = stderr || 'Blocking error';
      return result;
    }

    if (exitCode === 1) {
      // NON_BLOCKING_ERROR
      const behavior = context.config.failureBehavior || 'ignore';
      result.success = behavior === 'ignore';
      result.blocking = behavior === 'deny';
      result.needsConfirmation = behavior === 'ask';
      result.warning = stderr || 'Non-blocking error';
      return result;
    }

    // 成功 - 尝试解析 JSON 输出
    if (stdout.trim()) {
      try {
        const parsed = JSON.parse(stdout.trim());
        result.output = {
          hookSpecificOutput: parsed.hookSpecificOutput || parsed,
          rawOutput: stdout,
        };
      } catch {
        // 非 JSON 输出，作为原始文本
        result.output = {
          rawOutput: stdout,
        };
      }
    }

    return result;
  }
}
