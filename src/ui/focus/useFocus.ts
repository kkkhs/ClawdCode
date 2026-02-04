/**
 * 焦点管理 React Hooks
 */

import { useState, useEffect, useCallback } from 'react';
import { focusManager, focusActions } from './FocusManager.js';
import { FocusId, type FocusState, type FocusActions } from './types.js';

/**
 * 获取当前焦点
 */
export const useCurrentFocus = (): FocusId => {
  const [currentFocus, setCurrentFocus] = useState<FocusId>(
    focusManager.getCurrentFocus()
  );

  useEffect(() => {
    const unsubscribe = focusManager.subscribe((state) => {
      setCurrentFocus(state.currentFocus);
    });
    return unsubscribe;
  }, []);

  return currentFocus;
};

/**
 * 获取完整焦点状态
 */
export const useFocusState = (): FocusState => {
  const [state, setState] = useState<FocusState>(focusManager.getState());

  useEffect(() => {
    const unsubscribe = focusManager.subscribe((newState) => {
      setState(newState);
    });
    return unsubscribe;
  }, []);

  return state;
};

/**
 * 获取焦点操作
 */
export const useFocusActions = (): FocusActions => {
  return focusActions;
};

/**
 * 检查组件是否获得焦点
 */
export const useIsFocused = (focusId: FocusId): boolean => {
  const currentFocus = useCurrentFocus();
  return currentFocus === focusId;
};

/**
 * 组合 Hook：获取焦点状态和操作
 */
export const useFocus = () => {
  const state = useFocusState();
  const actions = useFocusActions();
  
  const isFocused = useCallback(
    (id: FocusId) => state.currentFocus === id,
    [state.currentFocus]
  );

  return {
    ...state,
    ...actions,
    isFocused,
  };
};
