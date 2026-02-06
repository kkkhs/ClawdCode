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
      skills: '🧠 Skills',
      hooks: '🪝 Hooks',
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
  fullDescription: '手动触发上下文压缩，将对话历史总结为简洁的摘要以节省 Token',

  async handler(_args: string, context: SlashCommandContext): Promise<SlashCommandResult> {
    const { contextManager, chatService, modelName } = context;
    
    if (!contextManager) {
      return {
        success: false,
        type: 'error',
        error: '上下文管理器不可用',
      };
    }

    try {
      // 标记开始压缩
      sessionActions().setCompacting(true);
      
      const contextMessages = contextManager.getMessages();
      const currentTokens = contextManager.getTokenCount();
      
      if (contextMessages.length < 4) {
        sessionActions().setCompacting(false);
        return {
          success: true,
          type: 'info',
          message: '📝 对话历史过短，无需压缩',
        };
      }

      // 动态导入避免循环依赖
      const { CompactionService } = await import('../context/CompactionService.js');
      
      // 获取 maxContextTokens 配置
      const state = getState();
      const runtimeConfig = state.config.config;
      const maxContextTokens = runtimeConfig?.maxContextTokens || 200000;
      
      // 转换消息格式：ContextMessage -> Message
      const messages = contextMessages.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant' | 'system' | 'tool',
        content: m.content,
      }));
      
      const result = await CompactionService.compact(messages, {
        modelName: modelName || 'gpt-4',
        maxContextTokens,
        chatService,
        trigger: 'manual',
        actualPreTokens: currentTokens,
      });

      if (result.success) {
        // 将 Message[] 转换为 ContextMessage[] 格式
        const { nanoid } = await import('nanoid');
        const compactedContextMessages = result.compactedMessages.map(m => ({
          id: nanoid(),
          role: m.role as 'user' | 'assistant' | 'system' | 'tool',
          content: m.content,
          timestamp: Date.now(),
        }));
        
        // 更新 ContextManager 中的消息
        contextManager.replaceMessages(compactedContextMessages);
        
        // 更新 token 统计
        contextManager.updateTokenCount(result.postTokens);
        
        const savedTokens = result.preTokens - result.postTokens;
        const savedPercent = Math.round((savedTokens / result.preTokens) * 100);

        return {
          success: true,
          type: 'success',
          content: `## ✅ 上下文压缩完成

| 指标 | 值 |
|------|-----|
| 压缩前 | ${result.preTokens.toLocaleString()} tokens |
| 压缩后 | ${result.postTokens.toLocaleString()} tokens |
| 节省 | ${savedTokens.toLocaleString()} tokens (${savedPercent}%) |
| 包含文件 | ${result.filesIncluded.length} 个 |

对话可以正常继续。`,
        };
      } else {
        return {
          success: false,
          type: 'error',
          error: `压缩失败: ${result.error || '未知错误'}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        type: 'error',
        error: `压缩执行出错: ${error instanceof Error ? error.message : String(error)}`,
      };
    } finally {
      sessionActions().setCompacting(false);
    }
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
 * /model - 显示或切换模型
 */
export const modelCommand: SlashCommand = {
  name: 'model',
  aliases: ['m'],
  description: '显示或切换模型',
  category: 'config',
  usage: '/model [model-id]',
  examples: ['/model', '/model gpt-4', '/model claude-3-5-sonnet'],
  fullDescription: '显示当前模型信息，或切换到指定模型。不带参数时显示交互式选择器。',

  async handler(args: string, context: SlashCommandContext): Promise<SlashCommandResult> {
    const state = getState();
    const config = state.config.config;
    const models = config?.models || [];
    const currentModelId = config?.currentModelId;
    const defaultModel = config?.default;
    
    const trimmedArgs = args.trim();
    
    // 如果指定了模型名称，直接切换
    if (trimmedArgs) {
      // 按 id 或 model 名称查找
      const targetModel = models.find(
        m => m.id === trimmedArgs || m.model === trimmedArgs || m.name === trimmedArgs
      );
      
      if (targetModel) {
        // 更新 store 中的 currentModelId
        const { configActions } = await import('../store/index.js');
        configActions().updateConfig({ currentModelId: targetModel.id });
        
        return {
          success: true,
          type: 'success',
          message: `✓ 已切换到模型: ${targetModel.name || targetModel.model || targetModel.id}`,
        };
      }
      
      // 未找到，显示可用模型
      let errorContent = `❌ 未找到模型: \`${trimmedArgs}\`\n\n`;
      if (models.length > 0) {
        errorContent += `**可用模型：**\n`;
        for (const m of models) {
          errorContent += `- \`${m.id || m.model}\` - ${m.name || m.model || 'unnamed'}\n`;
        }
      } else {
        errorContent += '未配置任何模型，请在配置文件中添加模型。';
      }
      
      return {
        success: false,
        type: 'error',
        content: errorContent,
      };
    }
    
    // 无参数时，返回选择器配置或显示当前信息
    if (models.length === 0) {
      // 没有配置多模型，显示默认模型信息
      const modelInfo = defaultModel?.model || currentModelId || 'unknown';
      return {
        success: true,
        type: 'info',
        content: `## 🤖 当前模型\n\n\`${modelInfo}\`\n\n未配置多模型，请在 \`~/.clawdcode/config.json\` 中添加 \`models\` 数组。`,
      };
    }
    
    // 返回选择器配置
    return {
      success: true,
      type: 'selector',
      selector: {
        title: '🤖 选择模型',
        options: models.map(m => ({
          value: m.id || m.model || '',
          label: m.name || m.model || m.id || 'unnamed',
          description: m.model,
          isCurrent: m.id === currentModelId,
        })),
        handler: 'model',
      },
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
  examples: ['/theme', '/theme dark', '/theme ocean'],
  fullDescription: '显示当前主题信息，或切换到指定主题。不带参数时显示交互式选择器。',

  async handler(args: string): Promise<SlashCommandResult> {
    const { themeManager } = await import('../ui/themes/index.js');
    
    const trimmedArgs = args.trim().toLowerCase();
    const themePresets = themeManager.getThemePresets();
    const currentThemeName = themeManager.getCurrentThemeName();
    
    // 如果指定了主题名称，直接切换
    if (trimmedArgs) {
      const targetTheme = themePresets.find(t => t.id === trimmedArgs || t.name.toLowerCase() === trimmedArgs);
      
      if (targetTheme) {
        themeManager.setTheme(targetTheme.id);
        return {
          success: true,
          type: 'success',
          message: `✓ 主题已切换为 ${targetTheme.name}`,
        };
      }
      
      return {
        success: false,
        type: 'error',
        error: `未知主题: ${trimmedArgs}\n可用主题: ${themePresets.map(t => t.id).join(', ')}`,
      };
    }
    
    // 无参数时，返回选择器配置
    return {
      success: true,
      type: 'selector',
      selector: {
        title: '🎨 选择主题',
        options: themePresets.map(t => ({
          value: t.id,
          label: t.name,
          description: t.description,
          isCurrent: t.id === currentThemeName || t.name === currentThemeName,
        })),
        handler: 'theme',
      },
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
 * /skills - Skills 管理
 */
export const skillsCommand: SlashCommand = {
  name: 'skills',
  aliases: ['sk'],
  description: '查看和管理 Skills',
  category: 'skills',
  usage: '/skills [name|refresh]',
  examples: ['/skills', '/skills commit-message', '/skills refresh'],
  fullDescription: '列出所有可用的 Skills，查看特定 Skill 详情，或刷新 Skills 列表。',

  async handler(args: string): Promise<SlashCommandResult> {
    const { getSkillRegistry } = await import('../skills/index.js');
    const registry = getSkillRegistry();
    
    if (!registry.isInitialized()) {
      return {
        success: false,
        type: 'error',
        error: 'Skills 系统尚未初始化',
      };
    }
    
    const trimmedArgs = args.trim().toLowerCase();
    
    // 刷新 Skills
    if (trimmedArgs === 'refresh' || trimmedArgs === 'reload') {
      const result = await registry.refresh();
      
      let content = `## ✅ Skills 已刷新\n\n`;
      content += `已加载 **${result.count}** 个 Skills:\n`;
      content += `- 用户级: ${result.bySource.user}\n`;
      content += `- 项目级: ${result.bySource.project}\n`;
      content += `- 内置: ${result.bySource.builtin}\n`;
      
      if (result.errors.length > 0) {
        content += `\n### ⚠️ 加载错误\n`;
        for (const err of result.errors) {
          content += `- \`${err.path}\`: ${err.error}\n`;
        }
      }
      
      return { success: true, type: 'success', content };
    }
    
    // 查看特定 Skill 详情
    if (trimmedArgs && trimmedArgs !== 'list') {
      const skill = registry.getSkill(trimmedArgs);
      
      if (!skill) {
        const allSkills = registry.getAllSkills();
        const suggestions = allSkills
          .filter(s => s.name.includes(trimmedArgs) || s.description.toLowerCase().includes(trimmedArgs))
          .slice(0, 5);
        
        let errorContent = `❌ 未找到 Skill: \`${trimmedArgs}\`\n\n`;
        if (suggestions.length > 0) {
          errorContent += `**相似的 Skills：**\n`;
          for (const s of suggestions) {
            errorContent += `- \`${s.name}\` - ${s.description}\n`;
          }
        }
        
        return { success: false, type: 'error', content: errorContent };
      }
      
      // 显示 Skill 详情
      let content = `## 🧠 ${skill.name}\n\n`;
      content += `${skill.description}\n\n`;
      content += `| 属性 | 值 |\n`;
      content += `|------|----|\n`;
      content += `| 来源 | ${getSourceLabel(skill.source)} |\n`;
      content += `| 路径 | \`${skill.path}\` |\n`;
      content += `| 用户可调用 | ${skill.userInvocable ? '是' : '否'} |\n`;
      content += `| 禁用模型调用 | ${skill.disableModelInvocation ? '是' : '否'} |\n`;
      
      if (skill.allowedTools && skill.allowedTools.length > 0) {
        content += `| 允许工具 | ${skill.allowedTools.join(', ')} |\n`;
      }
      if (skill.whenToUse) {
        content += `\n### 何时使用\n\n${skill.whenToUse}\n`;
      }
      if (skill.argumentHint) {
        content += `\n### 参数提示\n\n${skill.argumentHint}\n`;
      }
      
      return { success: true, type: 'info', content };
    }
    
    // 列出所有 Skills
    const allSkills = registry.getAllSkills();
    
    if (allSkills.length === 0) {
      return {
        success: true,
        type: 'info',
        content: `## 🧠 Skills\n\n暂无可用的 Skills。\n\n在以下目录添加 \`SKILL.md\` 文件:\n- \`~/.claude/skills/\` (用户级)\n- \`~/.clawdcode/skills/\` (用户级)\n- \`.claude/skills/\` (项目级)\n- \`.clawdcode/skills/\` (项目级)`,
      };
    }
    
    // 按来源分组
    const grouped: Record<string, typeof allSkills> = {
      builtin: [],
      user: [],
      project: [],
    };
    
    for (const skill of allSkills) {
      grouped[skill.source].push(skill);
    }
    
    let content = `## 🧠 Skills (${allSkills.length})\n\n`;
    
    // 内置 Skills
    if (grouped.builtin.length > 0) {
      content += `### 📦 内置\n\n`;
      for (const skill of grouped.builtin) {
        content += `- \`${skill.name}\` - ${skill.description}\n`;
      }
      content += '\n';
    }
    
    // 用户 Skills
    if (grouped.user.length > 0) {
      content += `### 👤 用户级\n\n`;
      for (const skill of grouped.user) {
        const invocable = skill.userInvocable ? ' ⚡' : '';
        content += `- \`${skill.name}\`${invocable} - ${skill.description}\n`;
      }
      content += '\n';
    }
    
    // 项目 Skills
    if (grouped.project.length > 0) {
      content += `### 📁 项目级\n\n`;
      for (const skill of grouped.project) {
        const invocable = skill.userInvocable ? ' ⚡' : '';
        content += `- \`${skill.name}\`${invocable} - ${skill.description}\n`;
      }
      content += '\n';
    }
    
    content += `---\n`;
    content += `💡 使用 \`/skills <name>\` 查看详情 | ⚡ = 用户可调用\n`;
    
    return { success: true, type: 'info', content };
  },
};

/**
 * 获取来源标签
 */
function getSourceLabel(source: string): string {
  switch (source) {
    case 'builtin': return '📦 内置';
    case 'user': return '👤 用户级';
    case 'project': return '📁 项目级';
    default: return source;
  }
}

/**
 * /hooks - Hooks 管理
 */
export const hooksCommand: SlashCommand = {
  name: 'hooks',
  description: '查看和管理 Hooks',
  category: 'hooks',
  usage: '/hooks [status|list]',
  examples: ['/hooks', '/hooks status', '/hooks list'],
  fullDescription: '查看 Hooks 配置状态和已配置的 Hook 列表。',

  async handler(args: string): Promise<SlashCommandResult> {
    const { getHookManager, HookEvent } = await import('../hooks/index.js');
    const manager = getHookManager();
    
    const trimmedArgs = args.trim().toLowerCase();
    
    // 显示状态
    if (trimmedArgs === 'status' || trimmedArgs === '') {
      const enabled = manager.isEnabled();
      const counts = manager.getHookCounts();
      const totalHooks = Object.values(counts).reduce((a, b) => a + b, 0);
      const configuredEvents = manager.getConfiguredEvents();
      
      let content = `## 🪝 Hooks 状态\n\n`;
      content += `| 属性 | 值 |\n`;
      content += `|------|----|\n`;
      content += `| 状态 | ${enabled ? '✅ 启用' : '❌ 禁用'} |\n`;
      content += `| 已配置 Hooks | ${totalHooks} 个 |\n`;
      content += `| 事件类型 | ${configuredEvents.length} 种 |\n`;
      
      if (totalHooks > 0) {
        content += `\n### 📊 按事件统计\n\n`;
        for (const [event, count] of Object.entries(counts)) {
          content += `- **${event}**: ${count} 个\n`;
        }
      }
      
      content += `\n---\n`;
      content += `💡 使用 \`/hooks list\` 查看详细配置\n`;
      
      return { success: true, type: 'info', content };
    }
    
    // 列出所有配置
    if (trimmedArgs === 'list') {
      const config = manager.getConfig();
      const events = Object.values(HookEvent);
      
      let content = `## 🪝 Hooks 配置\n\n`;
      
      let hasAny = false;
      for (const event of events) {
        const matchers = config[event];
        if (!matchers || !Array.isArray(matchers) || matchers.length === 0) {
          continue;
        }
        
        hasAny = true;
        content += `### ${event}\n\n`;
        
        for (const matcher of matchers) {
          const name = matcher.name || '(unnamed)';
          content += `**${name}**\n`;
          
          if (matcher.matcher) {
            if (matcher.matcher.tools) {
              content += `- Tools: \`${matcher.matcher.tools}\`\n`;
            }
            if (matcher.matcher.paths) {
              content += `- Paths: \`${matcher.matcher.paths}\`\n`;
            }
            if (matcher.matcher.commands) {
              content += `- Commands: \`${matcher.matcher.commands}\`\n`;
            }
          }
          
          content += `- Hooks: ${matcher.hooks?.length || 0} 个\n`;
          content += '\n';
        }
      }
      
      if (!hasAny) {
        content += `暂无配置的 Hooks。\n\n`;
        content += `在 \`settings.json\` 中添加 \`hooks\` 配置：\n`;
        content += `- \`~/.clawdcode/settings.json\` (用户级)\n`;
        content += `- \`.clawdcode/settings.json\` (项目级)\n`;
      }
      
      return { success: true, type: 'info', content };
    }
    
    return {
      success: false,
      type: 'error',
      error: `未知子命令: ${trimmedArgs}\n可用: status, list`,
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
  skillsCommand,
  hooksCommand,
];
