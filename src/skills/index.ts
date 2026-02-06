/**
 * Skills 模块
 * 
 * Skills 是一种核心扩展机制，允许通过 Markdown 文件（SKILL.md）定义专业能力。
 * 支持 AI 自动调用和用户手动调用（/skill-name）两种方式。
 * 
 * 使用渐进式披露设计：
 * 1. 发现阶段：系统提示仅包含 Skills 名称和描述
 * 2. 激活阶段：AI 判断需要某个 Skill 时调用 Skill 工具
 * 3. 加载阶段：按需加载完整 SKILL.md 内容
 */

export * from './types.js';
export * from './SkillLoader.js';
export { SkillRegistry, getSkillRegistry } from './SkillRegistry.js';

// 便捷初始化函数
import { getSkillRegistry } from './SkillRegistry.js';

/**
 * 初始化 Skills 系统
 * 
 * @param workspaceRoot - 工作区根目录
 * @returns 发现结果
 */
export async function initializeSkills(workspaceRoot?: string) {
  const registry = getSkillRegistry();
  return registry.initialize(workspaceRoot);
}

/**
 * 加载 Skill 完整内容
 * 
 * @param name - Skill 名称
 * @returns Skill 内容，如果不存在返回 null
 */
export async function loadSkillContent(name: string) {
  const registry = getSkillRegistry();
  return registry.loadContent(name);
}

/**
 * 生成可用 Skills 列表（用于系统提示）
 */
export function generateSkillsPrompt(): string {
  const registry = getSkillRegistry();
  return registry.generateAvailableSkillsList();
}
