/**
 * 上下文管理测试
 */

import { TokenCounter } from './TokenCounter.js';
import { MemoryStore } from './storage/MemoryStore.js';
import { CacheStore } from './storage/CacheStore.js';
import { JSONLStore } from './storage/JSONLStore.js';
import { FileAnalyzer } from './FileAnalyzer.js';
import { CompactionService } from './CompactionService.js';
import { escapeProjectPath, getProjectStoragePath } from './storage/pathUtils.js';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import type { ContextData, ContextMessage, JSONLEntry } from './types.js';
import type { Message } from '../agent/types.js';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      console.log(`✅ ${name}`);
      passed++;
    } catch (error) {
      console.log(`❌ ${name}`);
      console.error('  ', error instanceof Error ? error.message : error);
      failed++;
    }
  })();
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function runTests() {
  console.log('\n=== 上下文管理测试 ===\n');

  // TokenCounter 测试
  await test('TokenCounter: 计算文本 Token 数量', () => {
    const tokens = TokenCounter.estimateTokens('Hello, world!');
    assert(tokens > 0, 'Token 数量应该大于 0');
  });

  await test('TokenCounter: 中英文混合估算', () => {
    const text = 'Hello 你好 World 世界';
    const tokens = TokenCounter.estimateTokens(text);
    assert(tokens > 0, 'Token 数量应该大于 0');
  });

  await test('TokenCounter: 计算消息 Token', () => {
    const messages: Message[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ];
    const tokens = TokenCounter.countTokens(messages, 'gpt-4');
    assert(tokens > 0, 'Token 数量应该大于 0');
  });

  await test('TokenCounter: shouldCompact 检测', () => {
    const messages: Message[] = [
      { role: 'user', content: 'Hello' },
    ];
    const shouldCompact = TokenCounter.shouldCompact(messages, 'gpt-4', 100, 0.8);
    // 消息很短，不应该触发压缩
    assert(!shouldCompact, '短消息不应该触发压缩');
  });

  // MemoryStore 测试
  await test('MemoryStore: 初始化和设置上下文', () => {
    const store = new MemoryStore(100);
    const contextData: ContextData = {
      layers: {
        system: { osType: 'test', osVersion: '1.0', shell: 'bash', nodeVersion: 'v18', cwd: '/' },
        session: { sessionId: 'test-123', preferences: {}, startTime: Date.now() },
        conversation: { messages: [], topics: [], lastActivity: Date.now() },
        tool: { recentCalls: [], toolStates: {}, dependencies: {} },
        workspace: { projectPath: '/' },
      },
      metadata: { totalTokens: 0, priority: 1, lastUpdated: Date.now() },
    };
    store.setContext(contextData);
    assert(store.hasData(), '应该有数据');
    assert(store.getSessionId() === 'test-123', '会话 ID 应该匹配');
  });

  await test('MemoryStore: 添加消息', () => {
    const store = new MemoryStore(100);
    const contextData: ContextData = {
      layers: {
        system: { osType: 'test', osVersion: '1.0', shell: 'bash', nodeVersion: 'v18', cwd: '/' },
        session: { sessionId: 'test', preferences: {}, startTime: Date.now() },
        conversation: { messages: [], topics: [], lastActivity: Date.now() },
        tool: { recentCalls: [], toolStates: {}, dependencies: {} },
        workspace: { projectPath: '/' },
      },
      metadata: { totalTokens: 0, priority: 1, lastUpdated: Date.now() },
    };
    store.setContext(contextData);

    const message: ContextMessage = {
      id: 'msg-1',
      role: 'user',
      content: 'Hello',
      timestamp: Date.now(),
    };
    store.addMessage(message);

    const messages = store.getMessages();
    assert(messages.length === 1, '应该有 1 条消息');
    assert(messages[0].content === 'Hello', '消息内容应该匹配');
  });

  await test('MemoryStore: 内存限制', () => {
    const store = new MemoryStore(5); // 最多 5 条消息
    const contextData: ContextData = {
      layers: {
        system: { osType: 'test', osVersion: '1.0', shell: 'bash', nodeVersion: 'v18', cwd: '/' },
        session: { sessionId: 'test', preferences: {}, startTime: Date.now() },
        conversation: { messages: [], topics: [], lastActivity: Date.now() },
        tool: { recentCalls: [], toolStates: {}, dependencies: {} },
        workspace: { projectPath: '/' },
      },
      metadata: { totalTokens: 0, priority: 1, lastUpdated: Date.now() },
    };
    store.setContext(contextData);

    // 添加 10 条消息
    for (let i = 0; i < 10; i++) {
      store.addMessage({
        id: `msg-${i}`,
        role: 'user',
        content: `Message ${i}`,
        timestamp: Date.now(),
      });
    }

    const messages = store.getMessages();
    assert(messages.length <= 5, '消息数量应该被限制');
  });

  // CacheStore 测试
  await test('CacheStore: 设置和获取', () => {
    const cache = new CacheStore(10, 1000);
    cache.set('key1', 'value1');
    const value = cache.get<string>('key1');
    assert(value === 'value1', '值应该匹配');
  });

  await test('CacheStore: TTL 过期', async () => {
    const cache = new CacheStore(10, 50); // 50ms TTL
    cache.set('key1', 'value1');
    await new Promise(r => setTimeout(r, 100)); // 等待 100ms
    const value = cache.get<string>('key1');
    assert(value === undefined, '过期后应该返回 undefined');
  });

  await test('CacheStore: LRU 淘汰', () => {
    const cache = new CacheStore(3, 10000);
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');
    
    // 访问 key2 和 key3 使它们成为最近使用（key1 最久未使用）
    cache.get('key2');
    cache.get('key3');
    
    // 添加新项，应该淘汰 key1（最久未使用）
    cache.set('key4', 'value4');
    
    assert(cache.has('key2'), 'key2 应该存在');
    assert(cache.has('key3'), 'key3 应该存在');
    assert(cache.has('key4'), 'key4 应该存在');
  });

  // 路径工具函数测试
  await test('pathUtils: escapeProjectPath', () => {
    const escaped = escapeProjectPath('/Users/foo/project');
    assert(!escaped.includes('/'), '不应该包含斜杠');
    assert(escaped.includes('Users'), '应该包含 Users');
  });

  await test('pathUtils: getProjectStoragePath', () => {
    const storagePath = getProjectStoragePath('/Users/foo/project');
    assert(storagePath.includes('.clawdcode'), '应该包含 .clawdcode');
    assert(storagePath.includes('projects'), '应该包含 projects');
  });

  // JSONLStore 测试
  const testDir = path.join(os.tmpdir(), 'clawdcode-test-' + Date.now());
  const testFile = path.join(testDir, 'test.jsonl');

  await test('JSONLStore: 追加和读取', async () => {
    const store = new JSONLStore(testFile);
    
    const entry: JSONLEntry = {
      uuid: 'test-uuid',
      parentUuid: null,
      sessionId: 'test-session',
      timestamp: new Date().toISOString(),
      type: 'user',
      cwd: '/test',
      version: '0.1.0',
      message: { role: 'user', content: 'Hello' },
    };

    await store.append(entry);
    const entries = await store.readAll();
    
    assert(entries.length === 1, '应该有 1 条记录');
    assert(entries[0].uuid === 'test-uuid', 'UUID 应该匹配');
  });

  await test('JSONLStore: 批量追加', async () => {
    const store = new JSONLStore(testFile);
    
    const entries: JSONLEntry[] = [
      {
        uuid: 'batch-1',
        parentUuid: null,
        sessionId: 'test-session',
        timestamp: new Date().toISOString(),
        type: 'user',
        cwd: '/test',
        version: '0.1.0',
        message: { role: 'user', content: 'Message 1' },
      },
      {
        uuid: 'batch-2',
        parentUuid: 'batch-1',
        sessionId: 'test-session',
        timestamp: new Date().toISOString(),
        type: 'assistant',
        cwd: '/test',
        version: '0.1.0',
        message: { role: 'assistant', content: 'Message 2' },
      },
    ];

    await store.appendBatch(entries);
    const all = await store.readAll();
    
    // 之前有 1 条，现在加 2 条
    assert(all.length === 3, '应该有 3 条记录');
  });

  // FileAnalyzer 测试
  await test('FileAnalyzer: 分析消息中的文件', () => {
    const messages: Message[] = [
      { role: 'user', content: '请帮我看看 src/index.ts 文件' },
      { role: 'assistant', content: '好的，让我读取这个文件', tool_calls: [
        { id: 'tc1', type: 'function', function: { name: 'Read', arguments: JSON.stringify({ file_path: 'src/index.ts' }) } }
      ]},
    ];

    const fileRefs = FileAnalyzer.analyzeFiles(messages);
    // 文件可能不存在，所以这里只检查逻辑是否正确执行
    assert(Array.isArray(fileRefs), '应该返回数组');
  });

  // CompactionService 测试
  await test('CompactionService: shouldCompact', () => {
    const messages: Message[] = [
      { role: 'user', content: 'Hello' },
    ];
    const should = CompactionService.shouldCompact(messages, 'gpt-4', 100000);
    assert(!should, '短消息不应该触发压缩');
  });

  await test('CompactionService: 压缩降级', async () => {
    const messages: Message[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
      { role: 'user', content: 'How are you?' },
    ];

    const result = await CompactionService.compact(messages, {
      trigger: 'manual',
      modelName: 'gpt-4',
      maxContextTokens: 100000,
      // 不提供 chatService，会使用降级策略
    });

    assert(result.compactedMessages.length > 0, '应该有压缩后的消息');
    assert(result.preTokens > 0, '应该有压缩前的 Token 数');
  });

  // 清理测试文件
  try {
    await fs.rm(testDir, { recursive: true });
  } catch {
    // 忽略清理错误
  }

  // 输出结果
  console.log('\n---');
  console.log(`测试完成: ${passed} 通过, ${failed} 失败`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(console.error);
