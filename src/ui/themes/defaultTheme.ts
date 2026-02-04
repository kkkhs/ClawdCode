/**
 * 默认主题（浅色）
 */

import type { Theme, BaseColors, Spacing } from './types.js';

const defaultColors: BaseColors = {
  primary: '#3b82f6',      // blue-500
  secondary: '#6366f1',    // indigo-500
  accent: '#8b5cf6',       // violet-500
  success: '#22c55e',      // green-500
  warning: '#f59e0b',      // amber-500
  error: '#ef4444',        // red-500
  info: '#06b6d4',         // cyan-500
  text: {
    primary: '#1f2937',    // gray-800
    secondary: '#4b5563',  // gray-600
    muted: '#9ca3af',      // gray-400
    light: '#f9fafb',      // gray-50
  },
  background: {
    primary: '#ffffff',
    secondary: '#f3f4f6',  // gray-100
    dark: '#1f2937',       // gray-800
  },
  border: {
    light: '#e5e7eb',      // gray-200
    dark: '#374151',       // gray-700
  },
  syntax: {
    comment: '#6b7280',    // gray-500
    string: '#059669',     // emerald-600
    number: '#db2777',     // pink-600
    keyword: '#7c3aed',    // violet-600
    function: '#2563eb',   // blue-600
    variable: '#1f2937',   // gray-800
    operator: '#d97706',   // amber-600
    type: '#0891b2',       // cyan-600
    tag: '#dc2626',        // red-600
    attr: '#ca8a04',       // yellow-600
    default: '#1f2937',    // gray-800
  },
};

const defaultSpacing: Spacing = {
  xs: 1,
  sm: 2,
  md: 4,
  lg: 8,
  xl: 16,
};

export const defaultTheme: Theme = {
  name: 'default',
  colors: defaultColors,
  spacing: defaultSpacing,
};
