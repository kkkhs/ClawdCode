/**
 * CommandSuggestions - 命令补全建议列表
 */

import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import type { CommandSuggestion } from '../../../slash-commands/types.js';
import { themeManager } from '../../themes/index.js';

interface CommandSuggestionsProps {
  /** 建议列表 */
  suggestions: CommandSuggestion[];
  /** 当前选中索引 */
  selectedIndex: number;
  /** 是否显示 */
  visible: boolean;
}

const MAX_VISIBLE = 10;

/**
 * 命令补全建议组件
 */
export const CommandSuggestions: React.FC<CommandSuggestionsProps> = ({
  suggestions,
  selectedIndex,
  visible,
}) => {
  const theme = themeManager.getTheme();

  // 计算可见窗口，确保选中项始终可见
  const { displaySuggestions, startIndex } = useMemo(() => {
    if (suggestions.length <= MAX_VISIBLE) {
      return { displaySuggestions: suggestions, startIndex: 0 };
    }

    // 计算窗口起始位置，让选中项尽量居中
    let start = Math.max(0, selectedIndex - Math.floor(MAX_VISIBLE / 2));
    
    // 确保不超出末尾
    if (start + MAX_VISIBLE > suggestions.length) {
      start = suggestions.length - MAX_VISIBLE;
    }

    return {
      displaySuggestions: suggestions.slice(start, start + MAX_VISIBLE),
      startIndex: start,
    };
  }, [suggestions, selectedIndex]);

  if (!visible || suggestions.length === 0) {
    return null;
  }

  const hasMoreAbove = startIndex > 0;
  const hasMoreBelow = startIndex + MAX_VISIBLE < suggestions.length;

  return (
    <Box
      flexDirection="column"
      paddingX={1}
      marginBottom={0}
    >
      {/* 上方省略提示 */}
      {hasMoreAbove && (
        <Text color={theme.colors.text.muted} dimColor>
          ... {startIndex} more above
        </Text>
      )}
      
      {displaySuggestions.map((suggestion, displayIndex) => {
        const actualIndex = startIndex + displayIndex;
        const isSelected = actualIndex === selectedIndex;
        
        return (
          <Box key={suggestion.command} flexDirection="row">
            {/* 选中指示器 */}
            <Text color={isSelected ? theme.colors.primary : theme.colors.text.muted}>
              {isSelected ? '> ' : '  '}
            </Text>
            
            {/* 命令名 */}
            <Text
              color={isSelected ? theme.colors.primary : theme.colors.success}
              bold={isSelected}
            >
              {suggestion.command}
            </Text>
            
            {/* 描述 */}
            <Text color={theme.colors.text.muted} dimColor={!isSelected}>
              {' '}
              {suggestion.description}
            </Text>
          </Box>
        );
      })}
      
      {/* 下方省略提示 */}
      {hasMoreBelow && (
        <Text color={theme.colors.text.muted} dimColor>
          ... {suggestions.length - startIndex - MAX_VISIBLE} more below
        </Text>
      )}

      {/* 简洁的操作提示 */}
      <Text color={theme.colors.text.muted} dimColor>
        ─ tab · ↑↓ · esc
      </Text>
    </Box>
  );
};

CommandSuggestions.displayName = 'CommandSuggestions';

export default CommandSuggestions;
