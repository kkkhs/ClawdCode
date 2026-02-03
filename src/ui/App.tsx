/**
 * App.tsx - 主 UI 组件
 * 
 * 使用 Ink (React for CLI) 构建终端界面
 * 
 * 启动流程：
 * 1. AppWrapper 等待版本检查完成
 * 2. 如果有新版本 → 显示 UpdatePrompt
 * 3. 用户跳过或无更新 → 初始化应用 → 显示主界面
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { SimpleAgent } from '../agent/SimpleAgent.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { UpdatePrompt } from './components/UpdatePrompt.js';
import type { PermissionMode } from '../cli/types.js';
import type { VersionCheckResult } from '../services/VersionChecker.js';

// ========== 类型定义 ==========

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface AppProps {
  apiKey: string;
  baseURL?: string;
  model?: string;
  initialMessage?: string;
  debug?: boolean;
  permissionMode?: PermissionMode;
  versionCheckPromise?: Promise<VersionCheckResult | null>;
}

// ========== 主界面组件 ==========

interface MainInterfaceProps {
  apiKey: string;
  baseURL?: string;
  model?: string;
  initialMessage?: string;
  debug?: boolean;
}

const MainInterface: React.FC<MainInterfaceProps> = ({ 
  apiKey, 
  baseURL, 
  model,
  initialMessage,
  debug,
}) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const initialMessageSent = useRef(false);

  const agent = new SimpleAgent({ apiKey, baseURL, model });

  const handleSubmit = useCallback(async (value: string) => {
    if (!value.trim()) return;

    // 添加用户消息
    const userMessage: Message = { role: 'user', content: value };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    if (debug) {
      console.log('[DEBUG] Sending message:', value);
    }

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
  }, [agent, debug]);

  // 处理初始消息
  useEffect(() => {
    if (initialMessage && !initialMessageSent.current) {
      initialMessageSent.current = true;
      handleSubmit(initialMessage);
    }
  }, [initialMessage, handleSubmit]);

  return (
    <Box flexDirection="column" padding={1}>
      {/* 标题 */}
      <Box marginBottom={1}>
        <Text bold color="cyan">🤖 ClawdCode - CLI Coding Agent</Text>
        {debug && <Text color="gray"> [DEBUG]</Text>}
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

// ========== AppWrapper 组件 ==========

/**
 * AppWrapper - 处理版本检查和初始化流程
 * 
 * 流程：
 * 1. 等待版本检查 Promise（已在 main.tsx 启动，与 yargs/middleware 并行）
 * 2. 如果有新版本 → 显示 UpdatePrompt
 * 3. 用户选择后 → 初始化应用 → 显示主界面
 */
const AppWrapper: React.FC<AppProps> = (props) => {
  const { versionCheckPromise, ...mainProps } = props;
  
  const [isReady, setIsReady] = useState(false);
  const [versionInfo, setVersionInfo] = useState<VersionCheckResult | null>(null);
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);

  // 初始化应用
  const initializeApp = useCallback(() => {
    if (props.debug) {
      console.log('[DEBUG] Initializing application...');
    }
    setIsReady(true);
  }, [props.debug]);

  // 启动流程
  useEffect(() => {
    const initialize = async () => {
      // 1. 等待版本检查完成
      if (versionCheckPromise) {
        try {
          const versionResult = await versionCheckPromise;
          if (versionResult && versionResult.shouldPrompt) {
            // 有新版本需要提示
            setVersionInfo(versionResult);
            setShowUpdatePrompt(true);
            return;
          }
        } catch (error) {
          // 版本检查失败，继续启动
          if (props.debug) {
            console.log('[DEBUG] Version check failed:', error);
          }
        }
      }

      // 2. 无需更新，直接初始化
      initializeApp();
    };

    initialize();
  }, [versionCheckPromise, initializeApp, props.debug]);

  // 显示版本更新提示
  if (showUpdatePrompt && versionInfo) {
    return (
      <UpdatePrompt
        versionInfo={versionInfo}
        onComplete={() => {
          setShowUpdatePrompt(false);
          initializeApp();
        }}
      />
    );
  }

  // 等待初始化完成
  if (!isReady) {
    return (
      <Box padding={1}>
        <Text color="yellow">
          <Spinner type="dots" />
        </Text>
        <Text color="yellow"> Starting ClawdCode...</Text>
      </Box>
    );
  }

  // 显示主界面
  return <MainInterface {...mainProps} />;
};

// ========== 导出 ==========

/**
 * App - 带有 ErrorBoundary 的主组件
 */
export const App: React.FC<AppProps> = (props) => {
  return (
    <ErrorBoundary>
      <AppWrapper {...props} />
    </ErrorBoundary>
  );
};
