/**
 * ChatStatusBar - 聊天状态栏组件
 * 
 * 简约极客风格的状态栏，自己订阅状态避免父组件重渲染影响
 */

import React from 'react';
import { Box, Text } from 'ink';
import { themeManager } from '../../themes/index.js';
import {
  useSessionId,
  useTokenUsage,
  useMessageCount,
  usePendingCommands,
} from '../../../store/index.js';

interface ChatStatusBarProps {
  /** 当前模型 */
  model?: string;
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
 * 聊天状态栏 - 自己订阅状态
 */
export const ChatStatusBar: React.FC<ChatStatusBarProps> = React.memo(({
  model,
  isVisible = true,
}) => {
  const theme = themeManager.getTheme();
  
  // 自己订阅需要的状态
  const sessionId = useSessionId();
  const tokenUsage = useTokenUsage();
  const messageCount = useMessageCount();
  const queuedCommands = usePendingCommands().length;
  const themeName = theme.name;

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
  if (queuedCommands > 0) {
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
  if (tokenUsage && (tokenUsage.inputTokens + tokenUsage.outputTokens) > 0) {
    segments.push({
      content: (
        <>
          <Text color={theme.colors.text.muted}>tokens:</Text>
          <Text color={theme.colors.info}>
            {formatTokens(tokenUsage.inputTokens)}/{formatTokens(tokenUsage.outputTokens)}
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
          <Text color={theme.colors.accent}>{themeName}</Text>
        </>
      ),
    });
  }

  // Session ID
  if (sessionId) {
    segments.push({
      content: (
        <>
          <Text color={theme.colors.text.muted}>sid:</Text>
          <Text color={theme.colors.info} dimColor>{sessionId}</Text>
        </>
      ),
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
});

ChatStatusBar.displayName = 'ChatStatusBar';

export default ChatStatusBar;
