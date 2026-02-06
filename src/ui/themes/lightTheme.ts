/**
 * 亮色主题 - 专为亮色/白色终端优化
 * 使用更深的颜色确保在白色背景上可读
 */

import type { Theme } from './types.js';
import { defaultTheme } from './defaultTheme.js';

export const lightTheme: Theme = {
  ...defaultTheme,
  name: 'light',
  colors: {
    ...defaultTheme.colors,
    // 使用更深的颜色确保对比度
    primary: '#2563eb',      // blue-600
    secondary: '#4f46e5',    // indigo-600
    accent: '#7c3aed',       // violet-600
    success: '#16a34a',      // green-600
    warning: '#d97706',      // amber-600
    error: '#dc2626',        // red-600
    info: '#0891b2',         // cyan-600
    text: {
      primary: '#111827',    // gray-900 - 最深的文字
      secondary: '#374151',  // gray-700
      muted: '#6b7280',      // gray-500
      light: '#f9fafb',      // gray-50
    },
    background: {
      primary: '#ffffff',
      secondary: '#f9fafb',  // gray-50
      dark: '#111827',       // gray-900
    },
    border: {
      light: '#d1d5db',      // gray-300
      dark: '#6b7280',       // gray-500
    },
    syntax: {
      comment: '#6b7280',    // gray-500
      string: '#047857',     // emerald-700
      number: '#be185d',     // pink-700
      keyword: '#6d28d9',    // violet-700
      function: '#1d4ed8',   // blue-700
      variable: '#111827',   // gray-900
      operator: '#b45309',   // amber-700
      type: '#0e7490',       // cyan-700
      tag: '#b91c1c',        // red-700
      attr: '#a16207',       // yellow-700
      default: '#111827',    // gray-900
    },
  },
};
