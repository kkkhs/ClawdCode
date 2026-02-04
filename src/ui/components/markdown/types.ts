/**
 * Markdown 解析器类型定义
 */

/**
 * 解析块类型
 */
export type BlockType = 
  | 'text'
  | 'code'
  | 'heading'
  | 'table'
  | 'list'
  | 'hr'
  | 'empty'
  | 'blockquote';

/**
 * 列表类型
 */
export type ListType = 'ul' | 'ol';

/**
 * 表格数据
 */
export interface TableData {
  headers: string[];
  rows: string[][];
  alignments: ('left' | 'center' | 'right')[];
}

/**
 * 解析后的块
 */
export interface ParsedBlock {
  type: BlockType;
  content: string;
  language?: string;
  level?: number;
  listType?: ListType;
  marker?: string;
  tableData?: TableData;
  indent?: number;
}

/**
 * 内联格式类型
 */
export type InlineFormatType = 
  | 'bold'
  | 'italic'
  | 'code'
  | 'link'
  | 'strikethrough'
  | 'text';

/**
 * 内联格式片段
 */
export interface InlineSegment {
  type: InlineFormatType;
  content: string;
  url?: string;
}
