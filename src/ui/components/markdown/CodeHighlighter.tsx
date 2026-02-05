/**
 * CodeHighlighter - 代码语法高亮组件
 * 
 * 使用 lowlight（highlight.js 的虚拟 DOM 版本）实现语法高亮
 */

import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { common, createLowlight } from 'lowlight';
import { themeManager } from '../../themes/index.js';
import type { SyntaxColors } from '../../themes/types.js';

// 创建 lowlight 实例（支持常用语言）
const lowlight = createLowlight(common);

interface CodeHighlighterProps {
  /** 代码内容 */
  content: string;
  /** 代码语言 */
  language?: string;
  /** 是否显示行号 */
  showLineNumbers?: boolean;
  /** 终端宽度 */
  terminalWidth?: number;
  /** 起始行号 */
  startLine?: number;
}

/**
 * 代码高亮组件
 */
export const CodeHighlighter: React.FC<CodeHighlighterProps> = ({
  content,
  language,
  showLineNumbers = true,
  terminalWidth = 80,
  startLine = 1,
}) => {
  const theme = themeManager.getTheme();
  const syntaxColors = theme.colors.syntax;

  // 解析代码行（不再限制高度，完整显示代码块）
  const lines = useMemo(() => {
    return content.split('\n');
  }, [content]);

  // 计算行号宽度
  const totalLines = startLine + lines.length - 1;
  const lineNumberWidth = showLineNumbers ? String(totalLines).length + 1 : 0;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.colors.border.light}
      paddingX={1}
      marginY={1}
    >
      {/* 语言标签 */}
      {language && (
        <Box marginBottom={1}>
          <Text color={theme.colors.text.muted} dimColor>
            {language}
          </Text>
        </Box>
      )}

      {/* 代码内容 */}
      {lines.map((line, index) => {
        const lineNumber = startLine + index;
        
        return (
          <Box key={index} flexDirection="row">
            {/* 行号 */}
            {showLineNumbers && (
              <Box width={lineNumberWidth} marginRight={1}>
                <Text dimColor>
                  {String(lineNumber).padStart(lineNumberWidth - 1, ' ')}
                </Text>
              </Box>
            )}

            {/* 高亮代码 */}
            <Box flexShrink={1}>
              <HighlightedLine line={line} language={language} syntaxColors={syntaxColors} />
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};

/**
 * 高亮单行代码
 */
const HighlightedLine: React.FC<{
  line: string;
  language?: string;
  syntaxColors: SyntaxColors;
}> = React.memo(({ line, language, syntaxColors }) => {
  const highlighted = useMemo(() => {
    // 处理空行：直接返回空格以保持行高
    if (!line || line.trim() === '') {
      // 保留原始空格，如果完全空则显示一个空格占位
      return <Text color={syntaxColors.default}>{line || ' '}</Text>;
    }

    try {
      // 检查语言是否注册
      if (language && lowlight.registered(language)) {
        const result = lowlight.highlight(language, line);
        return renderHastNode(result, syntaxColors);
      }

      // 对于未注册的语言或纯文本，尝试自动检测
      // 但对于短行或特殊字符，直接显示原文
      if (line.length < 10 || /^[\s│┌┐└┘├┤┬┴┼─═║╔╗╚╝╠╣╦╩╬|+\-*=<>]+$/.test(line)) {
        return <Text color={syntaxColors.default}>{line}</Text>;
      }

      const result = lowlight.highlightAuto(line);
      return renderHastNode(result, syntaxColors);
    } catch {
      return <Text color={syntaxColors.default}>{line}</Text>;
    }
  }, [line, language, syntaxColors]);

  return <>{highlighted}</>;
});

HighlightedLine.displayName = 'HighlightedLine';

/**
 * 将 lowlight 的 HAST 节点转换为 React 组件
 */
function renderHastNode(
  node: any,
  syntaxColors: SyntaxColors,
  key?: number
): React.ReactNode {
  if (node.type === 'text') {
    return <Text key={key}>{node.value}</Text>;
  }

  if (node.type === 'root') {
    return (
      <>
        {node.children?.map((child: any, index: number) =>
          renderHastNode(child, syntaxColors, index)
        )}
      </>
    );
  }

  if (node.type === 'element') {
    const className = node.properties?.className?.[0] || '';
    const color = getColorForClass(className, syntaxColors);

    const children = node.children?.map((child: any, index: number) =>
      renderHastNode(child, syntaxColors, index)
    );

    return (
      <Text key={key} color={color}>
        {children}
      </Text>
    );
  }

  return <Text key={key}></Text>;
}

/**
 * 根据 CSS 类名获取颜色
 */
function getColorForClass(className: string, syntaxColors: SyntaxColors): string {
  // hljs 类名映射
  if (className.includes('comment') || className.includes('prolog')) {
    return syntaxColors.comment;
  }
  if (className.includes('string') || className.includes('char') || className.includes('template-string')) {
    return syntaxColors.string;
  }
  if (className.includes('number') || className.includes('boolean') || className.includes('constant')) {
    return syntaxColors.number;
  }
  if (className.includes('keyword') || className.includes('selector') || className.includes('important')) {
    return syntaxColors.keyword;
  }
  if (className.includes('function') || className.includes('method')) {
    return syntaxColors.function;
  }
  if (className.includes('variable') || className.includes('property')) {
    return syntaxColors.variable;
  }
  if (className.includes('operator') || className.includes('punctuation')) {
    return syntaxColors.operator;
  }
  if (className.includes('type') || className.includes('class-name') || className.includes('builtin')) {
    return syntaxColors.type;
  }
  if (className.includes('tag') || className.includes('name')) {
    return syntaxColors.tag;
  }
  if (className.includes('attr')) {
    return syntaxColors.attr;
  }

  return syntaxColors.default;
}

export default CodeHighlighter;
