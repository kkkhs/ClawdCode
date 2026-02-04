/**
 * LoadingIndicator - 加载指示器组件
 */

import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { themeManager } from '../../themes/index.js';

interface LoadingIndicatorProps {
  /** 是否显示 */
  isVisible?: boolean;
  /** 加载文本 */
  text?: string;
  /** 显示详情 */
  details?: string;
}

/**
 * 加载指示器
 */
export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  isVisible = true,
  text = 'Thinking...',
  details,
}) => {
  const theme = themeManager.getTheme();

  if (!isVisible) {
    return null;
  }

  return (
    <Box flexDirection="row" paddingX={1} marginY={1}>
      <Box marginRight={1}>
        <Text color={theme.colors.warning}>
          <Spinner type="dots" />
        </Text>
      </Box>
      <Box flexDirection="column">
        <Text color={theme.colors.warning}>{text}</Text>
        {details && (
          <Text color={theme.colors.text.muted} dimColor>
            {details}
          </Text>
        )}
      </Box>
    </Box>
  );
};

export default LoadingIndicator;
