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
  description: 'Show available commands',
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
          content += `**usage:** \`${cmd.usage}\`\n\n`;
        }
        
        if (cmd.aliases && cmd.aliases.length > 0) {
          content += `**aliases:** ${cmd.aliases.map(a => `\`/${a}\``).join(', ')}\n\n`;
        }
        
        if (cmd.examples && cmd.examples.length > 0) {
          content += `**examples:**\n`;
          for (const example of cmd.examples) {
            content += `- \`${example}\`\n`;
          }
        }
        
        return { success: true, type: 'info', content };
      }
      
      return {
        success: false,
        type: 'error',
        error: `unknown command: /${trimmedArgs}`,
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
      general: 'general',
      session: 'session',
      config: 'config',
      skills: 'skills',
      hooks: 'hooks',
      git: 'git',
      mcp: 'mcp',
      custom: 'custom',
    };
    
    let content = '## Commands\n\n';
    
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
    
    content += `\`/help <cmd>\` for details\n`;
    
    return { success: true, type: 'info', content };
  },
};

/**
 * /clear - 清除对话历史
 */
export const clearCommand: SlashCommand = {
  name: 'clear',
  aliases: ['cls'],
  description: 'Clear chat history',
  category: 'session',
  usage: '/clear',

  async handler(): Promise<SlashCommandResult> {
    sessionActions().clearMessages();
    
    return {
      success: true,
      type: 'success',
      message: 'cleared',
    };
  },
};

/**
 * /compact - 手动压缩上下文
 */
export const compactCommand: SlashCommand = {
  name: 'compact',
  description: 'Compact context manually',
  category: 'session',
  usage: '/compact',
  fullDescription: 'Trigger manual context compaction, summarizing conversation history to save tokens.',

  async handler(_args: string, context: SlashCommandContext): Promise<SlashCommandResult> {
    const { contextManager, chatService, modelName } = context;
    
    if (!contextManager) {
      return {
        success: false,
        type: 'error',
        error: 'context manager unavailable',
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
          message: 'history too short, skipping compaction',
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
          content: `## Context compacted

| metric | value |
|--------|-------|
| before | ${result.preTokens.toLocaleString()} tokens |
| after | ${result.postTokens.toLocaleString()} tokens |
| saved | ${savedTokens.toLocaleString()} tokens (${savedPercent}%) |
| files | ${result.filesIncluded.length} |

conversation continues normally.`,
        };
      } else {
        return {
          success: false,
          type: 'error',
          error: `compaction failed: ${result.error || 'unknown'}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        type: 'error',
        error: `compaction error: ${error instanceof Error ? error.message : String(error)}`,
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
  description: 'Show version info',
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

    const content = `## ClawdCode v${version}

runtime: ${process.version} · ${process.platform} ${process.arch}
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
  description: 'Show or switch model',
  category: 'config',
  usage: '/model [model-id]',
  examples: ['/model', '/model gpt-4', '/model claude-3-5-sonnet'],
  fullDescription: 'Show current model info or switch to a specified model. Without args, opens interactive selector.',

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
          message: `model -> ${targetModel.name || targetModel.model || targetModel.id}`,
        };
      }
      
      // 未找到，显示可用模型
      let errorContent = `unknown model: \`${trimmedArgs}\`\n\n`;
      if (models.length > 0) {
        errorContent += `available:\n`;
        for (const m of models) {
          errorContent += `- \`${m.id || m.model}\` ${m.name || m.model || ''}\n`;
        }
      } else {
        errorContent += 'no models configured. add models to config.';
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
        content: `## model\n\ncurrent: \`${modelInfo}\`\n\nno models configured. add \`models\` array to \`~/.clawdcode/config.json\`.`,
      };
    }
    
    // 返回选择器配置
    return {
      success: true,
      type: 'selector',
      selector: {
        title: 'Select model',
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
  description: 'Show or switch theme',
  category: 'config',
  usage: '/theme [theme-name]',
  examples: ['/theme', '/theme dark', '/theme ocean'],
  fullDescription: 'Show current theme or switch to a specified theme. Without args, opens interactive selector.',

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
          message: `theme -> ${targetTheme.name}`,
        };
      }
      
      return {
        success: false,
        type: 'error',
        error: `unknown theme: ${trimmedArgs}\navailable: ${themePresets.map(t => t.id).join(', ')}`,
      };
    }
    
    // 无参数时，返回选择器配置
    return {
      success: true,
      type: 'selector',
      selector: {
        title: 'Select theme',
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
  description: 'Show session status',
  category: 'session',
  usage: '/status',

  async handler(): Promise<SlashCommandResult> {
    const state = getState();
    const { session, config } = state;
    const runtimeConfig = config.config;
    
    let content = `## status\n\n`;
    content += `| key | value |\n`;
    content += `|-----|-------|\n`;
    content += `| sid | \`${session.sessionId || 'N/A'}\` |\n`;
    content += `| messages | ${session.messages.length} |\n`;
    content += `| tokens in | ${session.tokenUsage.inputTokens} |\n`;
    content += `| tokens out | ${session.tokenUsage.outputTokens} |\n`;
    content += `| model | ${runtimeConfig?.currentModelId || 'N/A'} |\n`;
    content += `| thinking | ${session.isThinking ? 'yes' : 'no'} |\n`;
    
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
  description: 'List and manage skills',
  category: 'skills',
  usage: '/skills [name|refresh]',
  examples: ['/skills', '/skills commit-message', '/skills refresh'],
  fullDescription: 'List all available skills, view skill details, or refresh the skills list.',

  async handler(args: string): Promise<SlashCommandResult> {
    const { getSkillRegistry } = await import('../skills/index.js');
    const registry = getSkillRegistry();
    
    if (!registry.isInitialized()) {
      return {
        success: false,
        type: 'error',
        error: 'skills system not initialized',
      };
    }
    
    const trimmedArgs = args.trim().toLowerCase();
    
    // 刷新 Skills
    if (trimmedArgs === 'refresh' || trimmedArgs === 'reload') {
      const result = await registry.refresh();
      
      let content = `## skills refreshed\n\n`;
      content += `loaded **${result.count}** skills: `;
      content += `${result.bySource.user} user · ${result.bySource.project} project · ${result.bySource.builtin} builtin\n`;
      
      if (result.errors.length > 0) {
        content += `\n### errors\n\n`;
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
        
        let errorContent = `unknown skill: \`${trimmedArgs}\`\n\n`;
        if (suggestions.length > 0) {
          errorContent += `similar:\n`;
          for (const s of suggestions) {
            errorContent += `- \`${s.name}\` ${s.description}\n`;
          }
        }
        
        return { success: false, type: 'error', content: errorContent };
      }
      
      // 显示 Skill 详情
      let content = `## ${skill.name}\n\n`;
      content += `${skill.description}\n\n`;
      content += `| key | value |\n`;
      content += `|-----|-------|\n`;
      content += `| source | ${skill.source} |\n`;
      content += `| path | \`${skill.path}\` |\n`;
      content += `| invocable | ${skill.userInvocable ? 'yes' : 'no'} |\n`;
      content += `| no-model | ${skill.disableModelInvocation ? 'yes' : 'no'} |\n`;
      
      if (skill.allowedTools && skill.allowedTools.length > 0) {
        content += `| tools | ${skill.allowedTools.join(', ')} |\n`;
      }
      if (skill.whenToUse) {
        content += `\n### when to use\n\n${skill.whenToUse}\n`;
      }
      if (skill.argumentHint) {
        content += `\n### args\n\n${skill.argumentHint}\n`;
      }
      
      return { success: true, type: 'info', content };
    }
    
    // 列出所有 Skills
    const allSkills = registry.getAllSkills();
    
    if (allSkills.length === 0) {
      return {
        success: true,
        type: 'info',
        content: `## skills\n\nno skills found.\n\nadd \`SKILL.md\` files to:\n- \`~/.claude/skills/\` (user)\n- \`~/.clawdcode/skills/\` (user)\n- \`.claude/skills/\` (project)\n- \`.clawdcode/skills/\` (project)`,
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
    
    let content = `## skills (${allSkills.length})\n\n`;
    
    // 内置 Skills
    if (grouped.builtin.length > 0) {
      content += `### builtin\n\n`;
      for (const skill of grouped.builtin) {
        content += `- \`${skill.name}\` ${skill.description}\n`;
      }
      content += '\n';
    }
    
    // 用户 Skills
    if (grouped.user.length > 0) {
      content += `### user\n\n`;
      for (const skill of grouped.user) {
        const tag = skill.userInvocable ? ' *' : '';
        content += `- \`${skill.name}\`${tag} ${skill.description}\n`;
      }
      content += '\n';
    }
    
    // 项目 Skills
    if (grouped.project.length > 0) {
      content += `### project\n\n`;
      for (const skill of grouped.project) {
        const tag = skill.userInvocable ? ' *' : '';
        content += `- \`${skill.name}\`${tag} ${skill.description}\n`;
      }
      content += '\n';
    }
    
    content += `\`/skills <name>\` for details · * = invocable\n`;
    
    return { success: true, type: 'info', content };
  },
};

/**
 * /hooks - Hooks 管理
 */
export const hooksCommand: SlashCommand = {
  name: 'hooks',
  description: 'View and manage hooks',
  category: 'hooks',
  usage: '/hooks [status|list]',
  examples: ['/hooks', '/hooks status', '/hooks list'],
  fullDescription: 'View hooks configuration status and configured hook list.',

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
      
      let content = `## hooks\n\n`;
      content += `| key | value |\n`;
      content += `|-----|-------|\n`;
      content += `| status | ${enabled ? 'enabled' : 'disabled'} |\n`;
      content += `| hooks | ${totalHooks} |\n`;
      content += `| events | ${configuredEvents.length} |\n`;
      
      if (totalHooks > 0) {
        content += `\n### by event\n\n`;
        for (const [event, count] of Object.entries(counts)) {
          content += `- **${event}** ${count}\n`;
        }
      }
      
      content += `\n\`/hooks list\` for full config\n`;
      
      return { success: true, type: 'info', content };
    }
    
    // 列出所有配置
    if (trimmedArgs === 'list') {
      const config = manager.getConfig();
      const events = Object.values(HookEvent);
      
      let content = `## hooks config\n\n`;
      
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
              content += `- tools: \`${matcher.matcher.tools}\`\n`;
            }
            if (matcher.matcher.paths) {
              content += `- paths: \`${matcher.matcher.paths}\`\n`;
            }
            if (matcher.matcher.commands) {
              content += `- commands: \`${matcher.matcher.commands}\`\n`;
            }
          }
          
          content += `- hooks: ${matcher.hooks?.length || 0}\n`;
          content += '\n';
        }
      }
      
      if (!hasAny) {
        content += `no hooks configured.\n\n`;
        content += `add \`hooks\` to settings.json:\n`;
        content += `- \`~/.clawdcode/settings.json\` (user)\n`;
        content += `- \`.clawdcode/settings.json\` (project)\n`;
      }
      
      return { success: true, type: 'info', content };
    }
    
    return {
      success: false,
      type: 'error',
      error: `unknown subcommand: ${trimmedArgs}\navailable: status, list`,
    };
  },
};

/**
 * /copy - 复制代码块到剪贴板
 */
export const copyCommand: SlashCommand = {
  name: 'copy',
  aliases: ['cp'],
  description: 'Copy code block to clipboard',
  category: 'general',
  usage: '/copy [n | list]',
  examples: ['/copy', '/copy 2', '/copy list'],
  fullDescription: 'Copy a code block to clipboard. /copy copies the last block. /copy N copies the Nth from end (1=last). /copy list shows all blocks.',

  async handler(args: string): Promise<SlashCommandResult> {
    const state = getState();
    const messages = state.session.messages;

    // Extract all code blocks from messages
    const { parseMarkdown } = await import('../ui/components/markdown/parser.js');

    const codeBlocks: Array<{ content: string; language?: string; filePath?: string }> = [];

    for (const msg of messages) {
      if (!msg.content) continue;
      const blocks = parseMarkdown(msg.content);
      for (const block of blocks) {
        if (block.type === 'code' && block.content.trim()) {
          codeBlocks.push({
            content: block.content,
            language: block.language,
            filePath: block.filePath,
          });
        }
      }
    }

    if (codeBlocks.length === 0) {
      return {
        success: false,
        type: 'error',
        error: 'no code blocks in conversation',
      };
    }

    const trimmedArgs = args.trim().toLowerCase();

    // /copy list - show all blocks
    if (trimmedArgs === 'list' || trimmedArgs === 'ls') {
      let content = `${codeBlocks.length} code blocks (newest first)\n\n`;
      for (let i = codeBlocks.length - 1; i >= 0; i--) {
        const n = codeBlocks.length - i; // n from end
        const b = codeBlocks[i];
        const label = b.filePath || b.language || 'code';
        const lines = b.content.split('\n').length;
        const preview = b.content.split('\n')[0].slice(0, 50);
        content += `  ${n}. ${label} (${lines}L) ${preview}${preview.length >= 50 ? '...' : ''}\n`;
      }
      content += `\nuse /copy N to copy`;
      return { success: true, type: 'info', content };
    }

    // Determine which block to copy
    let targetIndex: number;

    if (!trimmedArgs) {
      targetIndex = codeBlocks.length - 1;
    } else {
      const n = parseInt(trimmedArgs, 10);
      if (isNaN(n) || n < 1) {
        return {
          success: false,
          type: 'error',
          error: `invalid: ${trimmedArgs}. use /copy [N] or /copy list`,
        };
      }
      targetIndex = codeBlocks.length - n;
      if (targetIndex < 0) {
        return {
          success: false,
          type: 'error',
          error: `only ${codeBlocks.length} blocks. use /copy list`,
        };
      }
    }

    const target = codeBlocks[targetIndex];

    // Copy to clipboard
    try {
      const { execSync } = await import('child_process');
      const platform = process.platform;

      if (platform === 'darwin') {
        execSync('pbcopy', { input: target.content });
      } else if (platform === 'linux') {
        try {
          execSync('xclip -selection clipboard', { input: target.content });
        } catch {
          execSync('xsel --clipboard --input', { input: target.content });
        }
      } else if (platform === 'win32') {
        execSync('clip', { input: target.content });
      } else {
        throw new Error(`unsupported platform: ${platform}`);
      }
    } catch (err) {
      return {
        success: false,
        type: 'error',
        error: `clipboard: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // Build confirmation
    const lines = target.content.split('\n').length;
    const label = target.filePath || target.language || 'code';
    const preview = target.content.split('\n')[0].slice(0, 50);
    const hint = codeBlocks.length > 1 ? ` · ${codeBlocks.length} blocks, /copy list` : '';

    return {
      success: true,
      type: 'success',
      message: `copied ${label} (${lines}L) · ${preview}${preview.length >= 50 ? '...' : ''}${hint}`,
    };
  },
};

/**
 * /thinking - 切换思考块展开/折叠
 */
export const thinkingCommand: SlashCommand = {
  name: 'thinking',
  description: 'Toggle thinking blocks expand/collapse',
  category: 'config',
  usage: '/thinking',
  fullDescription: 'Toggle global expand/collapse for all thinking blocks in messages.',

  async handler(): Promise<SlashCommandResult> {
    const { appActions, getState } = await import('../store/index.js');
    appActions().toggleShowAllThinking();
    
    const expanded = getState().app.showAllThinking;
    return {
      success: true,
      type: 'success',
      message: `thinking blocks: ${expanded ? 'expanded' : 'collapsed'}`,
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
  thinkingCommand,
  copyCommand,
];
