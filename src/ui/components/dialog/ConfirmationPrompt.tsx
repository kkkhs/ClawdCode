/**
 * ConfirmationPrompt - 权限确认组件
 * 
 * 用于在执行危险操作前请求用户确认
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ConfirmationDetails, ConfirmationResponse } from '../../../agent/types.js';

interface ConfirmationPromptProps {
  details: ConfirmationDetails;
  onResponse: (response: ConfirmationResponse) => void;
}

type SelectionOption = 'approve' | 'deny' | 'approve_session';

const OPTIONS: { value: SelectionOption; label: string }[] = [
  { value: 'approve', label: '✅ Approve' },
  { value: 'deny', label: '❌ Deny' },
  { value: 'approve_session', label: '✅ Approve & Remember' },
];

export const ConfirmationPrompt: React.FC<ConfirmationPromptProps> = ({
  details,
  onResponse,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : OPTIONS.length - 1));
    } else if (key.downArrow) {
      setSelectedIndex(prev => (prev < OPTIONS.length - 1 ? prev + 1 : 0));
    } else if (key.return) {
      const selected = OPTIONS[selectedIndex];
      onResponse({
        approved: selected.value.startsWith('approve'),
        scope: selected.value === 'approve_session' ? 'session' : 'once',
      });
    } else if (input === 'y' || input === 'Y') {
      onResponse({ approved: true, scope: 'once' });
    } else if (input === 'n' || input === 'N') {
      onResponse({ approved: false, reason: 'User pressed N' });
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
      {/* 标题 */}
      <Box marginBottom={1}>
        <Text bold color="yellow">⚠️  {details.title}</Text>
      </Box>

      {/* 消息 */}
      <Box marginBottom={1}>
        <Text>{details.message}</Text>
      </Box>

      {/* 详情（如果有） */}
      {details.details && (
        <Box marginBottom={1} flexDirection="column">
          <Text dimColor>Details:</Text>
          <Box marginLeft={2}>
            <Text dimColor>{details.details}</Text>
          </Box>
        </Box>
      )}

      {/* 风险（如果有） */}
      {details.risks && details.risks.length > 0 && (
        <Box marginBottom={1} flexDirection="column">
          <Text color="red">Risks:</Text>
          {details.risks.map((risk, i) => (
            <Box key={i} marginLeft={2}>
              <Text color="red">• {risk}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* 受影响的文件（如果有） */}
      {details.affectedFiles && details.affectedFiles.length > 0 && (
        <Box marginBottom={1} flexDirection="column">
          <Text color="cyan">Affected files:</Text>
          {details.affectedFiles.map((file, i) => (
            <Box key={i} marginLeft={2}>
              <Text color="cyan">• {file}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* 选项 */}
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>Use ↑/↓ to select, Enter to confirm, or press Y/N:</Text>
        {OPTIONS.map((option, index) => (
          <Box key={option.value}>
            <Text
              color={index === selectedIndex ? 'green' : undefined}
              bold={index === selectedIndex}
            >
              {index === selectedIndex ? '❯ ' : '  '}
              {option.label}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

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
