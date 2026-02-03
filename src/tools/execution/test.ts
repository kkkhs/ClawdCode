/**
 * 执行管道测试
 * 
 * 运行: bun run test:pipeline
 */

import { ExecutionPipeline, PermissionMode, type PipelineExecutionContext } from './index.js';
import { ToolRegistry, createToolRegistry, getBuiltinTools } from '../index.js';
import { PermissionChecker } from '../validation/PermissionChecker.js';
import { SensitiveFileDetector, SensitivityLevel } from '../validation/SensitiveFileDetector.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// ========== 测试辅助 ==========

let testDir: string;

async function setup() {
  testDir = path.join(os.tmpdir(), `pipeline-test-${Date.now()}`);
  await fs.mkdir(testDir, { recursive: true });
  
  // 创建测试文件
  await fs.writeFile(path.join(testDir, 'test.txt'), 'Hello, World!');
  await fs.writeFile(path.join(testDir, 'config.json'), '{"key": "value"}');
}

async function cleanup() {
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

function createTestContext(mode: PermissionMode = PermissionMode.DEFAULT): PipelineExecutionContext {
  return {
    sessionId: 'test-session',
    workspaceRoot: testDir,
    permissionMode: mode,
  };
}

// ========== 测试 ==========

async function testPermissionChecker() {
  console.log('\n1. 测试 PermissionChecker');
  
  const checker = new PermissionChecker({
    allow: ['Bash(npm:*)'],
    deny: ['Bash(rm -rf:*)'],
  });
  
  // 测试 allow 规则
  const allowResult = checker.check({
    toolName: 'Bash',
    params: { command: 'npm test' },
  });
  console.log(`   npm test: ${allowResult.result} (expected: allow)`);
  
  // 测试 deny 规则
  const denyResult = checker.check({
    toolName: 'Bash',
    params: { command: 'rm -rf /' },
  });
  console.log(`   rm -rf: ${denyResult.result} (expected: deny)`);
  
  // 测试默认 ASK
  const askResult = checker.check({
    toolName: 'Write',
    params: { file_path: '/tmp/test.txt' },
  });
  console.log(`   Write: ${askResult.result} (expected: ask)`);
}

async function testSensitiveFileDetector() {
  console.log('\n2. 测试 SensitiveFileDetector');
  
  // 高敏感
  const envResult = SensitiveFileDetector.check('.env');
  console.log(`   .env: ${envResult.level} (expected: high)`);
  
  // 中敏感
  const logResult = SensitiveFileDetector.check('app.log');
  console.log(`   app.log: ${logResult.level} (expected: medium)`);
  
  // 低敏感
  const configResult = SensitiveFileDetector.check('config.json');
  console.log(`   config.json: ${configResult.level} (expected: low)`);
  
  // 非敏感
  const normalResult = SensitiveFileDetector.check('main.ts');
  console.log(`   main.ts: sensitive=${normalResult.sensitive} (expected: false)`);
  
  // 危险路径
  const dangerous = SensitiveFileDetector.isDangerousPath('/etc/passwd');
  console.log(`   /etc/passwd: dangerous=${dangerous} (expected: true)`);
}

async function testPipelineReadOnly() {
  console.log('\n3. 测试只读工具执行');
  
  const registry = createToolRegistry();
  const builtinTools = getBuiltinTools();
  for (const tool of builtinTools) {
    registry.register(tool);
  }
  
  const pipeline = new ExecutionPipeline(registry);
  const context = createTestContext();
  
  // 测试 Read 工具
  const testFile = path.join(testDir, 'test.txt');
  const readResult = await pipeline.execute('Read', { file_path: testFile }, context);
  console.log(`   Read: success=${readResult.success}, content includes 'Hello'=${readResult.llmContent.includes('Hello')}`);
  
  // 测试 Glob 工具
  const globResult = await pipeline.execute('Glob', { pattern: '*.txt', path: testDir }, context);
  console.log(`   Glob: success=${globResult.success}, found files=${globResult.llmContent.includes('test.txt')}`);
}

async function testPermissionModes() {
  console.log('\n4. 测试权限模式');
  
  const registry = createToolRegistry();
  const builtinTools = getBuiltinTools();
  for (const tool of builtinTools) {
    registry.register(tool);
  }
  
  const pipeline = new ExecutionPipeline(registry);
  const testFile = path.join(testDir, 'write-test.txt');
  
  // PLAN 模式：Write 应该被拒绝
  const planContext = createTestContext(PermissionMode.PLAN);
  const planResult = await pipeline.execute(
    'Write',
    { file_path: testFile, contents: 'test' },
    planContext
  );
  console.log(`   PLAN + Write: success=${planResult.success} (expected: false)`);
  
  // YOLO 模式：Write 应该自动批准
  const yoloContext = createTestContext(PermissionMode.YOLO);
  const yoloResult = await pipeline.execute(
    'Write',
    { file_path: testFile, contents: 'YOLO test' },
    yoloContext
  );
  console.log(`   YOLO + Write: success=${yoloResult.success} (expected: true)`);
  
  // 验证文件内容
  const content = await fs.readFile(testFile, 'utf8');
  console.log(`   File content correct: ${content === 'YOLO test'}`);
}

async function testPipelineStages() {
  console.log('\n5. 测试管道阶段事件');
  
  const registry = createToolRegistry();
  const builtinTools = getBuiltinTools();
  for (const tool of builtinTools) {
    registry.register(tool);
  }
  
  const pipeline = new ExecutionPipeline(registry);
  const context = createTestContext(PermissionMode.YOLO);
  
  const stagesExecuted: string[] = [];
  
  pipeline.on('stageStart', ({ stage }) => {
    stagesExecuted.push(stage);
  });
  
  const testFile = path.join(testDir, 'test.txt');
  await pipeline.execute('Read', { file_path: testFile }, context);
  
  console.log(`   Stages: ${stagesExecuted.join(' → ')}`);
  console.log(`   All 7 stages executed: ${stagesExecuted.length === 7}`);
}

async function testExecutionHistory() {
  console.log('\n6. 测试执行历史');
  
  const registry = createToolRegistry();
  const builtinTools = getBuiltinTools();
  for (const tool of builtinTools) {
    registry.register(tool);
  }
  
  const pipeline = new ExecutionPipeline(registry);
  const context = createTestContext(PermissionMode.YOLO);
  
  // 执行几个操作
  const testFile = path.join(testDir, 'test.txt');
  await pipeline.execute('Read', { file_path: testFile }, context);
  await pipeline.execute('Glob', { pattern: '*', path: testDir }, context);
  
  const history = pipeline.getHistory();
  console.log(`   History entries: ${history.length} (expected: 2)`);
  console.log(`   First entry tool: ${history[0]?.toolName} (expected: Read)`);
}

async function testSessionApprovals() {
  console.log('\n7. 测试会话批准');
  
  const registry = createToolRegistry();
  const builtinTools = getBuiltinTools();
  for (const tool of builtinTools) {
    registry.register(tool);
  }
  
  const pipeline = new ExecutionPipeline(registry);
  
  // 手动添加会话批准
  pipeline.addSessionApproval('Write(/tmp/approved.txt)');
  
  console.log(`   Has approval: ${pipeline.hasSessionApproval('Write(/tmp/approved.txt)')} (expected: true)`);
  console.log(`   No approval: ${pipeline.hasSessionApproval('Write(/tmp/other.txt)')} (expected: false)`);
  
  // 清除
  pipeline.clearSessionApprovals();
  console.log(`   After clear: ${pipeline.hasSessionApproval('Write(/tmp/approved.txt)')} (expected: false)`);
}

async function testBashTool() {
  console.log('\n8. 测试 Bash 工具');
  
  const registry = createToolRegistry();
  const builtinTools = getBuiltinTools();
  for (const tool of builtinTools) {
    registry.register(tool);
  }
  
  const pipeline = new ExecutionPipeline(registry);
  const context = createTestContext(PermissionMode.YOLO);
  
  // 简单命令
  const echoResult = await pipeline.execute(
    'Bash',
    { command: 'echo "Pipeline Test"' },
    context
  );
  console.log(`   echo: success=${echoResult.success}, output includes 'Pipeline Test'=${echoResult.llmContent.includes('Pipeline Test')}`);
}

// ========== 主函数 ==========

async function main() {
  console.log('=== 执行管道测试 ===');
  
  try {
    await setup();
    
    await testPermissionChecker();
    await testSensitiveFileDetector();
    await testPipelineReadOnly();
    await testPermissionModes();
    await testPipelineStages();
    await testExecutionHistory();
    await testSessionApprovals();
    await testBashTool();
    
    console.log('\n=== 测试完成 ===');
  } finally {
    await cleanup();
  }
}

main().catch(console.error);
