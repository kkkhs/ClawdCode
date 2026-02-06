/**
 * Store 选择器
 * 
 * 提供细粒度的状态访问，优化 React 渲染性能
 */

import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { vanillaStore } from './vanilla.js';
import type { ClawdStore, SessionMessage, TodoItem, FocusId } from './types.js';
import type { ModelConfig, PermissionMode } from '../config/types.js';

// ========== 基础 Hook ==========

/**
 * React Hook - 订阅 Clawd Store
 */
export function useClawdStore<T>(selector: (state: ClawdStore) => T): T {
  return useStore(vanillaStore, selector);
}

// ========== Session 选择器 ==========

export const useSessionId = () =>
  useClawdStore((state) => state.session.sessionId);

export const useMessages = () =>
  useClawdStore((state) => state.session.messages);

export const useIsThinking = () =>
  useClawdStore((state) => state.session.isThinking);

export const useIsCompacting = () =>
  useClawdStore((state) => state.session.isCompacting);

export const useSessionError = () =>
  useClawdStore((state) => state.session.error);

export const useCurrentCommand = () =>
  useClawdStore((state) => state.session.currentCommand);

export const useTokenUsage = () =>
  useClawdStore((state) => state.session.tokenUsage);

// ========== Config 选择器 ==========

export const useConfig = () =>
  useClawdStore((state) => state.config.config);

export const useTheme = () =>
  useClawdStore((state) => state.config.config?.theme || 'dark');

export const usePermissionMode = () =>
  useClawdStore(
    (state) => (state.config.config?.defaultPermissionMode || 'default') as PermissionMode
  );

// 常量空引用，避免重渲染
const EMPTY_MODELS: ModelConfig[] = [];

export const useAllModels = () =>
  useClawdStore(
    (state) => state.config.config?.models ?? EMPTY_MODELS
  );

/**
 * 获取当前模型
 */
export const useCurrentModel = () =>
  useClawdStore((state) => {
    const config = state.config.config;
    if (!config) return undefined;

    // 优先使用 currentModelId
    if (config.currentModelId && config.models) {
      const model = config.models.find((m) => m.id === config.currentModelId);
      if (model) return model;
    }

    // 回退到 models[0]
    if (config.models && config.models.length > 0) {
      return config.models[0];
    }

    // 回退到 default
    return config.default;
  });

// ========== App 选择器 ==========

export const useInitializationStatus = () =>
  useClawdStore((state) => state.app.initializationStatus);

export const useInitializationError = () =>
  useClawdStore((state) => state.app.initializationError);

export const useActiveModal = () =>
  useClawdStore((state) => state.app.activeModal);

export const useTodos = () =>
  useClawdStore((state) => state.app.todos);

export const useAwaitingSecondCtrlC = () =>
  useClawdStore((state) => state.app.awaitingSecondCtrlC);

export const useShowAllThinking = () =>
  useClawdStore((state) => state.app.showAllThinking);

// ========== Focus 选择器 ==========

export const useCurrentFocus = () =>
  useClawdStore((state) => state.focus.currentFocus);

export const usePreviousFocus = () =>
  useClawdStore((state) => state.focus.previousFocus);

// ========== Command 选择器 ==========

export const useIsProcessing = () =>
  useClawdStore((state) => state.command.isProcessing);

export const usePendingCommands = () =>
  useClawdStore((state) => state.command.pendingCommands);

// ========== 派生选择器 ==========

/**
 * 计算上下文剩余百分比
 */
export const useContextRemaining = () =>
  useClawdStore((state) => {
    const { inputTokens, maxContextTokens } = state.session.tokenUsage;
    if (maxContextTokens <= 0) return 100;
    return Math.round(Math.max(0, 100 - (inputTokens / maxContextTokens) * 100));
  });

/**
 * 判断输入是否禁用
 */
export const useIsInputDisabled = () =>
  useClawdStore((state) => {
    const isThinking = state.session.isThinking;
    const isReady = state.app.initializationStatus === 'ready';
    const hasModal =
      state.app.activeModal !== 'none' &&
      state.app.activeModal !== 'shortcuts';
    return isThinking || !isReady || hasModal;
  });

/**
 * 判断是否忙碌
 */
export const useIsBusy = () =>
  useClawdStore(
    (state) => state.session.isThinking || state.command.isProcessing
  );

/**
 * 获取 Todo 统计
 */
export const useTodoStats = () =>
  useClawdStore(
    useShallow((state) => {
      const todos = state.app.todos;
      return {
        total: todos.length,
        completed: todos.filter((t) => t.status === 'completed').length,
        inProgress: todos.filter((t) => t.status === 'in_progress').length,
        pending: todos.filter((t) => t.status === 'pending').length,
      };
    })
  );

// ========== 细粒度消息选择器 ==========

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
  useClawdStore(
    useShallow((state) => state.session.messages.map(m => m.id))
  );

/**
 * 判断是否有流式消息
 */
export const useHasStreamingMessage = () =>
  useClawdStore((state) => state.session.messages.some(m => m.isStreaming));

/**
 * 获取流式消息 ID
 */
export const useStreamingMessageId = () =>
  useClawdStore((state) => {
    const streaming = state.session.messages.find(m => m.isStreaming);
    return streaming?.id ?? null;
  });

// ========== 组合选择器（使用 useShallow）==========

/**
 * 会话状态组合
 */
export const useSessionState = () =>
  useClawdStore(
    useShallow((state) => ({
      sessionId: state.session.sessionId,
      messages: state.session.messages,
      isThinking: state.session.isThinking,
      currentCommand: state.session.currentCommand,
      error: state.session.error,
    }))
  );

/**
 * 应用状态组合
 */
export const useAppState = () =>
  useClawdStore(
    useShallow((state) => ({
      initializationStatus: state.app.initializationStatus,
      initializationError: state.app.initializationError,
      activeModal: state.app.activeModal,
    }))
  );
