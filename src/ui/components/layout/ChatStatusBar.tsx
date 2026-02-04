/**
 * ChatStatusBar - 聊天状态栏组件
 * 
 * 显示当前会话状态、模型信息、Token 使用量等
 */

import React from 'react';
import { Box, Text } from 'ink';
import { themeManager } from '../../themes/index.js';

interface ChatStatusBarProps {
  /** 当前模型 */
  model?: string;
  /** 会话 ID */
  sessionId?: string;
  /** Token 使用量 */
  tokenUsage?: {
    input: number;
    output: number;
    total: number;
  };
  /** 消息数量 */
  messageCount?: number;
  /** 当前主题 */
  themeName?: string;
  /** 是否显示 */
  isVisible?: boolean;
}

/**
 * 格式化 Token 数量
 */
function formatTokens(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return String(count);
}

/**
 * 聊天状态栏
 */
export const ChatStatusBar: React.FC<ChatStatusBarProps> = ({
  model,
  sessionId,
  tokenUsage,
  messageCount,
  themeName,
  isVisible = true,
}) => {
  const theme = themeManager.getTheme();

  if (!isVisible) {
    return null;
  }

  const items: Array<{ label: string; value: string; color?: string }> = [];

  if (model) {
    items.push({ label: '🤖', value: model, color: theme.colors.primary });
  }

  if (messageCount !== undefined) {
    items.push({ label: '💬', value: String(messageCount) });
  }

  if (tokenUsage) {
    items.push({
      label: '📊',
      value: `${formatTokens(tokenUsage.input)}/${formatTokens(tokenUsage.output)} tokens`,
      color: theme.colors.info,
    });
  }

  if (themeName) {
    items.push({ label: '🎨', value: themeName });
  }

  if (sessionId) {
    // 显示完整会话 ID
    items.push({ label: '📝', value: sessionId, color: theme.colors.text.muted });
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <Box
      flexDirection="row"
      justifyContent="flex-end"
      paddingX={1}
      borderStyle="single"
      borderColor={theme.colors.border.light}
      borderTop={false}
      borderLeft={false}
      borderRight={false}
    >
      {items.map((item, index) => (
        <React.Fragment key={index}>
          {index > 0 && (
            <Text color={theme.colors.border.light}> │ </Text>
          )}
          <Text>
            <Text>{item.label} </Text>
            <Text color={item.color || theme.colors.text.secondary}>
              {item.value}
            </Text>
          </Text>
        </React.Fragment>
      ))}
    </Box>
  );
};

export default ChatStatusBar;
