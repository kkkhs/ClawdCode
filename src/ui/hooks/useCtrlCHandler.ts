/**
 * useCtrlCHandler - Ctrl+C 处理
 * 
 * 处理用户按下 Ctrl+C 的行为：
 * - 有任务运行时：请求中断
 * - 无任务时：退出应用
 */

import { useCallback, useRef } from 'react';
import { useApp, useInput } from 'ink';
import { getState } from '../../store/index.js';

interface CtrlCHandlerOptions {
  /** 中断回调 */
  onInterrupt?: () => void;
  /** 
   * 退出前回调
   * 返回 true 表示由回调自行处理退出（不执行默认 exit）
   */
  onBeforeExit?: () => boolean | void;
  /** 强制退出前的确认时间（毫秒） */
  forceExitDelay?: number;
}

interface CtrlCHandlerResult {
  /** 处理 Ctrl+C */
  handleCtrlC: () => void;
  /** 重置强制退出状态 */
  resetForceExit: () => void;
}

/**
 * Ctrl+C 处理 Hook
 * 
 * 自己通过 getState() 获取 isThinking 状态，避免订阅导致的重新渲染
 */
export const useCtrlCHandler = (options: CtrlCHandlerOptions): CtrlCHandlerResult => {
  const { onInterrupt, onBeforeExit, forceExitDelay = 2000 } = options;
  const { exit } = useApp();
  
  const lastCtrlCTime = useRef<number>(0);
  const forceExitPending = useRef(false);

  const doExit = useCallback(() => {
    // 执行退出前回调
    if (onBeforeExit) {
      const handled = onBeforeExit();
      // 返回 true 表示由回调处理退出
      if (handled === true) {
        return;
      }
    }
    exit();
    // 确保进程退出（exitOnCtrlC: false 时 Ink 的 exit() 可能不够）
    setTimeout(() => process.exit(0), 50);
  }, [onBeforeExit, exit]);

  const handleCtrlC = useCallback(() => {
    const now = Date.now();
    const timeSinceLastCtrlC = now - lastCtrlCTime.current;
    
    // 使用 getState() 获取最新状态，避免订阅
    const hasRunningTask = getState().session.isThinking;
    
    if (hasRunningTask) {
      if (forceExitPending.current && timeSinceLastCtrlC < forceExitDelay) {
        // 第二次 Ctrl+C：强制退出
        doExit();
        return;
      }
      
      // 第一次 Ctrl+C：请求中断
      forceExitPending.current = true;
      lastCtrlCTime.current = now;
      
      if (onInterrupt) {
        onInterrupt();
      }
    } else {
      // 没有任务，直接退出
      doExit();
    }
  }, [onInterrupt, forceExitDelay, doExit]);

  // 监听 Ctrl+C 输入
  useInput((input, key) => {
    if (input === 'c' && key.ctrl) {
      handleCtrlC();
    }
  });

  const resetForceExit = useCallback(() => {
    forceExitPending.current = false;
    lastCtrlCTime.current = 0;
  }, []);

  return {
    handleCtrlC,
    resetForceExit,
  };
};
