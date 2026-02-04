/**
 * Markdown 解析器
 * 
 * 将 Markdown 文本解析为结构化的块
 */

import type { ParsedBlock, TableData, InlineSegment } from './types.js';

/**
 * Markdown 模式匹配
 */
const MARKDOWN_PATTERNS = {
  codeBlock: /^```(\w+)?\s*$/,
  heading: /^(#{1,6})\s+(.+)/,
  ulItem: /^(\s*)([-*+])\s+(.+)/,
  olItem: /^(\s*)(\d+)\.\s+(.+)/,
  hr: /^[-*_]{3,}\s*$/,
  table: /^\|(.+)\|$/,
  tableSeparator: /^\|[\s]*:?-+:?[\s]*(\|[\s]*:?-+:?[\s]*)+\|?$/,
  blockquote: /^>\s*(.*)$/,
  empty: /^\s*$/,
} as const;

/**
 * 内联格式模式
 */
const INLINE_PATTERNS = {
  bold: /\*\*(.+?)\*\*/g,
  italic: /\*(.+?)\*/g,
  code: /`([^`]+)`/g,
  strikethrough: /~~(.+?)~~/g,
  link: /\[([^\]]+)\]\(([^)]+)\)/g,
} as const;

/**
 * 解析 Markdown 为块数组
 */
export function parseMarkdown(content: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  const lines = content.split(/\r?\n/);

  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let codeBlockLang: string | null = null;

  let inTable = false;
  let tableHeaders: string[] = [];
  let tableRows: string[][] = [];
  let tableAlignments: ('left' | 'center' | 'right')[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ===== 代码块处理 =====
    if (inCodeBlock) {
      const match = line.match(MARKDOWN_PATTERNS.codeBlock);
      if (match && !match[1]) {
        // 代码块结束
        blocks.push({
          type: 'code',
          content: codeBlockContent.join('\n'),
          language: codeBlockLang || undefined,
        });
        inCodeBlock = false;
        codeBlockContent = [];
        codeBlockLang = null;
      } else {
        codeBlockContent.push(line);
      }
      continue;
    }

    // 检查代码块开始
    const codeMatch = line.match(MARKDOWN_PATTERNS.codeBlock);
    if (codeMatch) {
      // 先完成表格
      if (inTable) {
        blocks.push(createTableBlock(tableHeaders, tableRows, tableAlignments));
        inTable = false;
        tableHeaders = [];
        tableRows = [];
        tableAlignments = [];
      }
      
      inCodeBlock = true;
      codeBlockLang = codeMatch[1] || null;
      continue;
    }

    // ===== 表格处理 =====
    if (MARKDOWN_PATTERNS.table.test(line)) {
      const cells = parseTableRow(line);
      
      if (!inTable) {
        // 可能是表头
        tableHeaders = cells;
        inTable = true;
        continue;
      }
      
      // 检查是否是分隔行
      if (MARKDOWN_PATTERNS.tableSeparator.test(line)) {
        tableAlignments = parseTableAlignments(line);
        continue;
      }
      
      // 数据行
      tableRows.push(cells);
      continue;
    } else if (inTable) {
      // 表格结束
      blocks.push(createTableBlock(tableHeaders, tableRows, tableAlignments));
      inTable = false;
      tableHeaders = [];
      tableRows = [];
      tableAlignments = [];
    }

    // ===== 空行 =====
    if (MARKDOWN_PATTERNS.empty.test(line)) {
      blocks.push({ type: 'empty', content: '' });
      continue;
    }

    // ===== 水平线 =====
    if (MARKDOWN_PATTERNS.hr.test(line)) {
      blocks.push({ type: 'hr', content: '' });
      continue;
    }

    // ===== 标题 =====
    const headingMatch = line.match(MARKDOWN_PATTERNS.heading);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        content: headingMatch[2],
        level: headingMatch[1].length,
      });
      continue;
    }

    // ===== 无序列表 =====
    const ulMatch = line.match(MARKDOWN_PATTERNS.ulItem);
    if (ulMatch) {
      blocks.push({
        type: 'list',
        content: ulMatch[3],
        listType: 'ul',
        marker: ulMatch[2],
        indent: ulMatch[1].length,
      });
      continue;
    }

    // ===== 有序列表 =====
    const olMatch = line.match(MARKDOWN_PATTERNS.olItem);
    if (olMatch) {
      blocks.push({
        type: 'list',
        content: olMatch[3],
        listType: 'ol',
        marker: olMatch[2] + '.',
        indent: olMatch[1].length,
      });
      continue;
    }

    // ===== 引用 =====
    const blockquoteMatch = line.match(MARKDOWN_PATTERNS.blockquote);
    if (blockquoteMatch) {
      blocks.push({
        type: 'blockquote',
        content: blockquoteMatch[1],
      });
      continue;
    }

    // ===== 普通文本 =====
    blocks.push({ type: 'text', content: line });
  }

  // 处理未结束的代码块
  if (inCodeBlock && codeBlockContent.length > 0) {
    blocks.push({
      type: 'code',
      content: codeBlockContent.join('\n'),
      language: codeBlockLang || undefined,
    });
  }

  // 处理未结束的表格
  if (inTable && tableHeaders.length > 0) {
    blocks.push(createTableBlock(tableHeaders, tableRows, tableAlignments));
  }

  return blocks;
}

/**
 * 解析表格行
 */
function parseTableRow(line: string): string[] {
  return line
    .slice(1, -1) // 去掉首尾的 |
    .split('|')
    .map(cell => cell.trim());
}

/**
 * 解析表格对齐方式
 */
function parseTableAlignments(line: string): ('left' | 'center' | 'right')[] {
  return line
    .slice(1, -1)
    .split('|')
    .map(cell => {
      const trimmed = cell.trim();
      if (trimmed.startsWith(':') && trimmed.endsWith(':')) {
        return 'center';
      }
      if (trimmed.endsWith(':')) {
        return 'right';
      }
      return 'left';
    });
}

/**
 * 创建表格块
 */
function createTableBlock(
  headers: string[],
  rows: string[][],
  alignments: ('left' | 'center' | 'right')[]
): ParsedBlock {
  return {
    type: 'table',
    content: '',
    tableData: {
      headers,
      rows,
      alignments: alignments.length > 0 ? alignments : headers.map(() => 'left'),
    },
  };
}

/**
 * 解析内联格式
 */
export function parseInlineFormats(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  let remaining = text;
  let lastIndex = 0;

  // 简化的内联解析（实际使用时可以更复杂）
  // 按顺序处理：链接 > 粗体 > 斜体 > 代码 > 删除线

  // 处理链接
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  
  while ((match = linkRegex.exec(remaining)) !== null) {
    // 添加链接前的文本
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        content: remaining.slice(lastIndex, match.index),
      });
    }
    
    segments.push({
      type: 'link',
      content: match[1],
      url: match[2],
    });
    
    lastIndex = match.index + match[0].length;
  }

  // 添加剩余文本
  if (lastIndex < remaining.length) {
    segments.push({
      type: 'text',
      content: remaining.slice(lastIndex),
    });
  }

  // 如果没有找到任何特殊格式，返回原文本
  if (segments.length === 0) {
    return [{ type: 'text', content: text }];
  }

  return segments;
}

/**
 * 移除 Markdown 标记，获取纯文本
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')  // 粗体
    .replace(/\*(.+?)\*/g, '$1')      // 斜体
    .replace(/~~(.+?)~~/g, '$1')      // 删除线
    .replace(/`([^`]+)`/g, '$1')      // 代码
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // 链接
}
