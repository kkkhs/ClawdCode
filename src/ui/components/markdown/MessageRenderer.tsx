/**
 * MessageRenderer - 消息渲染组件
 *
 * 解析 Markdown 并渲染为终端友好的格式
 */

import React, { useMemo, useState, useEffect } from 'react'
import { Box, Text } from 'ink'
import stringWidth from 'string-width'
import { parseMarkdown } from './parser.js'
import { themeManager } from '../../themes/index.js'
import { CodeHighlighter } from './CodeHighlighter.js'
import { useShowAllThinking } from '../../../store/index.js'
import type { ParsedBlock } from './types.js'

interface MessageRendererProps {
  /** 消息内容（Markdown） */
  content: string
  /** 消息角色 */
  role: 'user' | 'assistant' | 'system' | 'tool'
  /** 终端宽度 */
  terminalWidth?: number
  /** 是否显示角色前缀 */
  showPrefix?: boolean
  /** 思考过程内容（用于支持 DeepSeek R1 等推理模型） */
  thinking?: string
  /** 是否正在流式输出中 */
  isStreaming?: boolean
}

/**
 * 消息渲染器
 */
export const MessageRenderer: React.FC<MessageRendererProps> = React.memo(
  ({
    content,
    role,
    terminalWidth = 80,
    showPrefix = true,
    thinking,
    isStreaming,
  }) => {
    const theme = themeManager.getTheme()
    const roleStyle = themeManager.getRoleStyle(role)

    // 全局展开/折叠开关（通过 /thinking 命令切换）
    const showAllThinking = useShowAllThinking()

    // 本地展开/折叠状态
    // 流式输出时默认展开，完成后自动折叠
    const [localExpanded, setLocalExpanded] = useState(!!isStreaming)

    // 当流式输出结束时，自动折叠思考块
    useEffect(() => {
      if (isStreaming) {
        setLocalExpanded(true)
      } else if (thinking) {
        setLocalExpanded(false)
      }
    }, [isStreaming, !!thinking])

    // 最终展开状态：全局开关 OR 本地状态（流式中）
    const isThinkingExpanded = showAllThinking || localExpanded

    // 解析 Markdown（缓存结果）
    const blocks = useMemo(() => parseMarkdown(content), [content])

    // 解析思考内容（如果有）
    const thinkingBlocks = useMemo(
      () => (thinking ? parseMarkdown(thinking) : []),
      [thinking],
    )

    // 过滤连续空行，只保留一个
    const filteredBlocks = useMemo(() => {
      return blocks.filter((block, index) => {
        if (block.type !== 'empty') return true
        // 如果前一个也是空行，跳过
        if (index > 0 && blocks[index - 1].type === 'empty') return false
        // 如果是第一个块且为空行，跳过
        if (index === 0) return false
        return true
      })
    }, [blocks])

    const filteredThinkingBlocks = useMemo(() => {
      return thinkingBlocks.filter((block) => block.type !== 'empty')
    }, [thinkingBlocks])

    // 计算思考内容的行数（用于折叠摘要）
    const thinkingLineCount = useMemo(() => {
      if (!thinking) return 0
      return thinking.split('\n').filter(l => l.trim()).length
    }, [thinking])

    // 获取思考内容的首行预览
    const thinkingPreview = useMemo(() => {
      if (!thinking) return ''
      const firstLine = thinking.split('\n').find(l => l.trim()) || ''
      const maxLen = Math.min(terminalWidth - 30, 60)
      return firstLine.length > maxLen
        ? firstLine.slice(0, maxLen) + '...'
        : firstLine
    }, [thinking, terminalWidth])

    const prefixOffset = showPrefix && roleStyle ? roleStyle.prefix.length + 1 : 0

    return (
      <Box flexDirection="column" marginBottom={1}>
        {/* 思考过程 */}
        {filteredThinkingBlocks.length > 0 && (
          <Box flexDirection="column" marginBottom={1}>
            {isThinkingExpanded ? (
              <>
                {/* 展开状态：显示完整思考内容 */}
                <Box marginBottom={0}>
                  <Text color={theme.colors.text.muted} dimColor>
                    {showPrefix && roleStyle && <Text>{roleStyle.prefix} </Text>}
                    <Text italic>thinking...</Text>
                  </Text>
                </Box>
                <Box
                  flexDirection="column"
                  marginLeft={prefixOffset}
                  borderStyle="round"
                  borderColor={theme.colors.border.light}
                  paddingX={1}
                >
                  {filteredThinkingBlocks.map((block, index) => (
                    <Box key={index}>
                      <Text color={theme.colors.text.muted} dimColor italic>
                        {block.content}
                      </Text>
                    </Box>
                  ))}
                </Box>
              </>
            ) : (
              /* 折叠状态：显示摘要行 */
              <Box marginLeft={prefixOffset}>
                <Text color={theme.colors.text.muted} dimColor>
                  <Text>▸ </Text>
                  <Text italic>thought</Text>
                  <Text> · {thinkingLineCount} lines</Text>
                  {thinkingPreview && (
                    <Text> · {thinkingPreview}</Text>
                  )}
                </Text>
              </Box>
            )}
          </Box>
        )}

        {/* 主要内容 */}
        {filteredBlocks.map((block, index) => (
          <BlockRenderer
            key={index}
            block={block}
            isFirst={index === 0 && filteredThinkingBlocks.length === 0}
            roleStyle={showPrefix ? roleStyle : undefined}
            terminalWidth={terminalWidth}
            theme={theme}
          />
        ))}

        {/* 流式输出光标指示器 */}
        {isStreaming && (
          <Box
            marginLeft={prefixOffset}
          >
            <Text color={theme.colors.primary}>▌</Text>
          </Box>
        )}
      </Box>
    )
  },
)

MessageRenderer.displayName = 'MessageRenderer'

// ===== 块渲染器 =====

interface BlockRendererProps {
  block: ParsedBlock
  isFirst: boolean
  roleStyle?: { color: string; prefix: string; bold?: boolean }
  terminalWidth: number
  theme: ReturnType<typeof themeManager.getTheme>
}

const BlockRenderer: React.FC<BlockRendererProps> = ({
  block,
  isFirst,
  roleStyle,
  terminalWidth,
  theme,
}) => {
  const prefixWidth = roleStyle?.prefix.length ?? 0
  const contentWidth = terminalWidth - prefixWidth - 2

  // 空行 - 不渲染独立的空行，让内容自然排列
  // 段落间距由组件自身的 margin 控制
  if (block.type === 'empty') {
    return null
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
            filePath={block.filePath}
            theme={theme}
          />
        ) : block.type === 'heading' ? (
          <Heading
            content={block.content}
            level={block.level || 1}
            theme={theme}
          />
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
  )
}

// ===== 子组件 =====

interface ThemedProps {
  theme: ReturnType<typeof themeManager.getTheme>
}

/** 代码块 - 使用 CodeHighlighter 进行语法高亮 */
const CodeBlock: React.FC<
  { content: string; language?: string; filePath?: string } & ThemedProps
> = ({ content, language, filePath }) => {
  // 使用 CodeHighlighter 组件进行语法高亮
  return (
    <CodeHighlighter
      content={content}
      language={language}
      filePath={filePath}
      showLineNumbers={true}
    />
  )
}

/** 标题 - 不显示 #，用颜色和样式区分，支持内联格式 */
const Heading: React.FC<{ content: string; level: number } & ThemedProps> = ({
  content,
  level,
  theme,
}) => {
  const color =
    level === 1
      ? theme.colors.primary
      : level === 2
        ? theme.colors.secondary
        : level === 3
          ? theme.colors.accent
          : theme.colors.text.primary

  // H1/H2 有上下边距，更醒目
  const marginY = level <= 2 ? 1 : 0
  // H1 加下划线
  const underline = level === 1

  // 检查是否有内联格式
  const hasInlineFormat = /\*\*|`|~~|\[.*\]\(/.test(content)

  return (
    <Box flexDirection="column" marginY={marginY}>
      {hasInlineFormat ? (
        <Text color={color} bold underline={underline}>
          <HeadingInlineText
            content={content}
            theme={theme}
            baseColor={color}
          />
        </Text>
      ) : (
        <Text color={color} bold underline={underline}>
          {content}
        </Text>
      )}
    </Box>
  )
}

/** 列表项 - 支持内联格式 */
const ListItem: React.FC<
  {
    content: string
    listType?: 'ul' | 'ol'
    marker?: string
    indent?: number
  } & ThemedProps
> = ({ content, listType, marker, indent = 0, theme }) => {
  const indentStr = '  '.repeat(Math.floor(indent / 2))
  const bulletColor =
    listType === 'ol' ? theme.colors.info : theme.colors.success

  return (
    <Box>
      <Text>
        {indentStr}
        <Text color={bulletColor}>{marker || '•'}</Text>{' '}
      </Text>
      <Text wrap="wrap">
        <InlineText content={content} theme={theme} />
      </Text>
    </Box>
  )
}

/** 水平线 */
const HorizontalRule: React.FC<{ width: number } & ThemedProps> = ({
  width,
  theme,
}) => (
  <Box marginY={1}>
    <Text color={theme.colors.border.light}>
      {'─'.repeat(Math.max(width, 10))}
    </Text>
  </Box>
)

/** 去除 Markdown 格式，用于计算显示宽度 */
const stripMarkdownForWidth = (text: string): string => {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1') // **bold**
    .replace(/\*(.+?)\*/g, '$1') // *italic*
    .replace(/`([^`]+)`/g, '$1') // `code`
    .replace(/~~(.+?)~~/g, '$1') // ~~strikethrough~~
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [link](url)
}

/** 表格 */
const TableRenderer: React.FC<
  {
    headers: string[]
    rows: string[][]
    alignments: ('left' | 'center' | 'right')[]
  } & ThemedProps
> = ({ headers, rows, alignments, theme }) => {
  // 计算列宽（使用 stringWidth 处理中文等宽字符）
  const columnWidths = headers.map((header, index) => {
    const headerWidth = stringWidth(stripMarkdownForWidth(header))
    const maxRowWidth = Math.max(
      0,
      ...rows.map((row) =>
        stringWidth(stripMarkdownForWidth(row[index] || '')),
      ),
    )
    return Math.max(headerWidth, maxRowWidth) + 2
  })

  // 渲染单元格（考虑实际显示宽度）
  const renderCell = (
    content: string,
    width: number,
    align: 'left' | 'center' | 'right',
  ) => {
    const actualWidth = stringWidth(stripMarkdownForWidth(content))
    const padding = Math.max(0, width - actualWidth)
    if (align === 'center') {
      const left = Math.floor(padding / 2)
      const right = padding - left
      return ' '.repeat(left) + content + ' '.repeat(right)
    }
    if (align === 'right') {
      return ' '.repeat(padding) + content
    }
    return content + ' '.repeat(padding)
  }

  return (
    <Box flexDirection="column" marginY={1}>
      {/* 表头 */}
      <Box>
        <Text color={theme.colors.border.light}>│</Text>
        {headers.map((header, index) => (
          <React.Fragment key={index}>
            <Text bold color={theme.colors.primary}>
              {renderCell(
                header,
                columnWidths[index],
                alignments[index] || 'left',
              )}
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
            const cellContent = row[colIndex] || ''
            const paddedContent = renderCell(
              cellContent,
              columnWidths[colIndex],
              alignments[colIndex] || 'left',
            )
            // 检查是否有内联格式
            const hasInlineFormat = /\*\*|`|~~|\[.*\]\(/.test(cellContent)
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
            )
          })}
        </Box>
      ))}
    </Box>
  )
}

/** 引用块 */
const Blockquote: React.FC<{ content: string } & ThemedProps> = ({
  content,
  theme,
}) => (
  <Box>
    <Text color={theme.colors.border.light}>│ </Text>
    <Text color={theme.colors.text.muted} italic wrap="wrap">
      {content}
    </Text>
  </Box>
)

/** Tool call 行检测 - 以2+空格开头且含 ✓ 或 ✗ 标记 */
const TOOLCALL_RE = /^\s{2,}(\S+)\s*(.*?)\s*(✓|✗.*)$/

/** Tool call 输出行 - 紧凑 dim 风格，与正文区分 */
const ToolCallLine: React.FC<{ content: string } & ThemedProps> = ({
  content,
  theme,
}) => {
  const m = content.match(TOOLCALL_RE)
  if (!m) return <Text dimColor>{content}</Text>

  const [, name, args, result] = m
  const isErr = result.startsWith('✗')

  return (
    <Box>
      <Text dimColor color={theme.colors.text.muted}>{'  '}</Text>
      <Text dimColor color={theme.colors.text.secondary}>{name}</Text>
      {args ? <Text dimColor color={theme.colors.text.muted}>{' '}{args}</Text> : null}
      <Text dimColor color={isErr ? theme.colors.error : theme.colors.success}>{' '}{result}</Text>
    </Box>
  )
}

/** 普通文本 - 支持内联格式，tool call 行走专用渲染 */
const TextBlock: React.FC<{ content: string } & ThemedProps> = ({
  content,
  theme,
}) => {
  // Tool call 行：以空格缩进开头 + ✓/✗ 标记
  if (TOOLCALL_RE.test(content)) {
    return <ToolCallLine content={content} theme={theme} />
  }

  return (
    <Text wrap="wrap">
      <InlineText content={content} theme={theme} />
    </Text>
  )
}

/** 标题内联格式渲染 - 去除格式标记但保持文本（因为标题本身已经是粗体） */
const HeadingInlineText: React.FC<
  { content: string; baseColor: string } & ThemedProps
> = ({ content, theme, baseColor }) => {
  const segments = parseInline(content)

  return (
    <>
      {segments.map((seg, i) => {
        switch (seg.type) {
          case 'code':
            return (
              <Text key={i} color={theme.colors.accent}>
                {seg.text}
              </Text>
            )
          case 'strikethrough':
            return (
              <Text key={i} strikethrough color={theme.colors.text.muted}>
                {seg.text}
              </Text>
            )
          case 'link':
            return (
              <Text key={i} color={theme.colors.info} underline>
                {seg.text}
              </Text>
            )
          // bold/italic/text 都直接渲染（标题本身已经是粗体）
          default:
            return <Text key={i}>{seg.text}</Text>
        }
      })}
    </>
  )
}

/** 内联格式渲染 */
const InlineText: React.FC<{ content: string } & ThemedProps> = ({
  content,
  theme,
}) => {
  // 解析内联格式
  const segments = parseInline(content)

  return (
    <>
      {segments.map((seg, i) => {
        switch (seg.type) {
          case 'bold':
            return (
              <Text key={i} bold color={theme.colors.text.primary}>
                {seg.text}
              </Text>
            )
          case 'italic':
            return (
              <Text key={i} italic color={theme.colors.text.primary}>
                {seg.text}
              </Text>
            )
          case 'code':
            return (
              <Text key={i} color={theme.colors.accent}>
                {seg.text}
              </Text>
            )
          case 'strikethrough':
            return (
              <Text key={i} strikethrough color={theme.colors.text.muted}>
                {seg.text}
              </Text>
            )
          case 'link':
            return (
              <Text key={i} color={theme.colors.info} underline>
                {seg.text}
              </Text>
            )
          default:
            return (
              <Text key={i} color={theme.colors.text.primary}>
                {seg.text}
              </Text>
            )
        }
      })}
    </>
  )
}

/** 简单的内联格式解析器 */
function parseInline(text: string): Array<{ type: string; text: string }> {
  const segments: Array<{ type: string; text: string }> = []

  // 使用更精确的分步解析，避免正则冲突
  // 优先级：代码 > 粗体 > 斜体 > 删除线 > 链接

  // 定义 token 类型和正则
  const tokenPatterns: Array<{ type: string; regex: RegExp; group: number }> = [
    { type: 'code', regex: /`([^`]+)`/g, group: 1 },
    { type: 'bold', regex: /\*\*([^*]+)\*\*/g, group: 1 },
    { type: 'strikethrough', regex: /~~([^~]+)~~/g, group: 1 },
    { type: 'italic', regex: /(?<!\*)\*([^*]+)\*(?!\*)/g, group: 1 },
    { type: 'link', regex: /\[([^\]]+)\]\([^)]+\)/g, group: 1 },
  ]

  // 收集所有匹配
  interface Token {
    type: string
    text: string
    start: number
    end: number
  }

  const tokens: Token[] = []

  for (const { type, regex, group } of tokenPatterns) {
    let match
    // 重置正则状态
    regex.lastIndex = 0
    while ((match = regex.exec(text)) !== null) {
      // 检查是否与已有 token 重叠
      const start = match.index
      const end = match.index + match[0].length
      const overlaps = tokens.some(
        (t) =>
          (start >= t.start && start < t.end) ||
          (end > t.start && end <= t.end),
      )

      if (!overlaps) {
        tokens.push({
          type,
          text: match[group],
          start,
          end,
        })
      }
    }
  }

  // 按位置排序
  tokens.sort((a, b) => a.start - b.start)

  // 构建 segments
  let lastEnd = 0
  for (const token of tokens) {
    // 添加 token 前的普通文本
    if (token.start > lastEnd) {
      segments.push({ type: 'text', text: text.slice(lastEnd, token.start) })
    }
    segments.push({ type: token.type, text: token.text })
    lastEnd = token.end
  }

  // 添加剩余文本
  if (lastEnd < text.length) {
    segments.push({ type: 'text', text: text.slice(lastEnd) })
  }

  // 如果没有找到任何格式，返回原文本
  if (segments.length === 0) {
    return [{ type: 'text', text }]
  }

  return segments
}

export default MessageRenderer
