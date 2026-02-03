/**
 * 提示词系统测试脚本
 * 
 * 运行: bun run src/prompts/test.ts
 */

import { buildSystemPrompt, getPromptStats } from './builder.js';
import { getEnvironmentContext, getEnvironmentInfo } from '../utils/environment.js';
import { DEFAULT_SYSTEM_PROMPT } from './default.js';
import { PLAN_MODE_SYSTEM_PROMPT, createPlanModeReminder } from './plan.js';

async function testPromptSystem() {
  console.log('=== 提示词系统测试 ===\n');

  // 1. 测试环境上下文
  console.log('1. 环境信息:');
  const envInfo = getEnvironmentInfo();
  console.log(`   工作目录: ${envInfo.workingDirectory}`);
  console.log(`   平台: ${envInfo.platform}`);
  console.log(`   日期: ${envInfo.currentDate}`);
  console.log();

  // 2. 测试环境上下文生成
  console.log('2. 环境上下文 (前 300 字符):');
  const envContext = getEnvironmentContext();
  console.log(envContext.slice(0, 300) + '...\n');

  // 3. 测试默认提示词
  console.log('3. 默认提示词长度:', DEFAULT_SYSTEM_PROMPT.length, '字符');
  console.log('   包含关键词:');
  console.log('   - ClawdCode:', DEFAULT_SYSTEM_PROMPT.includes('ClawdCode') ? '✅' : '❌');
  console.log('   - 4 lines:', DEFAULT_SYSTEM_PROMPT.includes('4 lines') ? '✅' : '❌');
  console.log('   - Chinese:', DEFAULT_SYSTEM_PROMPT.includes('Chinese') ? '✅' : '❌');
  console.log();

  // 4. 测试 Plan 模式提示词
  console.log('4. Plan 模式提示词长度:', PLAN_MODE_SYSTEM_PROMPT.length, '字符');
  console.log('   包含关键词:');
  console.log('   - PLAN MODE:', PLAN_MODE_SYSTEM_PROMPT.includes('PLAN MODE') ? '✅' : '❌');
  console.log('   - Read-only:', PLAN_MODE_SYSTEM_PROMPT.includes('Read-only') ? '✅' : '❌');
  console.log();

  // 5. 测试消息提醒注入
  console.log('5. Plan 模式消息注入:');
  const reminder = createPlanModeReminder('帮我分析这段代码');
  console.log('   ' + reminder.slice(0, 100) + '...\n');

  // 6. 测试完整提示词构建（默认模式）
  console.log('6. 构建完整提示词（默认模式）:');
  const defaultResult = await buildSystemPrompt({
    projectPath: process.cwd(),
    includeEnvironment: true,
  });
  console.log(getPromptStats(defaultResult));
  console.log();

  // 7. 测试 Plan 模式提示词构建
  console.log('7. 构建完整提示词（Plan 模式）:');
  const planResult = await buildSystemPrompt({
    projectPath: process.cwd(),
    mode: 'plan',
    includeEnvironment: true,
  });
  console.log(getPromptStats(planResult));
  console.log();

  // 8. 测试自定义追加内容
  console.log('8. 构建带追加内容的提示词:');
  const appendResult = await buildSystemPrompt({
    append: '额外指令：始终使用 TypeScript',
  });
  console.log(getPromptStats(appendResult));
  console.log();

  console.log('=== 测试完成 ===');
}

testPromptSystem().catch(console.error);
