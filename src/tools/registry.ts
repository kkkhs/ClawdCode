/**
 * 工具注册表
 * 
 * 管理所有工具的注册、查询和分类
 */

import { EventEmitter } from 'events';
import type { Tool, FunctionDeclaration } from './types.js';

/**
 * 工具注册事件
 */
export interface ToolRegisteredEvent {
  type: 'builtin' | 'mcp';
  tool: Tool;
}

/**
 * 工具注册表
 */
export class ToolRegistry extends EventEmitter {
  /** 内置工具 */
  private tools = new Map<string, Tool>();
  
  /** MCP 工具 */
  private mcpTools = new Map<string, Tool>();
  
  /** 分类索引 */
  private categories = new Map<string, Set<string>>();
  
  /** 标签索引 */
  private tagIndex = new Map<string, Set<string>>();

  /**
   * 注册内置工具
   */
  register(tool: Tool): void {
    if (this.tools.has(tool.name) || this.mcpTools.has(tool.name)) {
      throw new Error(`工具 '${tool.name}' 已注册`);
    }
    
    this.tools.set(tool.name, tool);
    this.updateIndexes(tool);
    this.emit('toolRegistered', { type: 'builtin', tool } as ToolRegisteredEvent);
  }

  /**
   * 注册 MCP 工具
   */
  registerMcpTool(tool: Tool): void {
    if (this.tools.has(tool.name) || this.mcpTools.has(tool.name)) {
      throw new Error(`工具 '${tool.name}' 已注册`);
    }
    
    this.mcpTools.set(tool.name, tool);
    this.updateIndexes(tool);
    this.emit('toolRegistered', { type: 'mcp', tool } as ToolRegisteredEvent);
  }

  /**
   * 批量注册 MCP 工具
   */
  registerMcpTools(tools: Tool[]): void {
    for (const tool of tools) {
      this.registerMcpTool(tool);
    }
  }

  /**
   * 注销 MCP 工具
   */
  unregisterMcpTool(name: string): boolean {
    const tool = this.mcpTools.get(name);
    if (!tool) return false;

    this.mcpTools.delete(name);
    this.removeFromIndexes(tool);
    this.emit('toolUnregistered', { type: 'mcp', tool });
    return true;
  }

  /**
   * 清空所有 MCP 工具
   */
  clearMcpTools(): void {
    for (const tool of this.mcpTools.values()) {
      this.removeFromIndexes(tool);
    }
    this.mcpTools.clear();
  }

  /**
   * 批量注册工具
   */
  registerAll(tools: Tool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * 获取工具（内置或 MCP）
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name) || this.mcpTools.get(name);
  }

  /**
   * 检查工具是否存在
   */
  has(name: string): boolean {
    return this.tools.has(name) || this.mcpTools.has(name);
  }

  /**
   * 获取所有工具（内置 + MCP）
   */
  getAll(): Tool[] {
    return [...this.tools.values(), ...this.mcpTools.values()];
  }

  /**
   * 获取所有内置工具
   */
  getBuiltinTools(): Tool[] {
    return [...this.tools.values()];
  }

  /**
   * 获取所有 MCP 工具
   */
  getMcpTools(): Tool[] {
    return [...this.mcpTools.values()];
  }

  /**
   * 获取所有工具名称
   */
  getNames(): string[] {
    return [...this.tools.keys(), ...this.mcpTools.keys()];
  }

  /**
   * 获取只读工具
   */
  getReadOnlyTools(): Tool[] {
    return this.getAll().filter(tool => tool.isReadOnly);
  }

  /**
   * 获取写工具
   */
  getWriteTools(): Tool[] {
    return this.getAll().filter(tool => !tool.isReadOnly);
  }

  /**
   * 按分类获取工具
   */
  getByCategory(category: string): Tool[] {
    const names = this.categories.get(category);
    if (!names) return [];
    return [...names].map(name => this.tools.get(name)!).filter(Boolean);
  }

  /**
   * 按标签获取工具
   */
  getByTag(tag: string): Tool[] {
    const names = this.tagIndex.get(tag);
    if (!names) return [];
    return [...names].map(name => this.tools.get(name)!).filter(Boolean);
  }

  /**
   * 获取所有分类
   */
  getCategories(): string[] {
    return [...this.categories.keys()];
  }

  /**
   * 获取所有标签
   */
  getTags(): string[] {
    return [...this.tagIndex.keys()];
  }

  /**
   * 获取函数声明（用于传递给 LLM）
   */
  getFunctionDeclarations(): FunctionDeclaration[] {
    return this.getAll().map(tool => tool.getFunctionDeclaration());
  }

  /**
   * 根据权限模式获取函数声明
   */
  getFunctionDeclarationsByMode(mode?: string): FunctionDeclaration[] {
    if (mode === 'plan') {
      // Plan 模式只返回只读工具
      return this.getReadOnlyTools().map(t => t.getFunctionDeclaration());
    }
    return this.getFunctionDeclarations();
  }

  /**
   * 搜索工具
   */
  search(query: string): Tool[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter(tool => 
      tool.name.toLowerCase().includes(lowerQuery) ||
      tool.displayName.toLowerCase().includes(lowerQuery) ||
      tool.description.short.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * 获取工具数量（内置 + MCP）
   */
  get size(): number {
    return this.tools.size + this.mcpTools.size;
  }

  /**
   * 获取内置工具数量
   */
  get builtinSize(): number {
    return this.tools.size;
  }

  /**
   * 获取 MCP 工具数量
   */
  get mcpSize(): number {
    return this.mcpTools.size;
  }

  /**
   * 清空所有工具
   */
  clear(): void {
    this.tools.clear();
    this.mcpTools.clear();
    this.categories.clear();
    this.tagIndex.clear();
  }

  /**
   * 更新索引
   */
  private updateIndexes(tool: Tool): void {
    // 更新分类索引
    if (tool.category) {
      if (!this.categories.has(tool.category)) {
        this.categories.set(tool.category, new Set());
      }
      this.categories.get(tool.category)!.add(tool.name);
    }

    // 更新标签索引
    for (const tag of tool.tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(tool.name);
    }
  }

  /**
   * 从索引中移除工具
   */
  private removeFromIndexes(tool: Tool): void {
    // 从分类索引中移除
    if (tool.category) {
      const categorySet = this.categories.get(tool.category);
      if (categorySet) {
        categorySet.delete(tool.name);
        if (categorySet.size === 0) {
          this.categories.delete(tool.category);
        }
      }
    }

    // 从标签索引中移除
    for (const tag of tool.tags) {
      const tagSet = this.tagIndex.get(tag);
      if (tagSet) {
        tagSet.delete(tool.name);
        if (tagSet.size === 0) {
          this.tagIndex.delete(tag);
        }
      }
    }
  }
}

/**
 * 创建默认的工具注册表实例
 */
export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry();
}
