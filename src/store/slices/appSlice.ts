/**
 * App Slice - 应用状态管理
 */

import type { StateCreator } from 'zustand';
import type { ClawdStore, AppSlice, InitializationStatus, ActiveModal, TodoItem } from '../types.js';

const initialAppState = {
  initializationStatus: 'pending' as InitializationStatus,
  initializationError: null as string | null,
  activeModal: 'none' as ActiveModal,
  todos: [] as TodoItem[],
  awaitingSecondCtrlC: false,
  showAllThinking: false,
};

export const createAppSlice: StateCreator<
  ClawdStore,
  [],
  [],
  AppSlice
> = (set, get) => ({
  ...initialAppState,

  actions: {
    /**
     * 设置初始化状态
     */
    setInitializationStatus: (status: InitializationStatus) => {
      set((state) => ({
        app: { ...state.app, initializationStatus: status },
      }));
    },

    /**
     * 设置初始化错误
     */
    setInitializationError: (error: string | null) => {
      set((state) => ({
        app: {
          ...state.app,
          initializationError: error,
          initializationStatus: error ? 'error' : state.app.initializationStatus,
        },
      }));
    },

    /**
     * 设置当前活动模态框
     */
    setActiveModal: (modal: ActiveModal) => {
      set((state) => ({
        app: { ...state.app, activeModal: modal },
      }));
    },

    /**
     * 设置 Todos
     */
    setTodos: (todos: TodoItem[]) => {
      set((state) => ({
        app: { ...state.app, todos },
      }));
    },

    /**
     * 添加 Todo
     */
    addTodo: (todo: TodoItem) => {
      set((state) => ({
        app: {
          ...state.app,
          todos: [...state.app.todos, todo],
        },
      }));
    },

    /**
     * 更新 Todo
     */
    updateTodo: (id: string, updates: Partial<TodoItem>) => {
      set((state) => ({
        app: {
          ...state.app,
          todos: state.app.todos.map((todo) =>
            todo.id === id ? { ...todo, ...updates } : todo
          ),
        },
      }));
    },

    /**
     * 删除 Todo
     */
    removeTodo: (id: string) => {
      set((state) => ({
        app: {
          ...state.app,
          todos: state.app.todos.filter((todo) => todo.id !== id),
        },
      }));
    },

    /**
     * 设置是否等待第二次 Ctrl+C
     */
    setAwaitingSecondCtrlC: (awaiting: boolean) => {
      set((state) => ({
        app: { ...state.app, awaitingSecondCtrlC: awaiting },
      }));
    },

    /**
     * 切换全局思考块展开/折叠
     */
    toggleShowAllThinking: () => {
      set((state) => ({
        app: { ...state.app, showAllThinking: !state.app.showAllThinking },
      }));
    },
  },
});
