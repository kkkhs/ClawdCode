/**
 * 工具系统测试脚本
 * 
 * 运行: bun run src/tools/test.ts
 */

import { ToolRegistry, getBuiltinTools, ToolKind, createTool } from './index.js';
import { z } from 'zod';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

async function testToolSystem() {
  console.log('=== 工具系统测试 ===\n');

  // 1. 创建注册表并注册内置工具
  console.log('1. 创建工具注册表并注册内置工具');
  const registry = new ToolRegistry();
  const builtinTools = getBuiltinTools();
  registry.registerAll(builtinTools);
  console.log(`   已注册 ${registry.size} 个工具: ${registry.getNames().join(', ')}`);
  console.log(`   - 内置工具: ${registry.builtinSize}`);
  console.log(`   - MCP 工具: ${registry.mcpSize}\n`);

  // 2. 测试工具获取
  console.log('2. 测试工具获取');
  const readTool = registry.get('Read');
  console.log(`   Read 工具: ${readTool ? '✅ 存在' : '❌ 不存在'}`);
  console.log(`   - 类型: ${readTool?.kind}`);
  console.log(`   - 只读: ${readTool?.isReadOnly}`);
  console.log(`   - 并发安全: ${readTool?.isConcurrencySafe}`);
  console.log(`   - 分类: ${readTool?.category}`);
  console.log(`   - 标签: ${readTool?.tags.join(', ')}\n`);

  // 3. 测试只读/写入工具过滤
  console.log('3. 测试只读/写入工具过滤');
  const readOnlyTools = registry.getReadOnlyTools();
  const writeTools = registry.getWriteTools();
  console.log(`   只读工具: ${readOnlyTools.map(t => t.name).join(', ')}`);
  console.log(`   写入工具: ${writeTools.map(t => t.name).join(', ')}\n`);

  // 4. 测试函数声明生成
  console.log('4. 测试函数声明生成');
  const declarations = registry.getFunctionDeclarations();
  for (const decl of declarations) {
    console.log(`   ${decl.name}:`);
    console.log(`     描述: ${decl.description.slice(0, 60)}...`);
    console.log(`     参数: ${Object.keys(decl.parameters.properties || {}).join(', ')}`);
  }
  console.log();

  // 5. 测试 Plan 模式函数声明
  console.log('5. 测试 Plan 模式函数声明');
  const planDeclarations = registry.getFunctionDeclarationsByMode('plan');
  console.log(`   Plan 模式工具数: ${planDeclarations.length}`);
  console.log(`   Plan 模式工具: ${planDeclarations.map(d => d.name).join(', ')}\n`);

  // 6. 测试 Read 工具执行
  console.log('6. 测试 Read 工具执行');
  if (readTool) {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const result = await readTool.execute({ file_path: packageJsonPath });
    console.log(`   结果: ${result.success ? '✅ 成功' : '❌ 失败'}`);
    console.log(`   显示内容: ${result.displayContent}`);
    console.log(`   LLM 内容长度: ${result.llmContent.length} 字符\n`);
  }

  // 7. 测试 Edit 工具
  console.log('7. 测试 Edit 工具');
  const editTool = registry.get('Edit');
  if (editTool) {
    // 创建临时文件
    const tmpDir = os.tmpdir();
    const testFile = path.join(tmpDir, `clawdcode-test-${Date.now()}.txt`);
    await fs.writeFile(testFile, 'Hello World\nFoo Bar\n', 'utf8');
    
    // 测试编辑
    const result = await editTool.execute({
      file_path: testFile,
      old_string: 'World',
      new_string: 'ClawdCode',
    });
    console.log(`   结果: ${result.success ? '✅ 成功' : '❌ 失败'}`);
    console.log(`   显示内容: ${result.displayContent}`);
    
    // 验证内容
    const content = await fs.readFile(testFile, 'utf8');
    console.log(`   验证: ${content.includes('ClawdCode') ? '✅ 替换正确' : '❌ 替换失败'}`);
    
    // 测试多重匹配
    await fs.writeFile(testFile, 'AAA BBB AAA', 'utf8');
    const multiResult = await editTool.execute({
      file_path: testFile,
      old_string: 'AAA',
      new_string: 'CCC',
    });
    console.log(`   多重匹配: ${multiResult.success ? '❌ 应该失败' : '✅ 正确拒绝'}`);
    
    // 清理
    await fs.unlink(testFile);
    console.log();
  }

  // 8. 测试 Write 工具
  console.log('8. 测试 Write 工具');
  const writeTool = registry.get('Write');
  if (writeTool) {
    const tmpDir = os.tmpdir();
    const testFile = path.join(tmpDir, `clawdcode-write-${Date.now()}.txt`);
    
    const result = await writeTool.execute({
      file_path: testFile,
      contents: 'Test content\nLine 2\n',
    });
    console.log(`   结果: ${result.success ? '✅ 成功' : '❌ 失败'}`);
    console.log(`   显示内容: ${result.displayContent}`);
    
    // 验证
    const exists = await fs.access(testFile).then(() => true).catch(() => false);
    console.log(`   文件存在: ${exists ? '✅ 是' : '❌ 否'}`);
    
    // 清理
    if (exists) await fs.unlink(testFile);
    console.log();
  }

  // 9. 测试 Bash 工具
  console.log('9. 测试 Bash 工具');
  const bashTool = registry.get('Bash');
  if (bashTool) {
    const result = await bashTool.execute({
      command: 'echo "Hello from Bash"',
      description: '测试 echo 命令',
    });
    console.log(`   结果: ${result.success ? '✅ 成功' : '❌ 失败'}`);
    console.log(`   显示内容: ${result.displayContent}`);
    console.log(`   输出: ${result.llmContent.trim()}`);
    
    // 测试失败命令
    const failResult = await bashTool.execute({
      command: 'exit 1',
    });
    console.log(`   失败命令: ${failResult.success ? '❌ 应该失败' : '✅ 正确失败'}\n`);
  }

  // 10. 测试 Glob 工具执行
  console.log('10. 测试 Glob 工具执行');
  const globTool = registry.get('Glob');
  if (globTool) {
    const result = await globTool.execute({ pattern: '*.ts', path: path.join(process.cwd(), 'src') });
    console.log(`   结果: ${result.success ? '✅ 成功' : '❌ 失败'}`);
    console.log(`   显示内容: ${result.displayContent}`);
    if (result.metadata?.count) {
      console.log(`   找到文件数: ${result.metadata.count}\n`);
    }
  }

  // 11. 测试 Grep 工具执行
  console.log('11. 测试 Grep 工具执行');
  const grepTool = registry.get('Grep');
  if (grepTool) {
    const result = await grepTool.execute({ 
      pattern: 'export', 
      include: '*.ts',
      path: path.join(process.cwd(), 'src/tools'),
    });
    console.log(`   结果: ${result.success ? '✅ 成功' : '❌ 失败'}`);
    console.log(`   显示内容: ${result.displayContent}`);
    if (result.metadata?.matches) {
      console.log(`   匹配数: ${result.metadata.matches}\n`);
    }
  }

  // 12. 测试 MCP 工具注册
  console.log('12. 测试 MCP 工具注册');
  const mockMcpTool = createTool({
    name: 'MockMcpTool',
    displayName: 'Mock MCP Tool',
    kind: ToolKind.ReadOnly,
    schema: z.object({ input: z.string() }),
    description: { short: 'A mock MCP tool for testing' },
    async execute(params) {
      return {
        success: true,
        llmContent: `Mock result for: ${params.input}`,
        displayContent: '✅ Mock MCP 工具执行成功',
      };
    },
  });
  
  registry.registerMcpTool(mockMcpTool);
  console.log(`   MCP 工具注册: ✅`);
  console.log(`   总工具数: ${registry.size}`);
  console.log(`   MCP 工具数: ${registry.mcpSize}`);
  console.log(`   获取 MCP 工具: ${registry.get('MockMcpTool') ? '✅ 存在' : '❌ 不存在'}`);
  
  // 测试注销
  registry.unregisterMcpTool('MockMcpTool');
  console.log(`   注销后: ${registry.get('MockMcpTool') ? '❌ 仍存在' : '✅ 已移除'}\n`);

  // 13. 测试 build 方法
  console.log('13. 测试 build 方法');
  if (readTool) {
    const invocation = readTool.build({ file_path: '/test/path.ts' });
    console.log(`   工具名: ${invocation.toolName}`);
    console.log(`   参数: ${JSON.stringify(invocation.params)}\n`);
  }

  // 14. 测试参数验证
  console.log('14. 测试参数验证');
  if (readTool) {
    const invalidResult = await readTool.execute({ file_path: '' });
    console.log(`   空路径测试: ${invalidResult.success ? '❌ 应该失败' : '✅ 正确失败'}`);
    console.log(`   错误信息: ${invalidResult.displayContent}\n`);
  }

  console.log('=== 测试完成 ===');
}

testToolSystem().catch(console.error);
