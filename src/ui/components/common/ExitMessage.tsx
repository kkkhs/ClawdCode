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

  return (
    <Box flexDirection="column" paddingY={1}>
      <Box>
        <Text color={theme.colors.border.light}>{'━'.repeat(60)}</Text>
      </Box>
      
      <Box marginY={1} flexDirection="column">
        <Text>
          <Text color="yellow">👋 Session saved!</Text>
          <Text> To resume this conversation:</Text>
        </Text>
        
        <Box marginTop={1} flexDirection="column" marginLeft={3}>
          <Text color="green">clawdcode --continue</Text>
          <Text color={theme.colors.text.muted}>or</Text>
          <Text>
            <Text color="green">clawdcode --resume </Text>
            <Text color="cyan">{sessionId}</Text>
          </Text>
        </Box>
      </Box>
      
      <Box>
        <Text color={theme.colors.border.light}>{'━'.repeat(60)}</Text>
      </Box>
    </Box>
  );
};

export default ExitMessage;
