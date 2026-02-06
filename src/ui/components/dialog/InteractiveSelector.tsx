/**
 * InteractiveSelector - 交互式选择器组件
 * 
 * 用于 /model 和 /theme 等命令的上下选择
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { themeManager } from '../../themes/index.js';
import { FocusId } from '../../../store/index.js';
import { focusManager } from '../../focus/index.js';

export interface SelectorOption<T = string> {
  /** 选项值 */
  value: T;
  /** 显示标签 */
  label: string;
  /** 描述信息 */
  description?: string;
  /** 是否为当前选中项 */
  isCurrent?: boolean;
}

interface InteractiveSelectorProps<T = string> {
  /** 标题 */
  title: string;
  /** 选项列表 */
  options: SelectorOption<T>[];
  /** 选择回调 */
  onSelect: (value: T) => void;
  /** 取消回调 */
  onCancel: () => void;
  /** 初始选中索引 */
  initialIndex?: number;
  /** 焦点 ID */
  focusId?: string;
}

/**
 * 交互式选择器
 */
export function InteractiveSelector<T = string>({
  title,
  options,
  onSelect,
  onCancel,
  initialIndex = 0,
  focusId = FocusId.SELECTOR,
}: InteractiveSelectorProps<T>): React.ReactElement {
  const theme = themeManager.getTheme();
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);

  // 处理键盘输入
  useInput(
    (input, key) => {
      // Imperative focus check — avoids stale React closure
      if (focusManager.getCurrentFocus() !== focusId) return;

      if (key.upArrow || input === 'k') {
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : options.length - 1));
      } else if (key.downArrow || input === 'j') {
        setSelectedIndex(prev => (prev < options.length - 1 ? prev + 1 : 0));
      } else if (key.return) {
        onSelect(options[selectedIndex].value);
      } else if (key.escape || input === 'q') {
        onCancel();
      }
    },
  );

  // 当 options 变化时重置索引
  useEffect(() => {
    if (selectedIndex >= options.length) {
      setSelectedIndex(0);
    }
  }, [options.length, selectedIndex]);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.colors.primary}
      paddingX={2}
      paddingY={1}
    >
      {/* 标题 */}
      <Box marginBottom={1}>
        <Text bold color={theme.colors.primary}>
          {title}
        </Text>
      </Box>

      {/* 选项列表 */}
      <Box flexDirection="column">
        {options.map((option, index) => {
          const isSelected = index === selectedIndex;
          const indicator = isSelected ? '▸ ' : '  ';
          const currentMarker = option.isCurrent ? ' ✓' : '';
          
          return (
            <Box key={String(option.value)} flexDirection="row">
              <Text
                color={isSelected ? theme.colors.primary : theme.colors.text.primary}
                bold={isSelected}
              >
                {indicator}
                {option.label}
                {currentMarker}
              </Text>
              {option.description && (
                <Text color={theme.colors.text.muted} dimColor>
                  {' - '}
                  {option.description}
                </Text>
              )}
            </Box>
          );
        })}
      </Box>

      {/* 操作提示 */}
      <Box marginTop={1} borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false} borderColor={theme.colors.border.light}>
        <Text color={theme.colors.text.muted} dimColor>
          ↑/↓ 选择  Enter 确认  Esc 取消
        </Text>
      </Box>
    </Box>
  );
}

export default InteractiveSelector;
