/**
 * 主题管理器
 * 
 * 管理主题的注册、切换和获取
 */

import type { Theme, ThemePreset, RoleStyle } from './types.js';
import { defaultTheme } from './defaultTheme.js';
import { darkTheme } from './darkTheme.js';

/**
 * 预设主题列表
 */
const presetThemes: ThemePreset[] = [
  {
    id: 'default',
    name: 'Default',
    description: 'Light theme with blue accents',
    theme: defaultTheme,
  },
  {
    id: 'dark',
    name: 'Dark',
    description: 'Dark theme for low-light environments',
    theme: darkTheme,
  },
  {
    id: 'ocean',
    name: 'Ocean',
    description: 'Deep blue ocean theme',
    theme: {
      ...darkTheme,
      name: 'ocean',
      colors: {
        ...darkTheme.colors,
        primary: '#0ea5e9',      // sky-500
        secondary: '#06b6d4',    // cyan-500
        accent: '#14b8a6',       // teal-500
        background: {
          primary: '#0c4a6e',    // sky-900
          secondary: '#075985',  // sky-800
          dark: '#082f49',       // sky-950
        },
      },
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Natural green forest theme',
    theme: {
      ...darkTheme,
      name: 'forest',
      colors: {
        ...darkTheme.colors,
        primary: '#22c55e',      // green-500
        secondary: '#16a34a',    // green-600
        accent: '#84cc16',       // lime-500
        background: {
          primary: '#14532d',    // green-900
          secondary: '#166534',  // green-800
          dark: '#052e16',       // green-950
        },
      },
    },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    description: 'Warm sunset colors',
    theme: {
      ...darkTheme,
      name: 'sunset',
      colors: {
        ...darkTheme.colors,
        primary: '#f97316',      // orange-500
        secondary: '#ea580c',    // orange-600
        accent: '#eab308',       // yellow-500
        background: {
          primary: '#7c2d12',    // orange-900
          secondary: '#9a3412',  // orange-800
          dark: '#431407',       // orange-950
        },
      },
    },
  },
];

/**
 * 主题管理器类
 */
export class ThemeManager {
  private currentTheme: Theme = defaultTheme;
  private themes: Map<string, Theme> = new Map();

  constructor() {
    // 注册预设主题
    for (const preset of presetThemes) {
      this.themes.set(preset.id, preset.theme);
    }
  }

  /**
   * 设置当前主题
   */
  setTheme(themeName: string): void {
    const theme = this.themes.get(themeName);
    if (theme) {
      this.currentTheme = theme;
    } else {
      throw new Error(`Theme '${themeName}' not found`);
    }
  }

  /**
   * 获取当前主题
   */
  getTheme(): Theme {
    return this.currentTheme;
  }

  /**
   * 获取当前主题名称
   */
  getCurrentThemeName(): string {
    return this.currentTheme.name;
  }

  /**
   * 检查主题是否存在
   */
  hasTheme(themeName: string): boolean {
    return this.themes.has(themeName);
  }

  /**
   * 获取所有可用主题名称
   */
  getAvailableThemes(): string[] {
    return Array.from(this.themes.keys());
  }

  /**
   * 获取所有主题预设（含详细信息）
   */
  getThemePresets(): ThemePreset[] {
    return presetThemes;
  }

  /**
   * 注册自定义主题
   */
  registerTheme(id: string, theme: Theme): void {
    this.themes.set(id, theme);
  }

  /**
   * 获取角色样式（极简风格）
   */
  getRoleStyle(role: 'user' | 'assistant' | 'system' | 'tool'): RoleStyle {
    const colors = this.currentTheme.colors;
    
    switch (role) {
      case 'user':
        return {
          color: colors.success,
          prefix: '› ',
          bold: false,
        };
      case 'assistant':
        return {
          color: colors.primary,
          prefix: '◆ ',
          bold: false,
        };
      case 'system':
        return {
          color: colors.warning,
          prefix: '⚡',
          bold: true,
        };
      case 'tool':
        return {
          color: colors.info,
          prefix: '→ ',
          bold: false,
        };
      default:
        return {
          color: colors.text.primary,
          prefix: '',
        };
    }
  }
}

// 导出单例
export const themeManager = new ThemeManager();
