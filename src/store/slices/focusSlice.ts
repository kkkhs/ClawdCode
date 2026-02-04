/**
 * Focus Slice - 焦点状态管理
 */

import type { StateCreator } from 'zustand';
import type { ClawdStore, FocusSlice, FocusId } from '../types.js';

const initialFocusState = {
  currentFocus: 'input' as FocusId,
  previousFocus: null as FocusId | null,
};

export const createFocusSlice: StateCreator<
  ClawdStore,
  [],
  [],
  FocusSlice
> = (set, get) => ({
  ...initialFocusState,

  actions: {
    /**
     * 设置焦点
     */
    setFocus: (focus: FocusId) => {
      set((state) => ({
        focus: {
          ...state.focus,
          previousFocus: state.focus.currentFocus,
          currentFocus: focus,
        },
      }));
    },

    /**
     * 恢复到上一个焦点
     */
    restoreFocus: () => {
      const { previousFocus } = get().focus;
      if (previousFocus) {
        set((state) => ({
          focus: {
            ...state.focus,
            currentFocus: previousFocus,
            previousFocus: null,
          },
        }));
      }
    },

    /**
     * 推入焦点（保存当前焦点）
     */
    pushFocus: (focus: FocusId) => {
      set((state) => ({
        focus: {
          ...state.focus,
          previousFocus: state.focus.currentFocus,
          currentFocus: focus,
        },
      }));
    },
  },
});
