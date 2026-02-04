/**
 * MessageRenderer - 消息渲染组件
 * 
 * 解析 Markdown 并渲染为终端友好的格式
 */

import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import stringWidth from 'string-width';
import { parseMarkdown } from './parser.js';
import { themeManager } from '../../themes/index.js';
import { CodeHighlighter } from './CodeHighlighter.js';
import type { ParsedBlock } from './types.js';

interface MessageRendererProps {
  /** 消息内容（Markdown） */
  content: string;
  /** 消息角色 */
  role: 'user' | 'assistant' | 'system' | 'tool';
  /** 终端宽度 */
  terminalWidth?: number;
  /** 是否显示角色前缀 */
  showPrefix?: boolean;
}

/**
 * 消息渲染器
 */
export const MessageRenderer: React.FC<MessageRendererProps> = React.memo(
  ({ content, role, terminalWidth = 80, showPrefix = true }) => {
    const theme = themeManager.getTheme();
    const roleStyle = themeManager.getRoleStyle(role);

    // 解析 Markdown（缓存结果）
    const blocks = useMemo(() => parseMarkdown(content), [content]);

    return (
      <Box flexDirection="column" marginBottom={1}>
        {blocks.map((block, index) => (
          <BlockRenderer
            key={index}
            block={block}
            isFirst={index === 0}
            roleStyle={showPrefix ? roleStyle : undefined}
            terminalWidth={terminalWidth}
            theme={theme}
          />
        ))}
      </Box>
    );
  }
);

MessageRenderer.displayName = 'MessageRenderer';

// ===== 块渲染器 =====

interface BlockRendererProps {
  block: ParsedBlock;
  isFirst: boolean;
  roleStyle?: { color: string; prefix: string; bold?: boolean };
  terminalWidth: number;
  theme: ReturnType<typeof themeManager.getTheme>;
}

const BlockRenderer: React.FC<BlockRendererProps> = ({
  block,
  isFirst,
  roleStyle,
  terminalWidth,
  theme,
}) => {
  const prefixWidth = roleStyle?.prefix.length ?? 0;
  const contentWidth = terminalWidth - prefixWidth - 2;

  // 空行
  if (block.type === 'empty') {
    return <Box height={1} />;
  }

  return (
    <Box flexDirection="row">
      {/* 角色前缀（只在第一行显示） */}
      {isFirst && roleStyle && (
        <Box marginRight={1}>
          <Text color={roleStyle.color} bold={roleStyle.bold}>
            {roleStyle.prefix}
          </Text>
        </Box>
      )}
      {!isFirst && roleStyle && <Box width={prefixWidth + 1} />}

      {/* 根据类型渲染内容 */}
      <Box flexGrow={1} flexShrink={1}>
        {block.type === 'code' ? (
          <CodeBlock
            content={block.content}
            language={block.language}
            theme={theme}
          />
        ) : block.type === 'heading' ? (
          <Heading content={block.content} level={block.level || 1} theme={theme} />
        ) : block.type === 'list' ? (
          <ListItem
            content={block.content}
            listType={block.listType}
            marker={block.marker}
            indent={block.indent}
            theme={theme}
          />
        ) : block.type === 'hr' ? (
          <HorizontalRule width={contentWidth} theme={theme} />
        ) : block.type === 'table' && block.tableData ? (
          <TableRenderer
            headers={block.tableData.headers}
            rows={block.tableData.rows}
            alignments={block.tableData.alignments}
            theme={theme}
          />
        ) : block.type === 'blockquote' ? (
          <Blockquote content={block.content} theme={theme} />
        ) : (
          <TextBlock content={block.content} theme={theme} />
        )}
      </Box>
    </Box>
  );
};

// ===== 子组件 =====

interface ThemedProps {
  theme: ReturnType<typeof themeManager.getTheme>;
}

/** 代码块 - 使用 CodeHighlighter 进行语法高亮 */
const CodeBlock: React.FC<{ content: string; language?: string } & ThemedProps> = ({
  content,
  language,
  theme,
}) => {
  // 使用 CodeHighlighter 组件进行语法高亮
  return (
    <CodeHighlighter
      content={content}
      language={language}
      showLineNumbers={true}
      availableHeight={50}
    />
  );
};

/** 标题 - 不显示 #，用颜色和样式区分 */
const Heading: React.FC<{ content: string; level: number } & ThemedProps> = ({
  content,
  level,
  theme,
}) => {
  const color = level === 1 ? theme.colors.primary : 
                level === 2 ? theme.colors.secondary : 
                level === 3 ? theme.colors.accent :
                theme.colors.text.primary;
  
  // H1/H2 有上下边距，更醒目
  const marginY = level <= 2 ? 1 : 0;
  // H1 加下划线
  const underline = level === 1;
  
  return (
    <Box flexDirection="column" marginY={marginY}>
      <Text color={color} bold underline={underline}>
        {content}
      </Text>
    </Box>
  );
};

/** 列表项 - 支持内联格式 */
const ListItem: React.FC<{
  content: string;
  listType?: 'ul' | 'ol';
  marker?: string;
  indent?: number;
} & ThemedProps> = ({ content, listType, marker, indent = 0, theme }) => {
  const indentStr = '  '.repeat(Math.floor(indent / 2));
  const bulletColor = listType === 'ol' ? theme.colors.info : theme.colors.success;
  
  return (
    <Box>
      <Text>
        {indentStr}
        <Text color={bulletColor}>{marker || '•'}</Text>
        {' '}
      </Text>
      <InlineText content={content} theme={theme} />
    </Box>
  );
};

/** 水平线 */
const HorizontalRule: React.FC<{ width: number } & ThemedProps> = ({ width, theme }) => (
  <Box marginY={1}>
    <Text color={theme.colors.border.light}>{'─'.repeat(Math.max(width, 10))}</Text>
  </Box>
);

/** 去除 Markdown 格式，用于计算显示宽度 */
const stripMarkdownForWidth = (text: string): string => {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')  // **bold**
    .replace(/\*(.+?)\*/g, '$1')       // *italic*
    .replace(/`([^`]+)`/g, '$1')       // `code`
    .replace(/~~(.+?)~~/g, '$1')       // ~~strikethrough~~
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // [link](url)
};

/** 表格 */
const TableRenderer: React.FC<{
  headers: string[];
  rows: string[][];
  alignments: ('left' | 'center' | 'right')[];
} & ThemedProps> = ({ headers, rows, alignments, theme }) => {
  // 计算列宽（使用 stringWidth 处理中文等宽字符）
  const columnWidths = headers.map((header, index) => {
    const headerWidth = stringWidth(stripMarkdownForWidth(header));
    const maxRowWidth = Math.max(
      0,
      ...rows.map(row => stringWidth(stripMarkdownForWidth(row[index] || '')))
    );
    return Math.max(headerWidth, maxRowWidth) + 2;
  });

  // 渲染单元格（考虑实际显示宽度）
  const renderCell = (content: string, width: number, align: 'left' | 'center' | 'right') => {
    const actualWidth = stringWidth(stripMarkdownForWidth(content));
    const padding = Math.max(0, width - actualWidth);
    if (align === 'center') {
      const left = Math.floor(padding / 2);
      const right = padding - left;
      return ' '.repeat(left) + content + ' '.repeat(right);
    }
    if (align === 'right') {
      return ' '.repeat(padding) + content;
    }
    return content + ' '.repeat(padding);
  };

  return (
    <Box flexDirection="column" marginY={1}>
      {/* 表头 */}
      <Box>
        <Text color={theme.colors.border.light}>│</Text>
        {headers.map((header, index) => (
          <React.Fragment key={index}>
            <Text bold color={theme.colors.primary}>
              {renderCell(header, columnWidths[index], alignments[index] || 'left')}
            </Text>
            <Text color={theme.colors.border.light}>│</Text>
          </React.Fragment>
        ))}
      </Box>
      
      {/* 分隔线 */}
      <Box>
        <Text color={theme.colors.border.light}>├</Text>
        {columnWidths.map((width, index) => (
          <React.Fragment key={index}>
            <Text color={theme.colors.border.light}>{'─'.repeat(width)}</Text>
            <Text color={theme.colors.border.light}>
              {index < columnWidths.length - 1 ? '┼' : '┤'}
            </Text>
          </React.Fragment>
        ))}
      </Box>
      
      {/* 数据行 - 支持内联格式 */}
      {rows.map((row, rowIndex) => (
        <Box key={rowIndex}>
          <Text color={theme.colors.border.light}>│</Text>
          {headers.map((_, colIndex) => {
            const cellContent = row[colIndex] || '';
            const paddedContent = renderCell(cellContent, columnWidths[colIndex], alignments[colIndex] || 'left');
            // 检查是否有内联格式
            const hasInlineFormat = /\*\*|`|~~|\[.*\]\(/.test(cellContent);
            return (
              <React.Fragment key={colIndex}>
                {hasInlineFormat ? (
                  <Text>
                    <InlineText content={paddedContent} theme={theme} />
                  </Text>
                ) : (
                  <Text>{paddedContent}</Text>
                )}
                <Text color={theme.colors.border.light}>│</Text>
              </React.Fragment>
            );
          })}
        </Box>
      ))}
    </Box>
  );
};

/** 引用块 */
const Blockquote: React.FC<{ content: string } & ThemedProps> = ({ content, theme }) => (
  <Box>
    <Text color={theme.colors.border.light}>│ </Text>
    <Text color={theme.colors.text.muted} italic>
      {content}
    </Text>
  </Box>
);

/** 普通文本 - 支持内联格式 */
const TextBlock: React.FC<{ content: string } & ThemedProps> = ({ content, theme }) => (
  <Text wrap="wrap">
    <InlineText content={content} theme={theme} />
  </Text>
);

/** 内联格式渲染 */
const InlineText: React.FC<{ content: string } & ThemedProps> = ({ content, theme }) => {
  // 解析内联格式
  const segments = parseInline(content);
  
  return (
    <>
      {segments.map((seg, i) => {
        switch (seg.type) {
          case 'bold':
            return <Text key={i} bold color={theme.colors.text.primary}>{seg.text}</Text>;
          case 'italic':
            return <Text key={i} italic color={theme.colors.text.primary}>{seg.text}</Text>;
          case 'code':
            return <Text key={i} color={theme.colors.syntax.string} backgroundColor={theme.colors.background.secondary}>{seg.text}</Text>;
          case 'strikethrough':
            return <Text key={i} strikethrough color={theme.colors.text.muted}>{seg.text}</Text>;
          case 'link':
            return <Text key={i} color={theme.colors.info} underline>{seg.text}</Text>;
          default:
            return <Text key={i} color={theme.colors.text.primary}>{seg.text}</Text>;
        }
      })}
    </>
  );
};

/** 简单的内联格式解析器 */
function parseInline(text: string): Array<{ type: string; text: string }> {
  const segments: Array<{ type: string; text: string }> = [];
  let remaining = text;
  
  // 正则匹配所有内联格式
  const pattern = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))|(~~(.+?)~~)/g;
  let lastIndex = 0;
  let match;
  
  while ((match = pattern.exec(remaining)) !== null) {
    // 添加匹配前的普通文本
    if (match.index > lastIndex) {
      segments.push({ type: 'text', text: remaining.slice(lastIndex, match.index) });
    }
    
    if (match[1]) {
      // **bold**
      segments.push({ type: 'bold', text: match[2] });
    } else if (match[3]) {
      // *italic*
      segments.push({ type: 'italic', text: match[4] });
    } else if (match[5]) {
      // `code`
      segments.push({ type: 'code', text: match[6] });
    } else if (match[7]) {
      // [link](url)
      segments.push({ type: 'link', text: match[8] });
    } else if (match[10]) {
      // ~~strikethrough~~
      segments.push({ type: 'strikethrough', text: match[11] });
    }
    
    lastIndex = match.index + match[0].length;
  }
  
  // 添加剩余文本
  if (lastIndex < remaining.length) {
    segments.push({ type: 'text', text: remaining.slice(lastIndex) });
  }
  
  // 如果没有找到任何格式，返回原文本
  if (segments.length === 0) {
    return [{ type: 'text', text }];
  }
  
  return segments;
}

export default MessageRenderer;
