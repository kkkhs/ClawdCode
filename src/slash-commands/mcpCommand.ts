/**
 * /mcp 命令 - 显示 MCP 服务器状态和工具
 */

import type { SlashCommand, SlashCommandResult } from './types.js';
import { McpRegistry, McpConnectionStatus } from '../mcp/index.js';

/**
 * 获取状态图标
 */
function getStatusEmoji(status: McpConnectionStatus): string {
  switch (status) {
    case McpConnectionStatus.CONNECTED:
      return '🟢';
    case McpConnectionStatus.CONNECTING:
      return '🟡';
    case McpConnectionStatus.ERROR:
      return '🔴';
    case McpConnectionStatus.DISCONNECTED:
    default:
      return '⚪';
  }
}

/**
 * 格式化时间
 */
function formatTime(date: Date | undefined): string {
  if (!date) return 'N/A';
  return date.toLocaleTimeString();
}

/**
 * /mcp 命令实现
 */
export const mcpCommand: SlashCommand = {
  name: 'mcp',
  description: '显示 MCP 服务器状态和可用工具',
  usage: '/mcp [tools|<server-name>]',

  async handler(args): Promise<SlashCommandResult> {
    const mcpRegistry = McpRegistry.getInstance();
    const stats = mcpRegistry.getStatistics();
    const servers = mcpRegistry.getAllServers();

    // 没有配置任何 MCP 服务器
    if (stats.totalServers === 0) {
      return {
        type: 'info',
        content: `## MCP 服务器状态

📭 **未配置任何 MCP 服务器**

要添加 MCP 服务器，请在配置文件中添加 \`mcpServers\` 配置：

\`\`\`json
// ~/.clawdcode/config.json
{
  "mcpServers": {
    "github": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "\${GITHUB_TOKEN}"
      }
    }
  }
}
\`\`\`
`,
      };
    }

    const trimmedArgs = args.trim().toLowerCase();

    // /mcp tools - 列出所有工具
    if (trimmedArgs === 'tools') {
      return await handleToolsSubcommand(mcpRegistry);
    }

    // /mcp <server-name> - 显示特定服务器详情
    if (trimmedArgs && trimmedArgs !== '') {
      const serverInfo = mcpRegistry.getServer(trimmedArgs);
      if (serverInfo) {
        return handleServerDetail(trimmedArgs, serverInfo);
      }
      // 服务器不存在，显示概览
    }

    // 默认：显示概览
    let output = '## MCP 服务器状态\n\n';
    output += `| 指标 | 值 |\n`;
    output += `|------|----|\n`;
    output += `| 总服务器 | ${stats.totalServers} |\n`;
    output += `| 已连接 | ${stats.connectedServers} |\n`;
    output += `| 错误 | ${stats.errorServers} |\n`;
    output += `| 总工具数 | ${stats.totalTools} |\n`;
    output += '\n';

    output += '### 服务器列表\n\n';
    output += '| 状态 | 服务器 | 工具数 | 连接时间 |\n';
    output += '|------|--------|--------|----------|\n';

    for (const [name, info] of servers) {
      const emoji = getStatusEmoji(info.status);
      const toolCount = info.status === McpConnectionStatus.CONNECTED ? info.tools.length : '-';
      const connectedAt = formatTime(info.connectedAt);
      output += `| ${emoji} | ${name} | ${toolCount} | ${connectedAt} |\n`;
    }

    output += '\n---\n';
    output += '💡 **提示：** 使用 `/mcp tools` 查看所有工具，或 `/mcp <服务器名>` 查看详情\n';

    return {
      type: 'success',
      content: output,
    };
  },
};

/**
 * 处理 /mcp tools 子命令
 */
async function handleToolsSubcommand(registry: McpRegistry): Promise<SlashCommandResult> {
  const tools = await registry.getAvailableTools();

  if (tools.length === 0) {
    return {
      type: 'info',
      content: '## MCP 工具\n\n📭 **没有可用的 MCP 工具**\n\n请确保至少有一个 MCP 服务器已连接。',
    };
  }

  let output = '## MCP 可用工具\n\n';
  output += `共 **${tools.length}** 个工具可用\n\n`;
  output += '| 工具名 | 描述 | 分类 |\n';
  output += '|--------|------|------|\n';

  for (const tool of tools) {
    const description = tool.description?.short || '-';
    const category = tool.category || 'mcp';
    // 截断过长的描述
    const shortDesc = description.length > 50 ? description.slice(0, 47) + '...' : description;
    output += `| \`${tool.name}\` | ${shortDesc} | ${category} |\n`;
  }

  return {
    type: 'success',
    content: output,
  };
}

/**
 * 处理特定服务器详情
 */
function handleServerDetail(name: string, info: any): SlashCommandResult {
  const emoji = getStatusEmoji(info.status);

  let output = `## ${emoji} MCP 服务器: ${name}\n\n`;

  output += '### 基本信息\n\n';
  output += `| 属性 | 值 |\n`;
  output += `|------|----|\n`;
  output += `| 状态 | ${info.status} |\n`;
  output += `| 类型 | ${info.config.type} |\n`;

  if (info.serverName) {
    output += `| 服务器名 | ${info.serverName} |\n`;
  }
  if (info.serverVersion) {
    output += `| 版本 | ${info.serverVersion} |\n`;
  }
  if (info.connectedAt) {
    output += `| 连接时间 | ${info.connectedAt.toLocaleString()} |\n`;
  }
  if (info.lastError) {
    output += `| 最后错误 | ${info.lastError.message} |\n`;
  }

  output += '\n### 配置\n\n';
  output += '```json\n';
  output += JSON.stringify(
    {
      type: info.config.type,
      command: info.config.command,
      args: info.config.args,
      url: info.config.url,
    },
    null,
    2
  );
  output += '\n```\n';

  if (info.status === McpConnectionStatus.CONNECTED && info.tools.length > 0) {
    output += '\n### 可用工具\n\n';
    for (const tool of info.tools) {
      output += `- \`${tool.name}\`: ${tool.description || '-'}\n`;
    }
  }

  return {
    type: 'success',
    content: output,
  };
}
