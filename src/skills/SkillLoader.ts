/**
 * SkillLoader - SKILL.md 文件解析器
 * 
 * 解析 SKILL.md 文件的 YAML Frontmatter 和 Markdown 正文
 */

import * as yaml from 'yaml';
import type { ParsedSkillFile, SkillFrontmatter } from './types.js';

/**
 * 验证 Skill 名称格式
 * 只能包含小写字母、数字和连字符，1-64 字符
 */
export function isValidSkillName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  if (name.length < 1 || name.length > 64) return false;
  return /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(name);
}

/**
 * 验证 description 长度
 */
export function isValidDescription(description: string): boolean {
  if (!description || typeof description !== 'string') return false;
  return description.length <= 1024;
}

/**
 * 解析 SKILL.md 文件内容
 * 
 * @param content - 文件内容
 * @returns 解析后的 frontmatter 和 body
 * @throws 如果格式无效或缺少必填字段
 */
export function parseSkillFile(content: string): ParsedSkillFile {
  // 匹配 YAML Frontmatter
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    throw new Error('Invalid SKILL.md format: missing YAML frontmatter (must start with ---)');
  }

  const [, frontmatterStr, body] = match;

  // 解析 YAML
  let frontmatter: SkillFrontmatter;
  try {
    frontmatter = yaml.parse(frontmatterStr);
  } catch (error) {
    throw new Error(`Invalid YAML in frontmatter: ${(error as Error).message}`);
  }

  // 验证必填字段: name
  if (!frontmatter.name || typeof frontmatter.name !== 'string') {
    throw new Error('SKILL.md must have a "name" field');
  }
  
  if (!isValidSkillName(frontmatter.name)) {
    throw new Error(
      `Invalid skill name "${frontmatter.name}": must be 1-64 characters, ` +
      'lowercase letters, numbers, and hyphens only'
    );
  }

  // 验证必填字段: description
  if (!frontmatter.description || typeof frontmatter.description !== 'string') {
    throw new Error('SKILL.md must have a "description" field');
  }
  
  if (!isValidDescription(frontmatter.description)) {
    throw new Error('Skill description must be 1024 characters or less');
  }

  // 验证可选字段类型
  if (frontmatter['allowed-tools'] !== undefined) {
    if (!Array.isArray(frontmatter['allowed-tools'])) {
      throw new Error('"allowed-tools" must be an array');
    }
    for (const tool of frontmatter['allowed-tools']) {
      if (typeof tool !== 'string') {
        throw new Error('"allowed-tools" must contain only strings');
      }
    }
  }

  if (frontmatter['user-invocable'] !== undefined) {
    if (typeof frontmatter['user-invocable'] !== 'boolean') {
      throw new Error('"user-invocable" must be a boolean');
    }
  }

  if (frontmatter['disable-model-invocation'] !== undefined) {
    if (typeof frontmatter['disable-model-invocation'] !== 'boolean') {
      throw new Error('"disable-model-invocation" must be a boolean');
    }
  }

  return {
    frontmatter,
    body: body.trim(),
  };
}

/**
 * 从 Frontmatter 提取元数据字段
 */
export function extractMetadataFields(frontmatter: SkillFrontmatter): {
  allowedTools?: string[];
  argumentHint?: string;
  userInvocable: boolean;
  disableModelInvocation: boolean;
  model?: string;
  whenToUse?: string;
  version?: string;
} {
  return {
    allowedTools: frontmatter['allowed-tools'],
    argumentHint: frontmatter['argument-hint'],
    userInvocable: frontmatter['user-invocable'] ?? false,
    disableModelInvocation: frontmatter['disable-model-invocation'] ?? false,
    model: frontmatter.model,
    whenToUse: frontmatter.when_to_use,
    version: frontmatter.version,
  };
}
