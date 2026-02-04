/**
 * InputArea - 输入区域组件
 * 
 * 包含输入框、提示符和处理逻辑
 */

import React, { useCallback } from 'react';
import { Box, Text } from 'ink';
import { CustomTextInput } from './CustomTextInput.js';
import { themeManager } from '../../themes/index.js';
import { FocusId } from '../../focus/index.js';

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
    isProcessing = false,
    placeholder = 'Type a message... (Ctrl+C to exit)',
  }) => {
    const theme = themeManager.getTheme();

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
        if (value.trim() && onSubmit) {
          onSubmit(value);
        }
      },
      [onSubmit]
    );

    return (
      <Box
        flexDirection="row"
        paddingX={1}
        paddingY={1}
        borderStyle="round"
        borderColor={isProcessing ? theme.colors.warning : theme.colors.border.light}
      >
        {/* 提示符 */}
        <Box marginRight={1}>
          <Text color={theme.colors.success} bold>
            {isProcessing ? '⏳' : '>'}
          </Text>
        </Box>

        {/* 输入框 */}
        <Box flexGrow={1}>
          <CustomTextInput
            value={input}
            cursorPosition={cursorPosition}
            onChange={onChange}
            onChangeCursorPosition={onChangeCursorPosition}
            onSubmit={handleSubmit}
            onPaste={handlePaste}
            placeholder={placeholder}
            focusId={FocusId.MAIN_INPUT}
            disabled={isProcessing}
          />
        </Box>
      </Box>
    );
  }
);

InputArea.displayName = 'InputArea';

export default InputArea;
