# 第 12b 章：交互式 Commands

> 本章实现交互式选择器组件，增强 Slash Commands 的用户体验。

## 12b.1 概述

交互式 Commands 让用户通过键盘导航选择选项，而非手动输入参数：

```plaintext
/model    → 显示模型列表，↑↓ 选择
/theme    → 显示主题列表，↑↓ 选择
```

## 12b.2 InteractiveSelector 组件

```typescript
// src/ui/components/dialog/InteractiveSelector.tsx

export interface SelectorOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface InteractiveSelectorProps {
  title: string;
  options: SelectorOption[];
  onSelect: (value: string) => void;
  onCancel: () => void;
  initialIndex?: number;
}

export const InteractiveSelector: React.FC<InteractiveSelectorProps> = ({
  title,
  options,
  onSelect,
  onCancel,
  initialIndex = 0,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  
  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex(prev => Math.min(options.length - 1, prev + 1));
    } else if (key.return) {
      const selected = options[selectedIndex];
      if (!selected.disabled) {
        onSelect(selected.value);
      }
    } else if (key.escape) {
      onCancel();
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text bold>{title}</Text>
      {options.map((option, index) => (
        <Box key={option.value}>
          <Text color={index === selectedIndex ? 'cyan' : undefined}>
            {index === selectedIndex ? '▶ ' : '  '}
            {option.label}
          </Text>
          {option.description && (
            <Text dimColor> - {option.description}</Text>
          )}
        </Box>
      ))}
      <Text dimColor>↑↓ 选择 · Enter 确认 · Esc 取消</Text>
    </Box>
  );
};
```

## 12b.3 /model 交互式选择

```typescript
// 在 ClawdInterface 中处理 /model 命令
if (result.data?.action === 'select_model') {
  setSelectorState({
    isVisible: true,
    title: '选择模型',
    options: result.data.options,
    onSelect: async (value) => {
      // 切换模型
      await configActions().setModel(value);
      sessionActions().addAssistantMessage(`✓ 模型已切换为 ${value}`);
    },
  });
}
```

## 12b.4 /theme 交互式选择

```typescript
// 在 ClawdInterface 中处理 /theme 命令
if (result.data?.action === 'select_theme') {
  setSelectorState({
    isVisible: true,
    title: '选择主题',
    options: result.data.options,
    onSelect: (value) => {
      themeManager.setTheme(value, true); // persist = true
      sessionActions().addAssistantMessage(`✓ 主题已切换为 ${value}`);
    },
  });
}
```

## 12b.5 新增文件

| 文件 | 说明 |
|------|------|
| `src/ui/components/dialog/InteractiveSelector.tsx` | 交互式选择器组件 |

## 12b.6 测试方法

### 1. 启动应用

```bash
npm run dev
# 或
node dist/main.js
```

### 2. 测试 /model 交互选择

```
/model
```

应显示模型选择器：
- 使用 ↑↓ 键导航
- 当前模型标记 `(current)`
- 按 Enter 选择，Esc 取消

### 3. 测试 /theme 交互选择

```
/theme
```

应显示主题选择器：
- 列出所有可用主题
- 选择后立即生效并持久化

### 4. 测试直接参数

```
/model gpt-4
/theme dark
```

应直接切换，无需交互选择。
