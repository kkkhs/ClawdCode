/**
 * Zustand Store 类型定义
 */

import type { RuntimeConfig } from '../config/types.js';

// ========== 会话状态 ==========

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  maxContextTokens: number;
}

export interface SessionMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  toolCalls?: unknown[];
  toolCallId?: string;
}

export interface SessionState {
  sessionId: string;
  messages: SessionMessage[];
  isThinking: boolean;
  isCompacting: boolean;
  currentCommand: string | null;
  error: string | null;
  isActive: boolean;
  tokenUsage: TokenUsage;
}

export interface SessionActions {
  addMessage: (message: SessionMessage) => void;
  addUserMessage: (content: string) => void;
  addAssistantMessage: (content: string) => void;
  setThinking: (isThinking: boolean) => void;
  setCompacting: (isCompacting: boolean) => void;
  setCurrentCommand: (command: string | null) => void;
  setError: (error: string | null) => void;
  setSessionId: (sessionId: string) => void;
  restoreSession: (sessionId: string, messages: SessionMessage[]) => void;
  updateTokenUsage: (usage: Partial<TokenUsage>) => void;
  clearMessages: () => void;
  resetSession: () => void;
}

export interface SessionSlice extends SessionState {
  actions: SessionActions;
}

// ========== 配置状态 ==========

export interface ConfigState {
  config: RuntimeConfig | null;
}

export interface ConfigActions {
  setConfig: (config: RuntimeConfig) => void;
  updateConfig: (partial: Partial<RuntimeConfig>) => void;
}

export interface ConfigSlice extends ConfigState {
  actions: ConfigActions;
}

// ========== 应用状态 ==========

export type InitializationStatus = 'pending' | 'loading' | 'ready' | 'error' | 'needsSetup';
export type ActiveModal = 'none' | 'shortcuts' | 'settings' | 'confirmation' | 'update' | 'themeSelector';

export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
}

export interface AppState {
  initializationStatus: InitializationStatus;
  initializationError: string | null;
  activeModal: ActiveModal;
  todos: TodoItem[];
  awaitingSecondCtrlC: boolean;
}

export interface AppActions {
  setInitializationStatus: (status: InitializationStatus) => void;
  setInitializationError: (error: string | null) => void;
  setActiveModal: (modal: ActiveModal) => void;
  setTodos: (todos: TodoItem[]) => void;
  addTodo: (todo: TodoItem) => void;
  updateTodo: (id: string, updates: Partial<TodoItem>) => void;
  removeTodo: (id: string) => void;
  setAwaitingSecondCtrlC: (awaiting: boolean) => void;
}

export interface AppSlice extends AppState {
  actions: AppActions;
}

// ========== 焦点状态 ==========

export type FocusId = 'input' | 'messages' | 'confirmation' | 'modal' | 'none' | 'theme-selector' | 'selector';

/** FocusId 常量枚举 */
export const FocusId = {
  MAIN_INPUT: 'input' as FocusId,
  MESSAGES: 'messages' as FocusId,
  CONFIRMATION_PROMPT: 'confirmation' as FocusId,
  THEME_SELECTOR: 'theme-selector' as FocusId,
  SELECTOR: 'selector' as FocusId,
  MODAL: 'modal' as FocusId,
  NONE: 'none' as FocusId,
} as const;

export interface FocusState {
  currentFocus: FocusId;
  previousFocus: FocusId | null;
}

export interface FocusActions {
  setFocus: (focus: FocusId) => void;
  restoreFocus: () => void;
  pushFocus: (focus: FocusId) => void;
}

export interface FocusSlice extends FocusState {
  actions: FocusActions;
}

// ========== 命令状态 ==========

export interface CommandState {
  isProcessing: boolean;
  abortController: AbortController | null;
  pendingCommands: string[];
}

export interface CommandActions {
  setProcessing: (isProcessing: boolean) => void;
  createAbortController: () => AbortController;
  abort: () => void;
  enqueueCommand: (command: string) => void;
  dequeueCommand: () => string | undefined;
  clearQueue: () => void;
}

export interface CommandSlice extends CommandState {
  actions: CommandActions;
}

// ========== 完整 Store ==========

export interface ClawdStore {
  session: SessionSlice;
  config: ConfigSlice;
  app: AppSlice;
  focus: FocusSlice;
  command: CommandSlice;
}
