/**
 * 主题系统类型定义
 */

/**
 * 终端颜色模式
 */
export type ColorMode = 'dark' | 'light' | 'unknown';

/**
 * 语法高亮颜色
 */
export interface SyntaxColors {
  comment: string;
  string: string;
  number: string;
  keyword: string;
  function: string;
  variable: string;
  operator: string;
  type: string;
  tag: string;
  attr: string;
  default: string;
}

/**
 * 基础颜色配置
 */
export interface BaseColors {
  primary: string;
  secondary: string;
  accent: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  text: {
    primary: string;
    secondary: string;
    muted: string;
    light: string;
  };
  background: {
    primary: string;
    secondary: string;
    dark: string;
  };
  border: {
    light: string;
    dark: string;
  };
  syntax: SyntaxColors;
}

/**
 * 间距配置
 */
export interface Spacing {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
}

/**
 * 主题配置
 */
export interface Theme {
  name: string;
  colors: BaseColors;
  spacing: Spacing;
}

/**
 * 角色样式配置
 */
export interface RoleStyle {
  color: string;
  prefix: string;
  bold?: boolean;
}

/**
 * 主题预设项
 */
export interface ThemePreset {
  id: string;
  name: string;
  description?: string;
  theme: Theme;
}
