#!/usr/bin/env node
/**
 * ClawdCode CLI - 主入口
 * 
 * 配置加载优先级（从低到高）：
 * 1. 默认配置
 * 2. 用户配置 (~/.clawdcode/config.json)
 * 3. 项目配置 (./.clawdcode/config.json)
 * 4. 环境变量 (OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL)
 * 5. CLI 参数 (--api-key, --base-url, --model)
 */

import React from 'react';
import { render } from 'ink';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { App } from './ui/App.js';
import { configManager } from './config/index.js';

async function main() {
  // 解析 CLI 参数
  const argv = await yargs(hideBin(process.argv))
    .scriptName('clawdcode')
    .usage('$0 [options]')
    .option('api-key', {
      type: 'string',
      description: 'OpenAI API Key',
    })
    .option('base-url', {
      type: 'string',
      description: 'API Base URL (for OpenAI-compatible services)',
    })
    .option('model', {
      type: 'string',
      description: 'Model to use',
    })
    .option('init', {
      type: 'boolean',
      description: 'Create default config file',
      default: false,
    })
    .example('$0', 'Start interactive mode')
    .example('$0 --model gpt-3.5-turbo', 'Use a specific model')
    .example('$0 --init', 'Create default config file')
    .help()
    .alias('h', 'help')
    .version()
    .alias('v', 'version')
    .parse();

  // 处理 --init 命令
  if (argv.init) {
    const configPath = await configManager.createDefaultConfig();
    console.log(`✅ Created default config at: ${configPath}`);
    console.log('');
    console.log('Please edit the file and add your API key:');
    console.log(`  vim ${configPath}`);
    process.exit(0);
  }

  // 初始化配置管理器（加载配置文件 + 环境变量）
  await configManager.initialize();

  // 应用 CLI 参数（最高优先级）
  configManager.applyCliArgs({
    apiKey: argv.apiKey,
    baseURL: argv.baseUrl,
    model: argv.model,
  });

  // 获取最终配置
  const modelConfig = configManager.getDefaultModel();

  // 检查 API Key
  if (!modelConfig.apiKey) {
    console.error('Error: API key is required');
    console.error('');
    console.error('Configuration options (in priority order):');
    console.error('');
    console.error('  1. Config file (~/.clawdcode/config.json):');
    console.error('     clawdcode --init  # Create default config');
    console.error('');
    console.error('  2. Environment variable:');
    console.error('     export OPENAI_API_KEY=sk-...');
    console.error('');
    console.error('  3. CLI argument:');
    console.error('     clawdcode --api-key sk-...');
    console.error('');
    
    // 显示已加载的配置文件
    const loadedPaths = configManager.getLoadedConfigPaths();
    if (loadedPaths.length > 0) {
      console.error('Loaded config files:');
      loadedPaths.forEach(p => console.error(`  - ${p}`));
    }
    
    process.exit(1);
  }

  // 启动 Ink 应用
  render(
    <App 
      apiKey={modelConfig.apiKey} 
      baseURL={modelConfig.baseURL}
      model={modelConfig.model}
    />
  );
}

main().catch((error) => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
