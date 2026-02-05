/**
 * ExitMessage - 退出提示组件
 * 
 * 在应用退出前显示会话恢复提示
 */

import React, { useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import { themeManager } from '../../themes/index.js';

interface ExitMessageProps {
  /** 会话 ID */
  sessionId: string;
  /** 退出延迟（毫秒） */
  exitDelay?: number;
}

/**
 * 退出提示组件
 */
export const ExitMessage: React.FC<ExitMessageProps> = ({
  sessionId,
  exitDelay = 500, // 增加延迟确保渲染完成
}) => {
  const { exit } = useApp();
  const theme = themeManager.getTheme();

  // 延迟退出，确保消息渲染完成
  useEffect(() => {
    const timer = setTimeout(() => {
      exit();
      // 确保进程退出
      setTimeout(() => process.exit(0), 50);
    }, exitDelay);

    return () => clearTimeout(timer);
  }, [exit, exitDelay]);

  const shortId = sessionId.length > 16 
    ? `${sessionId.slice(0, 8)}..${sessionId.slice(-6)}`
    : sessionId;

  return (
    <Box flexDirection="column" paddingY={1}>
      <Box marginBottom={1}>
        <Text color={theme.colors.text.muted}>─ </Text>
        <Text color={theme.colors.warning}>session saved</Text>
        <Text color={theme.colors.text.muted}> [</Text>
        <Text color={theme.colors.info}>{shortId}</Text>
        <Text color={theme.colors.text.muted}>]</Text>
      </Box>
      
      <Box flexDirection="column" marginLeft={2}>
        <Text color={theme.colors.text.muted}>resume: </Text>
        <Box marginLeft={2}>
          <Text color={theme.colors.success}>clawdcode --continue</Text>
        </Box>
        <Box marginLeft={2}>
          <Text color={theme.colors.success}>clawdcode --resume </Text>
          <Text color={theme.colors.info}>{sessionId}</Text>
        </Box>
      </Box>
    </Box>
  );
};

export default ExitMessage;
