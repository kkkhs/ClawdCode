#!/usr/bin/env bun
/**
 * 简单的 MCP 测试服务器
 * 
 * 运行: bun run src/mcp/test-server.ts
 * 
 * 提供两个简单工具:
 * - echo: 返回输入的文本
 * - time: 返回当前时间
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  {
    name: 'test-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 列出工具
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'echo',
        description: 'Echo back the input text',
        inputSchema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'Text to echo',
            },
          },
          required: ['text'],
        },
      },
      {
        name: 'time',
        description: 'Get current time',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

// 调用工具
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'echo') {
    const text = (args as { text?: string })?.text || '';
    return {
      content: [{ type: 'text', text: `Echo: ${text}` }],
    };
  }

  if (name === 'time') {
    return {
      content: [{ type: 'text', text: `Current time: ${new Date().toISOString()}` }],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

// 启动服务器
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Test MCP server running on stdio');
}

main().catch(console.error);
