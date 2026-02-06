/**
 * CustomTextInput - 自定义文本输入组件
 * 
 * 解决 ink-text-input 无法控制光标位置的问题
 */

import React, { useMemo, useCallback } from 'react';
import { Text, useInput } from 'ink';
import chalk from 'chalk';
import { useIsFocused, FocusId, focusManager } from '../../focus/index.js';

interface CustomTextInputProps {
  /** 输入值 */
  value: string;
  /** 光标位置 */
  cursorPosition: number;
  /** 值变化回调 */
  onChange: (value: string) => void;
  /** 光标位置变化回调 */
  onChangeCursorPosition: (pos: number) => void;
  /** 提交回调 */
  onSubmit?: (value: string) => void;
  /** 粘贴回调 */
  onPaste?: (text: string) => { prompt?: string } | void;
  /** 上箭头回调（浏览历史） */
  onArrowUp?: () => void;
  /** 下箭头回调（浏览历史） */
  onArrowDown?: () => void;
  /** 占位符 */
  placeholder?: string;
  /** 焦点 ID */
  focusId?: FocusId;
  /** 是否禁用 */
  disabled?: boolean;
}

/**
 * 粘贴检测配置
 */
const PASTE_CONFIG = {
  TIMEOUT_MS: 100,
  RAPID_INPUT_THRESHOLD_MS: 150,
  LARGE_INPUT_THRESHOLD: 300,
};

/**
 * 自定义文本输入组件
 */
export const CustomTextInput: React.FC<CustomTextInputProps> = ({
  value,
  cursorPosition,
  onChange,
  onChangeCursorPosition,
  onSubmit,
  onPaste,
  onArrowUp,
  onArrowDown,
  placeholder = '',
  focusId = FocusId.MAIN_INPUT,
  disabled = false,
}) => {
  const isFocused = useIsFocused(focusId);
  const isActive = isFocused && !disabled;

  // 渲染带光标的文本
  const renderedValue = useMemo(() => {
    if (!isActive) {
      return value || placeholder;
    }

    if (value.length === 0) {
      // 空输入，显示光标和占位符
      return chalk.inverse(' ') + chalk.dim(placeholder);
    }

    const before = value.slice(0, cursorPosition);
    const cursorChar = value[cursorPosition] || ' ';
    const after = value.slice(cursorPosition + 1);

    return `${before}${chalk.inverse(cursorChar)}${after}`;
  }, [value, cursorPosition, isActive, placeholder]);

  // 粘贴检测状态
  const pasteStateRef = React.useRef({
    chunks: [] as string[],
    timeoutId: null as NodeJS.Timeout | null,
    firstInputTime: null as number | null,
  });

  // 处理粘贴
  const handlePaste = useCallback(
    (text: string) => {
      if (onPaste) {
        const result = onPaste(text);
        if (result?.prompt) {
          // 显示粘贴提示
          onChange(value + result.prompt);
          onChangeCursorPosition(value.length + result.prompt.length);
          return;
        }
      }

      // 默认行为：插入粘贴的文本
      const newValue = value.slice(0, cursorPosition) + text + value.slice(cursorPosition);
      onChange(newValue);
      onChangeCursorPosition(cursorPosition + text.length);
    },
    [value, cursorPosition, onChange, onChangeCursorPosition, onPaste]
  );

  // 键盘输入处理
  useInput(
    (input, key) => {
      // Imperative focus check — avoids stale React closure
      if (focusManager.getCurrentFocus() !== focusId || disabled) return;
      if (!isActive) return;

      const now = Date.now();
      const pasteState = pasteStateRef.current;
      const timeSinceFirst = pasteState.firstInputTime
        ? now - pasteState.firstInputTime
        : 0;

      // 检查是否是粘贴操作
      const isPaste =
        input.length > PASTE_CONFIG.LARGE_INPUT_THRESHOLD ||
        input.includes('\n') ||
        (timeSinceFirst < PASTE_CONFIG.RAPID_INPUT_THRESHOLD_MS &&
          pasteState.chunks.length > 0);

      if (isPaste && input.length > 1) {
        // 收集粘贴分片
        pasteState.chunks.push(input);
        if (!pasteState.firstInputTime) {
          pasteState.firstInputTime = now;
        }

        // 重置超时
        if (pasteState.timeoutId) {
          clearTimeout(pasteState.timeoutId);
        }

        pasteState.timeoutId = setTimeout(() => {
          const mergedText = pasteState.chunks.join('');
          handlePaste(mergedText);
          // 重置状态
          pasteState.chunks = [];
          pasteState.timeoutId = null;
          pasteState.firstInputTime = null;
        }, PASTE_CONFIG.TIMEOUT_MS);

        return;
      }

      // 普通键盘输入
      if (key.return) {
        onSubmit?.(value);
        return;
      }

      if (key.leftArrow) {
        if (cursorPosition > 0) {
          onChangeCursorPosition(cursorPosition - 1);
        }
        return;
      }

      if (key.rightArrow) {
        if (cursorPosition < value.length) {
          onChangeCursorPosition(cursorPosition + 1);
        }
        return;
      }

      // 上箭头：浏览历史（上一条命令）
      if (key.upArrow) {
        onArrowUp?.();
        return;
      }

      // 下箭头：浏览历史（下一条命令）
      if (key.downArrow) {
        onArrowDown?.();
        return;
      }

      if (key.backspace || key.delete) {
        if (cursorPosition > 0) {
          const newValue = value.slice(0, cursorPosition - 1) + value.slice(cursorPosition);
          onChange(newValue);
          onChangeCursorPosition(cursorPosition - 1);
        }
        return;
      }

      // Ctrl+A: 移动到行首
      if (key.ctrl && input === 'a') {
        onChangeCursorPosition(0);
        return;
      }

      // Ctrl+E: 移动到行尾
      if (key.ctrl && input === 'e') {
        onChangeCursorPosition(value.length);
        return;
      }

      // Ctrl+K: 删除光标后的内容
      if (key.ctrl && input === 'k') {
        onChange(value.slice(0, cursorPosition));
        return;
      }

      // Ctrl+U: 删除光标前的内容
      if (key.ctrl && input === 'u') {
        onChange(value.slice(cursorPosition));
        onChangeCursorPosition(0);
        return;
      }

      // 普通字符输入
      if (input && !key.ctrl && !key.meta) {
        const newValue = value.slice(0, cursorPosition) + input + value.slice(cursorPosition);
        onChange(newValue);
        onChangeCursorPosition(cursorPosition + input.length);
      }
    },
    { isActive }
  );

  return (
    <Text>
      {!isActive && value.length === 0 ? (
        <Text dimColor>{placeholder}</Text>
      ) : (
        renderedValue
      )}
    </Text>
  );
};

export default CustomTextInput;
