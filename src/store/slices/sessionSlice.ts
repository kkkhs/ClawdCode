/**
 * Session Slice - 会话状态管理
 */

import type { StateCreator } from 'zustand';
import type { ClawdStore, SessionSlice, SessionMessage, TokenUsage } from '../types.js';

const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const initialSessionState = {
  sessionId: generateId(),
  messages: [] as SessionMessage[],
  isThinking: false,
  isCompacting: false,
  currentCommand: null as string | null,
  error: null as string | null,
  isActive: true,
  tokenUsage: {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    maxContextTokens: 200000,
  } as TokenUsage,
};

export const createSessionSlice: StateCreator<
  ClawdStore,
  [],
  [],
  SessionSlice
> = (set, get) => ({
  ...initialSessionState,

  actions: {
    /**
     * 添加消息
     */
    addMessage: (message: SessionMessage) => {
      set((state) => ({
        session: {
          ...state.session,
          messages: [...state.session.messages, message],
          error: null,
        },
      }));
    },

    /**
     * 添加用户消息
     */
    addUserMessage: (content: string) => {
      const message: SessionMessage = {
        id: `user-${generateId()}`,
        role: 'user',
        content,
        timestamp: Date.now(),
      };
      get().session.actions.addMessage(message);
    },

    /**
     * 添加助手消息
     */
    addAssistantMessage: (content: string) => {
      const message: SessionMessage = {
        id: `assistant-${generateId()}`,
        role: 'assistant',
        content,
        timestamp: Date.now(),
      };
      get().session.actions.addMessage(message);
    },

    /**
     * 设置思考状态
     */
    setThinking: (isThinking: boolean) => {
      set((state) => ({
        session: { ...state.session, isThinking },
      }));
    },

    /**
     * 设置压缩状态
     */
    setCompacting: (isCompacting: boolean) => {
      set((state) => ({
        session: { ...state.session, isCompacting },
      }));
    },

    /**
     * 设置当前命令
     */
    setCurrentCommand: (command: string | null) => {
      set((state) => ({
        session: { ...state.session, currentCommand: command },
      }));
    },

    /**
     * 设置错误
     */
    setError: (error: string | null) => {
      set((state) => ({
        session: { ...state.session, error },
      }));
    },

    /**
     * 设置会话 ID
     */
    setSessionId: (sessionId: string) => {
      set((state) => ({
        session: {
          ...state.session,
          sessionId,
        },
      }));
    },

    /**
     * 恢复会话
     */
    restoreSession: (sessionId: string, messages: SessionMessage[]) => {
      set((state) => ({
        session: {
          ...state.session,
          sessionId,
          messages,
          error: null,
          isActive: true,
        },
      }));
    },

    /**
     * 更新 Token 使用量
     */
    updateTokenUsage: (usage: Partial<TokenUsage>) => {
      set((state) => ({
        session: {
          ...state.session,
          tokenUsage: { ...state.session.tokenUsage, ...usage },
        },
      }));
    },

    /**
     * 清空消息
     */
    clearMessages: () => {
      set((state) => ({
        session: {
          ...state.session,
          messages: [],
          error: null,
        },
      }));
    },

    /**
     * 重置会话
     */
    resetSession: () => {
      set((state) => ({
        session: {
          ...state.session,
          ...initialSessionState,
          sessionId: generateId(),
        },
      }));
    },
  },
});
