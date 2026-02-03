/**
 * 环境上下文工具
 * 
 * 动态生成系统环境信息，每次构建提示词时重新生成
 */

import os from 'os';

/**
 * 环境信息接口
 */
export interface EnvironmentInfo {
  workingDirectory: string;
  homeDirectory: string;
  platform: string;
  nodeVersion: string;
  currentDate: string;
  shell: string;
  username: string;
}

/**
 * 获取环境信息
 */
export function getEnvironmentInfo(): EnvironmentInfo {
  return {
    workingDirectory: process.cwd(),
    homeDirectory: os.homedir(),
    platform: `${os.platform()} ${os.release()}`,
    nodeVersion: process.version,
    currentDate: new Date().toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    }),
    shell: process.env.SHELL || 'unknown',
    username: os.userInfo().username,
  };
}

/**
 * 生成环境上下文提示词
 * 
 * 包含工作目录、系统信息、文件路径指南
 */
export function getEnvironmentContext(): string {
  const env = getEnvironmentInfo();

  return `# Environment Context

## Working Directory
**Current**: \`${env.workingDirectory}\`
**Home**: \`${env.homeDirectory}\`

## System Information
- **Platform**: ${env.platform}
- **Node.js**: ${env.nodeVersion}
- **Shell**: ${env.shell}
- **Date**: ${env.currentDate}

## File Path Guidelines
When using file tools, provide **absolute paths**:
- ✅ Correct: \`${env.workingDirectory}/package.json\`
- ❌ Incorrect: \`package.json\` (relative path)

The working directory is the root for all relative references.`;
}
