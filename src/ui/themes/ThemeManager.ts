/**
 * 主题管理器
 * 
 * 管理主题的注册、切换和获取
 * 支持自动检测终端颜色模式
 */

import { execSync } from 'node:child_process';
import type { Theme, ThemePreset, RoleStyle, ColorMode } from './types.js';
import { defaultTheme } from './defaultTheme.js';
import { darkTheme } from './darkTheme.js';
import { lightTheme } from './lightTheme.js';
import { configManager } from '../../config/ConfigManager.js';

/**
 * 检测终端/系统的颜色模式
 * 
 * 检测顺序：
 * 1. macOS 系统级暗色模式
 * 2. COLORFGBG 环境变量（一些终端会设置）
 * 3. 默认返回 unknown
 */
function detectColorMode(): ColorMode {
  // 1. macOS 系统级检测
  if (process.platform === 'darwin') {
    try {
      const result = execSync('defaults read -g AppleInterfaceStyle 2>/dev/null', {
        encoding: 'utf-8',
        timeout: 1000,
      }).trim();
      if (result === 'Dark') {
        return 'dark';
      }
    } catch {
      // 如果命令失败或返回空，说明是亮色模式
      return 'light';
    }
  }

  // 2. 检查 COLORFGBG 环境变量
  // 格式: "foreground;background" 如 "15;0" (白字黑底) 或 "0;15" (黑字白底)
  const colorFgBg = process.env.COLORFGBG;
  if (colorFgBg) {
    const parts = colorFgBg.split(';');
    if (parts.length >= 2) {
      const bg = parseInt(parts[parts.length - 1], 10);
      // 背景色 0-7 通常是暗色，8-15 通常是亮色
      // 0=黑, 7=白(暗), 8=亮黑(灰), 15=亮白
      if (!isNaN(bg)) {
        if (bg === 0 || bg <= 6) {
          return 'dark';
        } else if (bg === 7 || bg >= 8) {
          return 'light';
        }
      }
    }
  }

  // 3. 检查常见终端的默认模式
  const termProgram = process.env.TERM_PROGRAM?.toLowerCase();
  if (termProgram) {
    // VS Code 集成终端通常跟随编辑器主题
    if (termProgram === 'vscode') {
      // VS Code 的 VSCODE_THEME_KIND 变量
      const themeKind = process.env.VSCODE_THEME_KIND;
      if (themeKind === 'vscode-dark' || themeKind === 'vscode-high-contrast') {
        return 'dark';
      } else if (themeKind === 'vscode-light' || themeKind === 'vscode-high-contrast-light') {
        return 'light';
      }
    }
  }

  return 'unknown';
}

/**
 * 预设主题列表
 */
const presetThemes: ThemePreset[] = [
  {
    id: 'default',
    name: 'Default',
    description: 'Balanced theme (works on most terminals)',
    theme: defaultTheme,
  },
  {
    id: 'light',
    name: 'Light',
    description: 'Optimized for light/white terminal backgrounds',
    theme: lightTheme,
  },
  {
    id: 'dark',
    name: 'Dark',
    description: 'Dark theme for dark terminal backgrounds',
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
  private initialized: boolean = false;

  constructor() {
    // 注册预设主题
    for (const preset of presetThemes) {
      this.themes.set(preset.id, preset.theme);
    }
  }

  /**
   * 从配置中初始化主题
   * 
   * 优先级：
   * 1. 用户保存的主题（用户配置文件中）
   * 2. 自动检测终端颜色模式，选择合适的主题
   * 3. 使用默认主题
   */
  initializeFromConfig(): void {
    if (this.initialized) return;
    
    try {
      const savedTheme = configManager.getTheme();
      
      // 如果用户之前保存过主题，使用保存的主题
      if (savedTheme && this.themes.has(savedTheme)) {
        this.currentTheme = this.themes.get(savedTheme)!;
        this.initialized = true;
        return;
      }
      
      // 没有用户保存的主题，自动检测终端颜色模式
      const colorMode = detectColorMode();
      
      if (colorMode === 'dark') {
        this.currentTheme = this.themes.get('dark')!;
      } else if (colorMode === 'light') {
        this.currentTheme = this.themes.get('light')!;
      }
      // colorMode === 'unknown' 时保持默认主题
      
      this.initialized = true;
    } catch {
      // 配置读取失败时使用默认主题
      this.initialized = true;
    }
  }
  
  /**
   * 获取检测到的终端颜色模式（供调试使用）
   */
  getDetectedColorMode(): ColorMode {
    return detectColorMode();
  }

  /**
   * 设置当前主题（同时保存到配置）
   */
  setTheme(themeName: string, persist: boolean = true): void {
    const theme = this.themes.get(themeName);
    if (theme) {
      this.currentTheme = theme;
      
      // 同步保存到配置文件，确保立即生效
      if (persist) {
        try {
          configManager.saveTheme(themeName);
        } catch {
          // 保存失败时静默忽略
        }
      }
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
