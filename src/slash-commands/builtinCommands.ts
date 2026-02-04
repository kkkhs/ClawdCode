/**
 * 内置 Slash 命令
 */

import type { SlashCommand, SlashCommandResult, SlashCommandContext } from './types.js';
import { sessionActions, getState } from '../store/index.js';

/**
 * /help - 显示所有可用命令
 */
export const helpCommand: SlashCommand = {
  name: 'help',
  aliases: ['?', 'h'],
  description: '显示所有可用命令',
  category: 'general',
  usage: '/help [command]',

  async handler(args: string, _context: SlashCommandContext): Promise<SlashCommandResult> {
    // 延迟导入避免循环依赖
    const { getRegisteredCommands, getCommand } = await import('./index.js');
    
    const trimmedArgs = args.trim();
    
    // 查看特定命令的帮助
    if (trimmedArgs) {
      const cmd = getCommand(trimmedArgs);
      if (cmd) {
        let content = `## /${cmd.name}\n\n`;
        content += `${cmd.fullDescription || cmd.description}\n\n`;
        
        if (cmd.usage) {
          content += `**用法：** \`${cmd.usage}\`\n\n`;
        }
        
        if (cmd.aliases && cmd.aliases.length > 0) {
          content += `**别名：** ${cmd.aliases.map(a => `\`/${a}\``).join(', ')}\n\n`;
        }
        
        if (cmd.examples && cmd.examples.length > 0) {
          content += `**示例：**\n`;
          for (const example of cmd.examples) {
            content += `- \`${example}\`\n`;
          }
        }
        
        return { success: true, type: 'info', content };
      }
      
      return {
        success: false,
        type: 'error',
        error: `未知命令: /${trimmedArgs}`,
      };
    }
    
    // 显示所有命令
    const commands = getRegisteredCommands();
    
    // 按分类分组
    const grouped: Record<string, SlashCommand[]> = {};
    for (const cmd of commands) {
      const category = cmd.category || 'general';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(cmd);
    }
    
    // 分类名称映射
    const categoryNames: Record<string, string> = {
      general: '📋 通用',
      session: '💬 会话',
      config: '⚙️ 配置',
      git: '🔀 Git',
      mcp: '🔌 MCP',
      custom: '📝 自定义',
    };
    
    let content = '## 📚 可用命令\n\n';
    
    for (const [category, cmds] of Object.entries(grouped)) {
      const categoryName = categoryNames[category] || category;
      content += `### ${categoryName}\n\n`;
      
      for (const cmd of cmds) {
        const aliases = cmd.aliases?.length 
          ? ` (${cmd.aliases.map(a => `/${a}`).join(', ')})` 
          : '';
        content += `- \`/${cmd.name}\`${aliases} - ${cmd.description}\n`;
      }
      content += '\n';
    }
    
    content += '---\n';
    content += '💡 **提示：** 使用 `/help <命令>` 查看命令详情\n';
    
    return { success: true, type: 'info', content };
  },
};

/**
 * /clear - 清除对话历史
 */
export const clearCommand: SlashCommand = {
  name: 'clear',
  aliases: ['cls'],
  description: '清除对话历史和屏幕',
  category: 'session',
  usage: '/clear',

  async handler(): Promise<SlashCommandResult> {
    sessionActions().clearMessages();
    
    return {
      success: true,
      type: 'success',
      message: '✓ 已清除对话历史',
    };
  },
};

/**
 * /compact - 手动压缩上下文
 */
export const compactCommand: SlashCommand = {
  name: 'compact',
  description: '手动压缩上下文',
  category: 'session',
  usage: '/compact',

  async handler(): Promise<SlashCommandResult> {
    // TODO: 实现上下文压缩
    // 需要获取当前 ContextManager 实例并调用 compactIfNeeded
    return {
      success: true,
      type: 'info',
      message: '⚠️ 上下文压缩功能暂未完全集成，将在下次对话时自动检查',
    };
  },
};

/**
 * /version - 显示版本信息
 */
export const versionCommand: SlashCommand = {
  name: 'version',
  aliases: ['v'],
  description: '显示版本信息',
  category: 'general',
  usage: '/version',

  async handler(): Promise<SlashCommandResult> {
    // 从 package.json 获取版本
    let version = 'unknown';
    try {
      const fs = await import('fs');
      const path = await import('path');
      const packagePath = path.join(process.cwd(), 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
      version = packageJson.version || 'unknown';
    } catch {
      // 忽略错误
    }

    const content = `## ClawdCode

**版本：** v${version}

**运行时：** ${process.version} (${process.platform} ${process.arch})

---
🔗 [GitHub](https://github.com/anthropics/claude-code) | 📖 [文档](https://docs.anthropic.com)
`;

    return {
      success: true,
      type: 'info',
      content,
    };
  },
};

/**
 * /model - 显示当前模型信息
 */
export const modelCommand: SlashCommand = {
  name: 'model',
  aliases: ['m'],
  description: '显示或切换模型',
  category: 'config',
  usage: '/model [model-name]',
  examples: ['/model', '/model claude-3-5-sonnet'],

  async handler(args: string): Promise<SlashCommandResult> {
    const state = getState();
    const config = state.config.config;
    const currentModel = config?.currentModelId || 'unknown';
    
    const trimmedArgs = args.trim();
    
    if (trimmedArgs) {
      // TODO: 实现模型切换
      return {
        success: false,
        type: 'info',
        content: `⚠️ 模型切换功能暂未实现\n\n当前模型: \`${currentModel}\``,
      };
    }
    
    return {
      success: true,
      type: 'info',
      content: `## 当前模型\n\n\`${currentModel}\``,
    };
  },
};

/**
 * /theme - 切换主题
 */
export const themeCommand: SlashCommand = {
  name: 'theme',
  aliases: ['t'],
  description: '显示或切换主题',
  category: 'config',
  usage: '/theme [theme-name]',
  examples: ['/theme', '/theme dark', '/theme light'],

  async handler(args: string): Promise<SlashCommandResult> {
    const { themeManager } = await import('../ui/themes/index.js');
    
    const trimmedArgs = args.trim().toLowerCase();
    const availableThemes = themeManager.getAvailableThemes();
    const currentTheme = themeManager.getTheme();
    
    if (trimmedArgs) {
      if (availableThemes.includes(trimmedArgs)) {
        themeManager.setTheme(trimmedArgs);
        return {
          success: true,
          type: 'success',
          message: `✓ 主题已切换为 ${trimmedArgs}`,
        };
      }
      
      return {
        success: false,
        type: 'error',
        error: `未知主题: ${trimmedArgs}\n可用主题: ${availableThemes.join(', ')}`,
      };
    }
    
    let content = `## 🎨 主题设置\n\n`;
    content += `**当前主题：** ${currentTheme.name}\n\n`;
    content += `**可用主题：**\n`;
    for (const theme of availableThemes) {
      const marker = theme === currentTheme.name ? ' ✓' : '';
      content += `- \`${theme}\`${marker}\n`;
    }
    content += `\n使用 \`/theme <名称>\` 切换主题`;
    
    return {
      success: true,
      type: 'info',
      content,
    };
  },
};

/**
 * /status - 显示会话状态
 */
export const statusCommand: SlashCommand = {
  name: 'status',
  aliases: ['st'],
  description: '显示当前会话状态',
  category: 'session',
  usage: '/status',

  async handler(): Promise<SlashCommandResult> {
    const state = getState();
    const { session, config } = state;
    const runtimeConfig = config.config;
    
    let content = `## 📊 会话状态\n\n`;
    content += `| 属性 | 值 |\n`;
    content += `|------|----|\n`;
    content += `| Session ID | \`${session.sessionId || 'N/A'}\` |\n`;
    content += `| 消息数 | ${session.messages.length} |\n`;
    content += `| 输入 Tokens | ${session.tokenUsage.inputTokens} |\n`;
    content += `| 输出 Tokens | ${session.tokenUsage.outputTokens} |\n`;
    content += `| 当前模型 | ${runtimeConfig?.currentModelId || 'N/A'} |\n`;
    content += `| 思考中 | ${session.isThinking ? '是' : '否'} |\n`;
    
    return {
      success: true,
      type: 'info',
      content,
    };
  },
};

/**
 * 所有内置命令
 */
export const builtinCommands: SlashCommand[] = [
  helpCommand,
  clearCommand,
  compactCommand,
  versionCommand,
  modelCommand,
  themeCommand,
  statusCommand,
];
