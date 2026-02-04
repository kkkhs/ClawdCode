/**
 * useCommandHistory - 命令历史管理
 */

import { useState, useCallback } from 'react';

interface CommandHistoryResult {
  /** 添加命令到历史 */
  addToHistory: (command: string) => void;
  /** 获取上一条命令 */
  getPreviousCommand: () => string | null;
  /** 获取下一条命令 */
  getNextCommand: () => string | null;
  /** 重置历史索引 */
  resetIndex: () => void;
  /** 历史记录 */
  history: string[];
  /** 当前索引 */
  historyIndex: number;
}

/**
 * 命令历史 Hook
 * 支持上下箭头浏览历史命令
 */
export const useCommandHistory = (maxHistory = 100): CommandHistoryResult => {
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const addToHistory = useCallback((command: string) => {
    if (command.trim()) {
      setHistory(prev => {
        // 避免重复添加相同命令
        if (prev[prev.length - 1] === command) {
          return prev;
        }
        // 限制历史记录数量
        const newHistory = [...prev, command];
        if (newHistory.length > maxHistory) {
          newHistory.shift();
        }
        return newHistory;
      });
    }
    setHistoryIndex(-1);
  }, [maxHistory]);

  const getPreviousCommand = useCallback(() => {
    if (history.length === 0) {
      return null;
    }

    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      return history[history.length - 1 - newIndex];
    }
    
    // 已经到达最早的命令
    return history[0];
  }, [history, historyIndex]);

  const getNextCommand = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      return history[history.length - 1 - newIndex];
    }
    
    // 返回到最新（清空输入）
    setHistoryIndex(-1);
    return '';
  }, [history, historyIndex]);

  const resetIndex = useCallback(() => {
    setHistoryIndex(-1);
  }, []);

  return {
    addToHistory,
    getPreviousCommand,
    getNextCommand,
    resetIndex,
    history,
    historyIndex,
  };
};
