/**
 * Command Slice - 命令状态管理
 */

import type { StateCreator } from 'zustand';
import type { ClawdStore, CommandSlice } from '../types.js';

const initialCommandState = {
  isProcessing: false,
  abortController: null as AbortController | null,
  pendingCommands: [] as string[],
};

export const createCommandSlice: StateCreator<
  ClawdStore,
  [],
  [],
  CommandSlice
> = (set, get) => ({
  ...initialCommandState,

  actions: {
    /**
     * 设置处理状态
     */
    setProcessing: (isProcessing: boolean) => {
      set((state) => ({
        command: { ...state.command, isProcessing },
      }));
    },

    /**
     * 创建 AbortController
     */
    createAbortController: () => {
      const controller = new AbortController();
      set((state) => ({
        command: { ...state.command, abortController: controller },
      }));
      return controller;
    },

    /**
     * 中止当前任务
     * - 发送 abort signal
     * - 重置 isProcessing
     * - 重置 isThinking (跨 slice)
     * - 清空待处理队列
     */
    abort: () => {
      const { abortController } = get().command;

      if (abortController && !abortController.signal.aborted) {
        abortController.abort();
      }

      // 重置 session 的 isThinking 状态
      get().session.actions.setThinking(false);

      // 重置 command 状态并清空队列
      set((state) => ({
        command: {
          ...state.command,
          isProcessing: false,
          abortController: null,
          pendingCommands: [],
        },
      }));
    },

    /**
     * 将命令加入待处理队列
     */
    enqueueCommand: (command: string) => {
      set((state) => ({
        command: {
          ...state.command,
          pendingCommands: [...state.command.pendingCommands, command],
        },
      }));
    },

    /**
     * 从队列取出下一个命令
     */
    dequeueCommand: () => {
      const { pendingCommands } = get().command;
      if (pendingCommands.length === 0) {
        return undefined;
      }

      const [nextCommand, ...rest] = pendingCommands;
      set((state) => ({
        command: {
          ...state.command,
          pendingCommands: rest,
        },
      }));

      return nextCommand;
    },

    /**
     * 清空待处理队列
     */
    clearQueue: () => {
      set((state) => ({
        command: {
          ...state.command,
          pendingCommands: [],
        },
      }));
    },
  },
});
