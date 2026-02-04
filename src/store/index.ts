/**
 * Zustand Store 模块导出
 * 
 * 提供统一的状态管理接口
 */

// 类型
export * from './types.js';

// Vanilla Store（非 React 环境）
export {
  vanillaStore,
  getState,
  subscribe,
  sessionActions,
  configActions,
  appActions,
  focusActions,
  commandActions,
  getConfig,
  getCurrentModel,
  getPermissionMode,
  ensureStoreInitialized,
  subscribeToState,
  subscribeToTodos,
  subscribeToMessages,
} from './vanilla.js';

// React 选择器和 Hooks
export {
  useClawdStore,
  // Session
  useSessionId,
  useMessages,
  useIsThinking,
  useIsCompacting,
  useSessionError,
  useCurrentCommand,
  useTokenUsage,
  // Config
  useConfig,
  useTheme,
  usePermissionMode,
  useAllModels,
  useCurrentModel,
  // App
  useInitializationStatus,
  useInitializationError,
  useActiveModal,
  useTodos,
  useAwaitingSecondCtrlC,
  // Focus
  useCurrentFocus,
  usePreviousFocus,
  // Command
  useIsProcessing,
  usePendingCommands,
  // 派生选择器
  useContextRemaining,
  useIsInputDisabled,
  useIsBusy,
  useTodoStats,
  // 组合选择器
  useSessionState,
  useAppState,
} from './selectors.js';
