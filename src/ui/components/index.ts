/**
 * UI 组件导出
 * 
 * 目录结构：
 * - common/    通用组件 (ErrorBoundary, LoadingIndicator)
 * - input/     输入组件 (CustomTextInput, InputArea)
 * - markdown/  Markdown 渲染 (MessageRenderer, CodeHighlighter, parser)
 * - dialog/    对话框组件 (ConfirmationPrompt, UpdatePrompt)
 * - layout/    布局组件 (ChatStatusBar, MessageArea)
 */

// 通用组件
export * from './common/index.js';

// 输入组件
export * from './input/index.js';

// Markdown 组件
export * from './markdown/index.js';

// 对话框组件
export * from './dialog/index.js';

// 布局组件
export * from './layout/index.js';

// 主界面
export { ClawdInterface } from './ClawdInterface.js';
