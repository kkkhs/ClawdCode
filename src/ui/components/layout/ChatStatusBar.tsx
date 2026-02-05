/**
 * ChatStatusBar - 聊天状态栏组件
 * 
 * 简约极客风格的状态栏，显示核心会话信息
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
  /** 队列中的命令数量 */
  queuedCommands?: number;
  /** 当前主题 */
  themeName?: string;
  /** 是否显示 */
  isVisible?: boolean;
}

/**
 * 格式化 Token 数量（简洁格式）
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
 * 聊天状态栏 - 极简风格
 */
export const ChatStatusBar: React.FC<ChatStatusBarProps> = ({
  model,
  sessionId,
  tokenUsage,
  messageCount,
  queuedCommands,
  themeName,
  isVisible = true,
}) => {
  const theme = themeManager.getTheme();

  if (!isVisible) {
    return null;
  }

  // 构建状态项（使用简洁的文字标签）
  const segments: Array<{ content: React.ReactNode; dimmed?: boolean }> = [];

  // Model - 核心信息，高亮显示
  if (model) {
    segments.push({
      content: (
        <>
          <Text color={theme.colors.text.muted}>model:</Text>
          <Text color={theme.colors.primary} bold>{model}</Text>
        </>
      ),
    });
  }

  // Messages count
  if (messageCount !== undefined) {
    segments.push({
      content: (
        <>
          <Text color={theme.colors.text.muted}>msgs:</Text>
          <Text color={theme.colors.text.secondary}>{messageCount}</Text>
        </>
      ),
    });
  }

  // Queue (only if > 0)
  if (queuedCommands !== undefined && queuedCommands > 0) {
    segments.push({
      content: (
        <>
          <Text color={theme.colors.text.muted}>queue:</Text>
          <Text color={theme.colors.warning}>{queuedCommands}</Text>
        </>
      ),
    });
  }

  // Tokens - input/output format
  if (tokenUsage && tokenUsage.total > 0) {
    segments.push({
      content: (
        <>
          <Text color={theme.colors.text.muted}>tokens:</Text>
          <Text color={theme.colors.info}>
            {formatTokens(tokenUsage.input)}/{formatTokens(tokenUsage.output)}
          </Text>
        </>
      ),
    });
  }

  // Theme
  if (themeName) {
    segments.push({
      content: (
        <>
          <Text color={theme.colors.text.muted}>theme:</Text>
          <Text color={theme.colors.text.secondary}>{themeName}</Text>
        </>
      ),
      dimmed: true,
    });
  }

  // Session ID (truncated for display)
  if (sessionId) {
    const shortId = sessionId.length > 12 
      ? `${sessionId.slice(0, 8)}..${sessionId.slice(-4)}`
      : sessionId;
    segments.push({
      content: (
        <>
          <Text color={theme.colors.text.muted}>sid:</Text>
          <Text color={theme.colors.text.muted}>{shortId}</Text>
        </>
      ),
      dimmed: true,
    });
  }

  if (segments.length === 0) {
    return null;
  }

  return (
    <Box
      flexDirection="row"
      justifyContent="flex-start"
      paddingX={0}
      marginTop={0}
    >
      <Text color={theme.colors.text.muted} dimColor>─ </Text>
      {segments.map((seg, index) => (
        <React.Fragment key={index}>
          {index > 0 && (
            <Text color={theme.colors.text.muted} dimColor> · </Text>
          )}
          <Text dimColor={seg.dimmed}>{seg.content}</Text>
        </React.Fragment>
      ))}
      <Text color={theme.colors.text.muted} dimColor> ─</Text>
    </Box>
  );
};

export default ChatStatusBar;
