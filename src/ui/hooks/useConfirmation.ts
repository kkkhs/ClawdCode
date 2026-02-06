/**
 * useConfirmation - 确认对话框状态管理
 * 
 * 焦点切换在 show/hide 时同步执行（而非 useEffect），
 * 以避免 Ink useInput 在 render 与 effect 之间的竞态窗口。
 */

import { useState, useCallback, useMemo } from 'react';
import { focusActions, FocusId } from '../focus/index.js';
import type { ConfirmationHandler, ConfirmationDetails, ConfirmationResponse } from '../../tools/execution/types.js';

/**
 * 确认状态
 */
interface ConfirmationState {
  isVisible: boolean;
  details: ConfirmationDetails | null;
  resolver: ((response: ConfirmationResponse) => void) | null;
}

interface UseConfirmationResult {
  /** 确认状态 */
  confirmationState: ConfirmationState;
  /** 确认处理器（供 Agent/Pipeline 使用） */
  confirmationHandler: ConfirmationHandler;
  /** 处理用户响应 */
  handleResponse: (response: ConfirmationResponse) => void;
  /** 显示确认对话框 */
  showConfirmation: (details: ConfirmationDetails) => Promise<ConfirmationResponse>;
}

/**
 * 确认对话框 Hook
 * 
 * 提供异步确认机制，返回 Promise
 */
export const useConfirmation = (): UseConfirmationResult => {
  const [confirmationState, setConfirmationState] = useState<ConfirmationState>({
    isVisible: false,
    details: null,
    resolver: null,
  });

  /**
   * 显示确认对话框
   * 同步切换焦点，确保在下一次 useInput 触发前生效
   */
  const showConfirmation = useCallback(
    (details: ConfirmationDetails): Promise<ConfirmationResponse> => {
      return new Promise((resolve) => {
        // 同步设置焦点 — 在 React 调度 render 之前就生效
        focusActions.setFocus(FocusId.CONFIRMATION_PROMPT);
        setConfirmationState({
          isVisible: true,
          details,
          resolver: resolve,
        });
      });
    },
    []
  );

  /**
   * 处理用户响应
   * 同步恢复焦点到主输入框
   */
  const handleResponse = useCallback((response: ConfirmationResponse) => {
    if (confirmationState.resolver) {
      confirmationState.resolver(response);
    }
    // 同步恢复焦点
    focusActions.setFocus(FocusId.MAIN_INPUT);
    setConfirmationState({
      isVisible: false,
      details: null,
      resolver: null,
    });
  }, [confirmationState.resolver]);

  /**
   * 创建 ConfirmationHandler（供 Agent/Pipeline 使用）
   */
  const confirmationHandler: ConfirmationHandler = useMemo(
    () => ({
      requestConfirmation: showConfirmation,
    }),
    [showConfirmation]
  );

  return {
    confirmationState,
    confirmationHandler,
    handleResponse,
    showConfirmation,
  };
};
