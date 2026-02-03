/**
 * SimpleAgent - 最简单的 LLM 交互实现
 * 
 * 这是 Hello World 级别的 Agent，用于验证环境配置是否正确。
 * 后续章节会逐步演进为完整的 Coding Agent。
 */

import OpenAI from 'openai';

export interface AgentConfig {
  apiKey: string;
  baseURL?: string;
  model?: string;
}

export class SimpleAgent {
  private client: OpenAI;
  private model: string;

  constructor(config: AgentConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
    this.model = config.model || 'gpt-4';
  }

  /**
   * 发送消息并获取回复
   */
  async chat(message: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: 'You are a helpful coding assistant. Be concise and helpful.',
        },
        {
          role: 'user',
          content: message,
        },
      ],
    });

    return response.choices[0]?.message?.content || '';
  }
}
