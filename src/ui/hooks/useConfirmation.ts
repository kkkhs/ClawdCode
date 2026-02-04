/**
 * useConfirmation - 确认对话框状态管理
 */

import { useState, useCallback, useMemo } from 'react';
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
   */
  const showConfirmation = useCallback(
    (details: ConfirmationDetails): Promise<ConfirmationResponse> => {
      return new Promise((resolve) => {
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
   */
  const handleResponse = useCallback((response: ConfirmationResponse) => {
    if (confirmationState.resolver) {
      confirmationState.resolver(response);
    }
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
