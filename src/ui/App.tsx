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
import { Agent } from '../agent/Agent.js';
import type { Message, ChatContext } from '../agent/types.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { UpdatePrompt } from './components/UpdatePrompt.js';
import type { PermissionMode } from '../cli/types.js';
import type { VersionCheckResult } from '../services/VersionChecker.js';

// ========== 类型定义 ==========

/** UI 展示用的消息类型 */
interface UIMessage {
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
  resumeSessionId?: string;
}

// ========== 主界面组件 ==========

interface MainInterfaceProps {
  apiKey: string;
  baseURL?: string;
  model?: string;
  initialMessage?: string;
  debug?: boolean;
  resumeSessionId?: string;
}

const MainInterface: React.FC<MainInterfaceProps> = ({ 
  apiKey, 
  baseURL, 
  model,
  initialMessage,
  debug,
  resumeSessionId,
}) => {
  const [input, setInput] = useState('');
  const [uiMessages, setUIMessages] = useState<UIMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);
  
  // Agent 实例和上下文
  const agentRef = useRef<Agent | null>(null);
  const contextRef = useRef<ChatContext>({
    sessionId: resumeSessionId || `session-${Date.now()}`,
    messages: [],
  });
  const initialMessageSent = useRef(false);

  // 初始化 Agent（使用无状态设计）
  useEffect(() => {
    const initAgent = async () => {
      try {
        if (debug) {
          console.log('[DEBUG] Initializing Agent...');
        }
        
        agentRef.current = await Agent.create({
          apiKey,
          baseURL,
          model,
        });
        
        // 如果有 resumeSessionId，尝试加载会话历史
        if (resumeSessionId) {
          try {
            const { PersistentStore } = await import('../context/storage/PersistentStore.js');
            const store = new PersistentStore(process.cwd());
            const conversation = await store.loadConversation(resumeSessionId);
            
            if (conversation && conversation.messages.length > 0) {
              // 恢复消息历史
              contextRef.current.messages = conversation.messages.map(m => ({
                role: m.role as Message['role'],
                content: m.content,
              }));
              
              // 更新 UI 消息
              const uiMsgs: UIMessage[] = conversation.messages
                .filter(m => m.role === 'user' || m.role === 'assistant')
                .map(m => ({
                  role: m.role as 'user' | 'assistant',
                  content: m.content,
                }));
              setUIMessages(uiMsgs);
              setSessionStatus(`Resumed session: ${resumeSessionId} (${conversation.messages.length} messages)`);
              
              if (debug) {
                console.log('[DEBUG] Loaded session with', conversation.messages.length, 'messages');
              }
            }
          } catch (error) {
            if (debug) {
              console.log('[DEBUG] Failed to load session:', error);
            }
            setSessionStatus('Could not load previous session, starting fresh');
          }
        }
        
        setIsInitializing(false);
        
        if (debug) {
          console.log('[DEBUG] Agent initialized successfully');
        }
      } catch (error) {
        setInitError(error instanceof Error ? error.message : '初始化失败');
        setIsInitializing(false);
      }
    };
    
    initAgent();
  }, [apiKey, baseURL, model, debug, resumeSessionId]);

  const handleSubmit = useCallback(async (value: string) => {
    if (!value.trim() || !agentRef.current) return;

    // 添加用户消息到 UI
    const userUIMessage: UIMessage = { role: 'user', content: value };
    setUIMessages(prev => [...prev, userUIMessage]);
    setInput('');
    setIsLoading(true);

    // 添加用户消息到上下文
    const userMessage: Message = { role: 'user', content: value };
    contextRef.current.messages.push(userMessage);

    if (debug) {
      console.log('[DEBUG] Sending message:', value);
      console.log('[DEBUG] Context messages count:', contextRef.current.messages.length);
    }

    try {
      // 使用无状态 Agent，传入上下文
      const result = await agentRef.current.chat(value, contextRef.current);
      
      // 添加助手消息到 UI
      const assistantUIMessage: UIMessage = { role: 'assistant', content: result };
      setUIMessages(prev => [...prev, assistantUIMessage]);
      
      // 添加助手消息到上下文（保持历史连续性）
      const assistantMessage: Message = { role: 'assistant', content: result };
      contextRef.current.messages.push(assistantMessage);
      
    } catch (error) {
      const errorContent = `Error: ${(error as Error).message}`;
      const errorUIMessage: UIMessage = { role: 'assistant', content: errorContent };
      setUIMessages(prev => [...prev, errorUIMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [debug]);

  // 处理初始消息
  useEffect(() => {
    if (initialMessage && !initialMessageSent.current && !isInitializing && agentRef.current) {
      initialMessageSent.current = true;
      handleSubmit(initialMessage);
    }
  }, [initialMessage, handleSubmit, isInitializing]);

  // 初始化中
  if (isInitializing) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text color="yellow"> Initializing Agent...</Text>
        </Box>
      </Box>
    );
  }

  // 初始化失败
  if (initError) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">❌ Agent initialization failed:</Text>
        <Text color="red">{initError}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      {/* 标题 */}
      <Box marginBottom={1}>
        <Text bold color="cyan">🤖 ClawdCode - CLI Coding Agent</Text>
        {debug && <Text color="gray"> [DEBUG]</Text>}
      </Box>

      {/* 会话状态 */}
      {sessionStatus && (
        <Box marginBottom={1}>
          <Text color="gray">{sessionStatus}</Text>
        </Box>
      )}

      {/* 消息历史 */}
      <Box flexDirection="column" marginBottom={1}>
        {uiMessages.map((msg, index) => (
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
  const { versionCheckPromise, permissionMode, ...mainProps } = props;
  
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
