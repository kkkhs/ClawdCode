/**
 * 焦点管理器
 * 
 * 简单的焦点状态管理，使用发布订阅模式
 */

import { FocusId, type FocusState, type FocusActions } from './types.js';

type FocusListener = (state: FocusState) => void;

/**
 * 焦点管理器类
 */
class FocusManagerImpl {
  private state: FocusState = {
    currentFocus: FocusId.MAIN_INPUT,
    previousFocus: null,
    focusStack: [FocusId.MAIN_INPUT],
  };
  
  private listeners: Set<FocusListener> = new Set();

  /**
   * 获取当前状态
   */
  getState(): FocusState {
    return { ...this.state };
  }

  /**
   * 获取当前焦点
   */
  getCurrentFocus(): FocusId {
    return this.state.currentFocus;
  }

  /**
   * 设置焦点
   */
  setFocus(id: FocusId): void {
    if (this.state.currentFocus === id) {
      return;
    }

    this.state = {
      currentFocus: id,
      previousFocus: this.state.currentFocus,
      focusStack: [...this.state.focusStack, id],
    };
    
    this.notify();
  }

  /**
   * 推入焦点栈（保留历史）
   */
  pushFocus(id: FocusId): void {
    this.state = {
      currentFocus: id,
      previousFocus: this.state.currentFocus,
      focusStack: [...this.state.focusStack, id],
    };
    
    this.notify();
  }

  /**
   * 弹出焦点栈（返回上一个）
   */
  popFocus(): void {
    if (this.state.focusStack.length <= 1) {
      return;
    }

    const newStack = this.state.focusStack.slice(0, -1);
    const previousFocus = newStack[newStack.length - 1] || FocusId.MAIN_INPUT;
    
    this.state = {
      currentFocus: previousFocus,
      previousFocus: this.state.currentFocus,
      focusStack: newStack,
    };
    
    this.notify();
  }

  /**
   * 重置焦点到默认
   */
  resetFocus(): void {
    this.state = {
      currentFocus: FocusId.MAIN_INPUT,
      previousFocus: this.state.currentFocus,
      focusStack: [FocusId.MAIN_INPUT],
    };
    
    this.notify();
  }

  /**
   * 订阅状态变化
   */
  subscribe(listener: FocusListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * 通知所有订阅者
   */
  private notify(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }

  /**
   * 获取焦点操作对象
   */
  getActions(): FocusActions {
    return {
      setFocus: (id: FocusId) => this.setFocus(id),
      popFocus: () => this.popFocus(),
      resetFocus: () => this.resetFocus(),
      pushFocus: (id: FocusId) => this.pushFocus(id),
    };
  }
}

// 导出单例
export const focusManager = new FocusManagerImpl();

// 导出操作快捷方式
export const focusActions = focusManager.getActions();
