/**
 * ConfirmationPrompt - 权限确认组件
 * 
 * 简洁风格，用于在执行操作前请求用户确认
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { themeManager } from '../../themes/index.js';
import { FocusId, focusManager } from '../../focus/index.js';
import type { ConfirmationDetails, ConfirmationResponse } from '../../../agent/types.js';

interface ConfirmationPromptProps {
  details: ConfirmationDetails;
  onResponse: (response: ConfirmationResponse) => void;
}

export const ConfirmationPrompt: React.FC<ConfirmationPromptProps> = ({
  details,
  onResponse,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const theme = themeManager.getTheme();

  const options = [
    { key: 'y', label: 'allow', scope: 'once' as const, approved: true },
    { key: 'a', label: 'always', scope: 'session' as const, approved: true },
    { key: 'n', label: 'deny', scope: 'once' as const, approved: false },
  ];

  useInput((input, key) => {
    // Imperative focus check — avoids stale React closure
    if (focusManager.getCurrentFocus() !== FocusId.CONFIRMATION_PROMPT) return;
    if (key.upArrow) {
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : options.length - 1));
    } else if (key.downArrow) {
      setSelectedIndex(prev => (prev < options.length - 1 ? prev + 1 : 0));
    } else if (key.return) {
      const sel = options[selectedIndex];
      onResponse({ approved: sel.approved, scope: sel.scope });
    } else if (input === 'y' || input === 'Y') {
      onResponse({ approved: true, scope: 'once' });
    } else if (input === 'a' || input === 'A') {
      onResponse({ approved: true, scope: 'session' });
    } else if (input === 'n' || input === 'N') {
      onResponse({ approved: false, reason: 'denied' });
    }
  });

  // Extract tool name from title (e.g. "Permission Required: Bash" -> "Bash")
  const toolName = details.title.replace(/^.*:\s*/, '');

  // Extract the primary content to highlight (command, file path, etc.)
  const { label, highlight, extra } = extractHighlight(details.details);

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Header: tool name + reason */}
      <Box>
        <Text color={theme.colors.warning} bold>? </Text>
        <Text bold>{toolName}</Text>
        {details.message && details.message !== details.title && (
          <Text color={theme.colors.text.muted} dimColor> · {details.message}</Text>
        )}
      </Box>

      {/* Highlighted content (command / file path) */}
      {highlight && (
        <Box marginLeft={2}>
          {label && <Text color={theme.colors.text.muted} dimColor>{label} </Text>}
          <Text color={theme.colors.accent} wrap="wrap">{highlight}</Text>
        </Box>
      )}

      {/* Extra detail lines (e.g. directory, content preview) */}
      {extra.length > 0 && (
        <Box flexDirection="column" marginLeft={2}>
          {extra.map((line, i) => (
            <Text key={i} color={theme.colors.text.muted} dimColor wrap="wrap">
              {line}
            </Text>
          ))}
        </Box>
      )}

      {/* Affected files */}
      {details.affectedFiles && details.affectedFiles.length > 0 && (
        <Box marginLeft={2}>
          <Text color={theme.colors.info} dimColor>
            {details.affectedFiles.join(', ')}
          </Text>
        </Box>
      )}

      {/* Risks - single line */}
      {details.risks && details.risks.length > 0 && (
        <Box marginLeft={2}>
          <Text color={theme.colors.text.muted} dimColor>
            {details.risks.join(' · ')}
          </Text>
        </Box>
      )}

      {/* Options - vertical, up/down selection */}
      <Box flexDirection="column" marginLeft={2} marginTop={1}>
        {options.map((opt, i) => {
          const active = i === selectedIndex;
          return (
            <Box key={opt.key}>
              <Text
                color={active ? theme.colors.success : theme.colors.text.muted}
                bold={active}
                dimColor={!active}
              >
                {active ? '> ' : '  '}
                {opt.label}
              </Text>
              <Text color={theme.colors.text.muted} dimColor>  ({opt.key})</Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

/**
 * 从 details 字符串中提取需要高亮的主要内容
 * 返回 label（如 "Command:"）、highlight（高亮值）和 extra（其余行）
 */
function extractHighlight(details?: string): { label: string; highlight: string; extra: string[] } {
  if (!details) return { label: '', highlight: '', extra: [] };

  const strip = (s: string) =>
    s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').trim();

  const lines = details.split('\n').filter(l => l.trim());
  let label = '';
  let highlight = '';
  const extra: string[] = [];

  for (const raw of lines) {
    const line = strip(raw);
    // Primary highlight: Command / File path
    if (/^Command:\s*/.test(line)) {
      label = 'Command:';
      highlight = line.replace(/^Command:\s*/, '');
    } else if (/^File:\s*/.test(line)) {
      label = 'File:';
      highlight = line.replace(/^File:\s*/, '');
    } else if (/^(Directory|Content Preview|Before|After):\s*/.test(line)) {
      extra.push(line);
    } else if (line === '```' || line.startsWith('```')) {
      // skip code fences
    } else if (line) {
      extra.push(line);
    }
  }

  return { label, highlight, extra };
}

/**
 * 创建 CLI 确认处理器
 * 用于在非交互式环境中自动处理确认
 */
export function createAutoConfirmationHandler(
  mode: 'approve' | 'deny' | 'approve_session' = 'deny'
): (details: ConfirmationDetails) => Promise<ConfirmationResponse> {
  return async () => ({
    approved: mode.startsWith('approve'),
    scope: mode === 'approve_session' ? 'session' : 'once',
    reason: `Auto-${mode} by non-interactive mode`,
  });
}

export default ConfirmationPrompt;
