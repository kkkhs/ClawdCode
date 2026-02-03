#!/usr/bin/env node
/**
 * ClawdCode CLI - 主入口
 *
 * 启动流程：
 * 1. 早期解析 --debug 参数（确保日志可用）
 * 2. 创建 yargs CLI 实例
 * 3. 注册全局选项和命令
 * 4. 执行中间件链（validatePermissions → loadConfiguration → validateOutput）
 * 5. 执行默认命令 → 启动 React UI
 *
 * 配置加载优先级（从低到高）：
 * 1. 默认配置
 * 2. 用户配置 (~/.clawdcode/config.json)
 * 3. 项目配置 (./.clawdcode/config.json)
 * 4. 环境变量 (OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL)
 * 5. CLI 参数 (--api-key, --base-url, --model)
 */

import React from 'react'
import { render } from 'ink'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { App } from './ui/App.js'
import { configManager } from './config/index.js'
import { cliConfig, globalOptions, middlewareChain } from './cli/index.js'
import type { CliArguments } from './cli/types.js'

// ========== 全局状态 ==========
let isDebugMode = false

/**
 * 早期解析 --debug 参数
 *
 * 为什么要早期解析？
 * - Logger 在各模块中被创建
 * - 如果等 yargs 解析完再设置 debug，部分初始化日志会丢失
 * - 早期解析确保所有日志都能正确输出
 */
function parseDebugEarly(): void {
  const rawArgs = hideBin(process.argv)
  const debugIndex = rawArgs.indexOf('--debug')
  const shortDebugIndex = rawArgs.indexOf('-d')

  if (debugIndex !== -1 || shortDebugIndex !== -1) {
    isDebugMode = true
    console.log('[DEBUG] Debug mode enabled via early parsing')
  }
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  // 1. 早期解析 --debug
  parseDebugEarly()

  // 2. 创建 yargs CLI 实例
  const cli = yargs(hideBin(process.argv))
    .scriptName(cliConfig.scriptName)
    .usage(cliConfig.usage)
    .version(cliConfig.version)

    // 3. 注册全局选项
    .options(globalOptions)

    // 4. 注册中间件
    .middleware(middlewareChain)

    // 5. 示例
    .example('$0', 'Start interactive mode')
    .example('$0 "帮我分析这个项目"', 'Start with an initial message')
    .example('$0 --model gpt-4', 'Use a specific model')
    .example('$0 --debug', 'Enable debug mode')
    .example('$0 --init', 'Create default config file')

    // 6. 帮助和版本
    .help()
    .alias('h', 'help')
    .alias('v', 'version')

    // 7. 错误处理
    .fail((msg, err, yargsInstance) => {
      if (err) {
        console.error('💥 An error occurred:')
        console.error(err.message)
        if (isDebugMode && err.stack) {
          console.error('\nStack trace:')
          console.error(err.stack)
        }
        process.exit(1)
      }

      if (msg) {
        console.error('❌ Invalid arguments:')
        console.error(msg)
        console.error('')
        yargsInstance.showHelp()
        process.exit(1)
      }
    })

    // 8. 严格模式（禁止未知选项）
    .strict()

    // 9. 默认命令（$0）
    .command(
      '$0 [message..]',
      'Start interactive mode',
      (yargs) => {
        return yargs.positional('message', {
          type: 'string',
          describe: 'Initial message to send (can be multiple words)',
          array: true,
        })
      },
      async (argv) => {
        const args = argv as CliArguments

        // 处理 --init 命令
        if (args.init) {
          const configPath = await configManager.createDefaultConfig()
          console.log(`✅ Created default config at: ${configPath}`)
          console.log('')
          console.log('Please edit the file and add your API key:')
          console.log(`  vim ${configPath}`)
          process.exit(0)
        }

        // 获取最终配置
        const modelConfig = configManager.getDefaultModel()

        // 检查 API Key
        if (!modelConfig.apiKey) {
          console.error('Error: API key is required')
          console.error('')
          console.error('Configuration options (in priority order):')
          console.error('')
          console.error('  1. Config file (~/.clawdcode/config.json):')
          console.error('     clawdcode --init  # Create default config')
          console.error('')
          console.error('  2. Environment variable:')
          console.error('     export OPENAI_API_KEY=sk-...')
          console.error('')
          console.error('  3. CLI argument:')
          console.error('     clawdcode --api-key sk-...')
          console.error('')

          // 显示已加载的配置文件
          const loadedPaths = configManager.getLoadedConfigPaths()
          if (loadedPaths.length > 0) {
            console.error('Loaded config files:')
            loadedPaths.forEach((p) => console.error(`  - ${p}`))
          }

          process.exit(1)
        }

        // 获取初始消息（支持多个单词）
        const messageArray = argv.message as string[] | undefined
        const initialMessage =
          messageArray && messageArray.length > 0
            ? messageArray.join(' ')
            : undefined

        if (isDebugMode && initialMessage) {
          console.log('[DEBUG] Initial message:', initialMessage)
        }

        // 启动 Ink 应用
        render(
          <App
            apiKey={modelConfig.apiKey}
            baseURL={modelConfig.baseURL}
            model={modelConfig.model}
            initialMessage={initialMessage}
            debug={args.debug}
            permissionMode={args.permissionMode}
          />,
          {
            exitOnCtrlC: true,
          },
        )
      },
    )

  // 10. 解析参数
  await cli.parse()
}

// 运行主函数
main().catch((error) => {
  console.error('Fatal error:', error.message)
  if (isDebugMode && error.stack) {
    console.error('\nStack trace:')
    console.error(error.stack)
  }
  process.exit(1)
})
