/**
 * MessageArea - 消息列表区域
 * 
 * 显示对话历史消息
 */

import React from 'react';
import { Box, Text } from 'ink';
import { MessageRenderer } from '../markdown/MessageRenderer.js';
import { useTerminalWidth } from '../../hooks/index.js';
import { themeManager } from '../../themes/index.js';

/**
 * UI 消息类型
 */
export interface UIMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp?: number;
  metadata?: {
    model?: string;
    tokenUsage?: { input: number; output: number };
  };
}

interface MessageAreaProps {
  /** 消息列表 */
  messages: UIMessage[];
  /** 最大显示消息数 */
  maxMessages?: number;
  /** 是否显示时间戳 */
  showTimestamp?: boolean;
}

/**
 * 格式化时间戳
 */
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 消息列表区域
 */
export const MessageArea: React.FC<MessageAreaProps> = ({
  messages,
  maxMessages = 50,
  showTimestamp = false,
}) => {
  const terminalWidth = useTerminalWidth();
  const theme = themeManager.getTheme();

  // 限制显示的消息数量
  const displayMessages = messages.slice(-maxMessages);

  if (displayMessages.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color={theme.colors.text.muted} dimColor>
          No messages yet. Start a conversation!
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {displayMessages.map((message, index) => (
        <Box key={index} flexDirection="column" marginBottom={1}>
          {/* 时间戳 */}
          {showTimestamp && message.timestamp && (
            <Box marginBottom={0}>
              <Text color={theme.colors.text.muted} dimColor>
                {formatTimestamp(message.timestamp)}
              </Text>
            </Box>
          )}
          
          {/* 消息内容 */}
          <MessageRenderer
            content={message.content}
            role={message.role}
            terminalWidth={terminalWidth - 2}
            showPrefix={true}
          />
        </Box>
      ))}
    </Box>
  );
};

export default MessageArea;
