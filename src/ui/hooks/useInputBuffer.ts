/**
 * useInputBuffer - 输入缓冲区管理
 * 
 * 管理输入文本和光标位置
 */

import { useState, useCallback, useRef, useEffect } from 'react';

interface InputBufferResult {
  /** 当前输入值 */
  value: string;
  /** 光标位置 */
  cursorPosition: number;
  /** 设置输入值 */
  setValue: (newValue: string) => void;
  /** 设置光标位置 */
  setCursorPosition: (pos: number) => void;
  /** 在光标位置插入文本 */
  insertAt: (text: string) => void;
  /** 删除光标前的字符 */
  deleteBackward: () => void;
  /** 删除光标后的字符 */
  deleteForward: () => void;
  /** 清空输入 */
  clear: () => void;
  /** 移动光标到开头 */
  moveToStart: () => void;
  /** 移动光标到结尾 */
  moveToEnd: () => void;
  /** 获取当前引用（用于避免重渲染时的闭包问题） */
  getRef: () => { value: string; cursorPosition: number };
}

/**
 * 输入缓冲区 Hook
 */
export const useInputBuffer = (
  initialValue = '',
  initialCursor = 0
): InputBufferResult => {
  const [value, setValueState] = useState(initialValue);
  const [cursorPosition, setCursorPositionState] = useState(initialCursor);

  // 稳定的引用，避免 resize 时重建
  const bufferRef = useRef({ value, cursorPosition });

  useEffect(() => {
    bufferRef.current = { value, cursorPosition };
  }, [value, cursorPosition]);

  const setValue = useCallback((newValue: string) => {
    // 立即更新 ref，避免 setCursorPosition 使用旧的长度限制
    bufferRef.current.value = newValue;
    setValueState(newValue);
    // 确保光标不超出范围
    setCursorPositionState(prev => Math.min(prev, newValue.length));
  }, []);

  const setCursorPosition = useCallback((pos: number) => {
    const newPos = Math.max(0, Math.min(pos, bufferRef.current.value.length));
    // 立即更新 ref，保持同步
    bufferRef.current.cursorPosition = newPos;
    setCursorPositionState(newPos);
  }, []);

  const insertAt = useCallback((text: string) => {
    setValueState(prev => {
      const pos = bufferRef.current.cursorPosition;
      const newValue = prev.slice(0, pos) + text + prev.slice(pos);
      return newValue;
    });
    setCursorPositionState(prev => prev + text.length);
  }, []);

  const deleteBackward = useCallback(() => {
    if (bufferRef.current.cursorPosition > 0) {
      setValueState(prev => {
        const pos = bufferRef.current.cursorPosition;
        return prev.slice(0, pos - 1) + prev.slice(pos);
      });
      setCursorPositionState(prev => prev - 1);
    }
  }, []);

  const deleteForward = useCallback(() => {
    if (bufferRef.current.cursorPosition < bufferRef.current.value.length) {
      setValueState(prev => {
        const pos = bufferRef.current.cursorPosition;
        return prev.slice(0, pos) + prev.slice(pos + 1);
      });
    }
  }, []);

  const clear = useCallback(() => {
    setValueState('');
    setCursorPositionState(0);
  }, []);

  const moveToStart = useCallback(() => {
    setCursorPositionState(0);
  }, []);

  const moveToEnd = useCallback(() => {
    setCursorPositionState(bufferRef.current.value.length);
  }, []);

  const getRef = useCallback(() => bufferRef.current, []);

  return {
    value,
    cursorPosition,
    setValue,
    setCursorPosition,
    insertAt,
    deleteBackward,
    deleteForward,
    clear,
    moveToStart,
    moveToEnd,
    getRef,
  };
};
