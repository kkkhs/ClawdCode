/**
 * InputArea - 输入区域组件
 * 
 * 包含输入框、命令补全建议和处理逻辑
 */

import React, { useCallback, useState, useMemo, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { CustomTextInput } from './CustomTextInput.js';
import { CommandSuggestions } from './CommandSuggestions.js';
import { themeManager } from '../../themes/index.js';
import { FocusId } from '../../focus/index.js';
import { getCommandCompletions } from '../../../slash-commands/index.js';
import type { CommandSuggestion } from '../../../slash-commands/types.js';

interface InputAreaProps {
  /** 输入值 */
  input: string;
  /** 光标位置 */
  cursorPosition: number;
  /** 值变化回调 */
  onChange: (value: string) => void;
  /** 光标位置变化回调 */
  onChangeCursorPosition: (pos: number) => void;
  /** 提交回调 */
  onSubmit?: (value: string) => void;
  /** 上箭头回调（浏览历史） */
  onArrowUp?: () => void;
  /** 下箭头回调（浏览历史） */
  onArrowDown?: () => void;
  /** 是否正在处理 */
  isProcessing?: boolean;
  /** 占位符 */
  placeholder?: string;
}

/**
 * 输入区域组件
 */
export const InputArea: React.FC<InputAreaProps> = React.memo(
  ({
    input,
    cursorPosition,
    onChange,
    onChangeCursorPosition,
    onSubmit,
    onArrowUp,
    onArrowDown,
    isProcessing = false,
    placeholder = 'Type a message... (Ctrl+C to exit)',
  }) => {
    const theme = themeManager.getTheme();
    
    // 补全状态
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    
    // 计算命令建议
    const suggestions = useMemo<CommandSuggestion[]>(() => {
      // 只有输入 / 开头才显示建议
      if (!input.startsWith('/')) {
        return [];
      }
      
      // 如果输入中有空格，说明已经是完整命令+参数了
      if (input.includes(' ')) {
        return [];
      }
      
      return getCommandCompletions(input);
    }, [input]);
    
    // 当建议变化时，重置选中索引
    useEffect(() => {
      setSelectedIndex(0);
      setShowSuggestions(suggestions.length > 0);
    }, [suggestions]);
    
    // 处理 Tab 补全
    const handleTabComplete = useCallback(() => {
      if (suggestions.length > 0 && showSuggestions) {
        const selected = suggestions[selectedIndex];
        if (selected) {
          // 补全命令（保留可能的空格给参数）
          onChange(selected.command + ' ');
          onChangeCursorPosition(selected.command.length + 1);
          setShowSuggestions(false);
        }
      }
    }, [suggestions, selectedIndex, showSuggestions, onChange, onChangeCursorPosition]);
    
    // 处理选择上一个建议
    const handleSelectPrev = useCallback(() => {
      if (showSuggestions && suggestions.length > 0) {
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
        return true;
      }
      return false;
    }, [showSuggestions, suggestions.length]);
    
    // 处理选择下一个建议
    const handleSelectNext = useCallback(() => {
      if (showSuggestions && suggestions.length > 0) {
        setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
        return true;
      }
      return false;
    }, [showSuggestions, suggestions.length]);
    
    // 处理关闭建议
    const handleCloseSuggestions = useCallback(() => {
      setShowSuggestions(false);
    }, []);

    // 大段文本粘贴处理
    const handlePaste = useCallback((text: string) => {
      const lineCount = text.split('\n').length;
      const charCount = text.length;

      if (charCount > 500 || lineCount > 10) {
        const preview = text.slice(0, 30).replace(/\n/g, ' ');
        return { prompt: `[Pasted: ${charCount} chars, ${lineCount} lines] ${preview}...` };
      }
      return {};
    }, []);

    // 提交处理
    const handleSubmit = useCallback(
      (value: string) => {
        // 如果有建议显示且按回车，先补全
        if (showSuggestions && suggestions.length > 0) {
          handleTabComplete();
          return;
        }
        
        if (value.trim() && onSubmit) {
          onSubmit(value);
          setShowSuggestions(false);
        }
      },
      [onSubmit, showSuggestions, suggestions.length, handleTabComplete]
    );
    
    // 处理上下箭头
    const handleArrowUpInternal = useCallback(() => {
      // 如果有建议显示，用于选择建议
      if (handleSelectPrev()) {
        return;
      }
      // 否则用于浏览历史
      onArrowUp?.();
    }, [handleSelectPrev, onArrowUp]);
    
    const handleArrowDownInternal = useCallback(() => {
      // 如果有建议显示，用于选择建议
      if (handleSelectNext()) {
        return;
      }
      // 否则用于浏览历史
      onArrowDown?.();
    }, [handleSelectNext, onArrowDown]);
    
    // 处理 Tab 和 Escape 键
    useInput((char, key) => {
      if (key.tab) {
        handleTabComplete();
      } else if (key.escape) {
        handleCloseSuggestions();
      }
    });

    return (
      <Box flexDirection="column">
        {/* 命令补全建议 */}
        <CommandSuggestions
          suggestions={suggestions}
          selectedIndex={selectedIndex}
          visible={showSuggestions}
        />
        
        {/* 输入框 */}
        <Box
          flexDirection="row"
          paddingX={1}
          paddingY={0}
          borderStyle="round"
          borderColor={isProcessing ? theme.colors.warning : theme.colors.border.light}
        >
          {/* 提示符 */}
          <Box marginRight={1}>
            <Text color={theme.colors.success} bold>
              {isProcessing ? '⏳' : '>'}
            </Text>
          </Box>

          {/* 输入框 - 始终启用，支持命令队列 */}
          <Box flexGrow={1}>
            <CustomTextInput
              value={input}
              cursorPosition={cursorPosition}
              onChange={onChange}
              onChangeCursorPosition={onChangeCursorPosition}
              onSubmit={handleSubmit}
              onPaste={handlePaste}
              onArrowUp={handleArrowUpInternal}
              onArrowDown={handleArrowDownInternal}
              placeholder={placeholder}
              focusId={FocusId.MAIN_INPUT}
              disabled={false}
            />
          </Box>
        </Box>
      </Box>
    );
  }
);

InputArea.displayName = 'InputArea';

export default InputArea;
