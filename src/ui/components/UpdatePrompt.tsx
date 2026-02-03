/**
 * UpdatePrompt - 版本更新提示组件
 * 
 * 显示可用更新，提供三个选项：
 * - Update now: 立即执行升级
 * - Skip: 跳过本次提示
 * - Skip until next version: 跳过当前版本的提示
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { VersionCheckResult } from '../../services/VersionChecker.js';
import {
  setSkipUntilVersion,
  getUpgradeCommand,
  performUpgrade,
} from '../../services/VersionChecker.js';

interface UpdatePromptProps {
  versionInfo: VersionCheckResult;
  onComplete: () => void;
}

type MenuOption = 'update' | 'skip' | 'skipUntil';

const menuOptions: { key: MenuOption; label: string }[] = [
  { key: 'update', label: 'Update now' },
  { key: 'skip', label: 'Skip' },
  { key: 'skipUntil', label: 'Skip until next version' },
];

export const UpdatePrompt: React.FC<UpdatePromptProps> = ({
  versionInfo,
  onComplete,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState<string | null>(null);

  useInput(async (input, key) => {
    if (isUpdating) return;

    // 上下键选择
    if (key.upArrow) {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : menuOptions.length - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((prev) => (prev < menuOptions.length - 1 ? prev + 1 : 0));
      return;
    }

    // 数字键快速选择
    const numKey = parseInt(input, 10);
    if (numKey >= 1 && numKey <= menuOptions.length) {
      setSelectedIndex(numKey - 1);
      return;
    }

    // Enter 确认选择
    if (key.return) {
      const selected = menuOptions[selectedIndex];
      await handleSelection(selected.key);
    }
  });

  const handleSelection = async (option: MenuOption) => {
    switch (option) {
      case 'update':
        setIsUpdating(true);
        const result = await performUpgrade();
        setUpdateResult(result.message);
        if (result.success) {
          // 升级成功，退出程序
          setTimeout(() => process.exit(0), 1500);
        } else {
          // 升级失败，继续进入应用
          setTimeout(() => onComplete(), 2000);
        }
        break;

      case 'skip':
        onComplete();
        break;

      case 'skipUntil':
        if (versionInfo.latestVersion) {
          await setSkipUntilVersion(versionInfo.latestVersion);
        }
        onComplete();
        break;
    }
  };

  // 显示升级结果
  if (updateResult) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>{updateResult}</Text>
      </Box>
    );
  }

  // 显示升级中
  if (isUpdating) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="yellow">⏳ Upgrading...</Text>
        <Text color="gray">{getUpgradeCommand()}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      {/* 标题 */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          🎉 New version available!
        </Text>
      </Box>

      {/* 版本信息 */}
      <Box marginBottom={1}>
        <Text>
          <Text color="gray">{versionInfo.currentVersion}</Text>
          <Text color="gray"> → </Text>
          <Text color="green" bold>{versionInfo.latestVersion}</Text>
        </Text>
      </Box>

      {/* 菜单选项 */}
      <Box flexDirection="column" marginBottom={1}>
        {menuOptions.map((option, index) => (
          <Box key={option.key}>
            <Text color={selectedIndex === index ? 'cyan' : 'white'}>
              {selectedIndex === index ? '❯ ' : '  '}
              {index + 1}. {option.label}
            </Text>
          </Box>
        ))}
      </Box>

      {/* 提示 */}
      <Box>
        <Text color="gray">
          Use ↑↓ to navigate, Enter to select, or press 1-3
        </Text>
      </Box>
    </Box>
  );
};

export default UpdatePrompt;
