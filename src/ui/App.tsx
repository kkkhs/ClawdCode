/**
 * App.tsx - 主 UI 组件
 * 
 * 使用 Ink (React for CLI) 构建终端界面
 */

import React, { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { SimpleAgent } from '../agent/SimpleAgent.js';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AppProps {
  apiKey: string;
  baseURL?: string;
  model?: string;
}

export const App: React.FC<AppProps> = ({ apiKey, baseURL, model }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const agent = new SimpleAgent({ apiKey, baseURL, model });

  const handleSubmit = useCallback(async (value: string) => {
    if (!value.trim()) return;

    // 添加用户消息
    const userMessage: Message = { role: 'user', content: value };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const result = await agent.chat(value);
      const assistantMessage: Message = { role: 'assistant', content: result };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = { 
        role: 'assistant', 
        content: `Error: ${(error as Error).message}` 
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [agent]);

  return (
    <Box flexDirection="column" padding={1}>
      {/* 标题 */}
      <Box marginBottom={1}>
        <Text bold color="cyan">🤖 ClawdCode - Hello World Agent</Text>
      </Box>

      {/* 消息历史 */}
      <Box flexDirection="column" marginBottom={1}>
        {messages.map((msg, index) => (
          <Box key={index} marginBottom={1}>
            <Text color={msg.role === 'user' ? 'green' : 'blue'}>
              {msg.role === 'user' ? '> ' : '🤖 '}
            </Text>
            <Text wrap="wrap">{msg.content}</Text>
          </Box>
        ))}

        {/* 加载中 */}
        {isLoading && (
          <Box>
            <Text color="yellow">
              <Spinner type="dots" />
            </Text>
            <Text color="yellow"> Thinking...</Text>
          </Box>
        )}
      </Box>

      {/* 输入框 */}
      {!isLoading && (
        <Box>
          <Text color="green">{'> '}</Text>
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            placeholder="Ask me anything... (Ctrl+C to exit)"
          />
        </Box>
      )}
    </Box>
  );
};
