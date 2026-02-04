/**
 * ClawdInterface.tsx - 主界面协调组件
 * 
 * 职责：
 * - 焦点状态管理（哪个组件接收键盘输入）
 * - 模态框显示（确认对话框、选择器等）
 * - 业务逻辑 Hooks 的调用
 * - 协调各个 UI 区域的渲染
 */

import React, { useEffect, useCallback, useRef, useState } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

import { Agent } from '../../agent/Agent.js';
import type { Message, ChatContext } from '../../agent/types.js';

// Store
import {
  useInitializationStatus,
  useActiveModal,
  useIsThinking,
  useMessages,
  useSessionId,
  useTokenUsage,
  sessionActions,
  focusActions,
  FocusId,
  useCurrentFocus,
} from '../../store/index.js';

// Context
import { ContextManager, TokenCounter } from '../../context/index.js';

// Components
import { MessageRenderer } from './markdown/MessageRenderer.js';
import { InputArea } from './input/InputArea.js';
import { LoadingIndicator } from './common/LoadingIndicator.js';
import { ChatStatusBar } from './layout/ChatStatusBar.js';
import { ConfirmationPrompt } from './dialog/ConfirmationPrompt.js';
import { ExitMessage } from './common/ExitMessage.js';
import { useConfirmation } from '../hooks/useConfirmation.js';

// Hooks
import { useTerminalWidth } from '../hooks/useTerminalWidth.js';
import { useCtrlCHandler } from '../hooks/useCtrlCHandler.js';
import { useInputBuffer } from '../hooks/useInputBuffer.js';

// Theme
import { themeManager } from '../themes/ThemeManager.js';

// ========== Types ==========

export interface ClawdInterfaceProps {
  apiKey: string;
  baseURL?: string;
  model?: string;
  initialMessage?: string;
  debug?: boolean;
  resumeSessionId?: string;
}

// ========== Component ==========

export const ClawdInterface: React.FC<ClawdInterfaceProps> = ({
  apiKey,
  baseURL,
  model,
  initialMessage,
  debug,
  resumeSessionId,
}) => {
  // ==================== Store State ====================
  const initializationStatus = useInitializationStatus();
  const activeModal = useActiveModal();
  const isThinking = useIsThinking();
  const messages = useMessages();
  const sessionId = useSessionId();
  const tokenUsage = useTokenUsage();
  const currentFocus = useCurrentFocus();

  // ==================== Local State & Refs ====================
  const terminalWidth = useTerminalWidth();
  const theme = themeManager.getTheme();
  const agentRef = useRef<Agent | null>(null);
  const contextManagerRef = useRef<ContextManager | null>(null);
  const initialMessageSent = useRef(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [isExiting, setIsExiting] = useState(false);
  const [exitSessionId, setExitSessionId] = useState<string | null>(null);

  // ==================== Hooks ====================
  const { confirmationState, handleResponse } = useConfirmation();
  const inputBuffer = useInputBuffer('', 0);

  // Ctrl+C handler
  useCtrlCHandler({
    hasRunningTask: isThinking,
    onInterrupt: () => {
      // TODO: Abort current operation
      sessionActions().setThinking(false);
    },
    onBeforeExit: () => {
      // 获取当前会话 ID
      const currentSessionId = contextManagerRef.current?.getCurrentSessionId() || sessionId;
      
      if (currentSessionId && messages.length > 0) {
        // 设置退出状态，显示 ExitMessage
        setExitSessionId(currentSessionId);
        setIsExiting(true);
        // 返回 true 表示由 ExitMessage 组件处理退出
        return true;
      }
      return false;
    },
  });

  // ==================== Agent & Context Initialization ====================
  useEffect(() => {
    const initAgent = async () => {
      try {
        if (debug) {
          console.log('[DEBUG] Initializing Agent and ContextManager...');
        }

        // 1. 创建 ContextManager（使用默认配置，只覆盖压缩阈值）
        contextManagerRef.current = new ContextManager({
          compressionThreshold: 100000, // 100k tokens 触发压缩
        });

        // 2. 创建或加载会话
        let currentSessionId: string;
        
        if (resumeSessionId) {
          // 尝试加载现有会话
          const loaded = await contextManagerRef.current.loadSession(resumeSessionId);
          
          if (loaded) {
            currentSessionId = resumeSessionId;
            
            // 恢复消息到 UI Store
            const contextMessages = contextManagerRef.current.getMessages();
            contextMessages
              .filter(m => m.role === 'user' || m.role === 'assistant')
              .forEach(m => {
                if (m.role === 'user') {
                  sessionActions().addUserMessage(m.content);
                } else if (m.role === 'assistant') {
                  sessionActions().addAssistantMessage(m.content);
                }
              });

            if (debug) {
              console.log('[DEBUG] Loaded session with', contextMessages.length, 'messages');
            }
          } else {
            // 加载失败，创建新会话
            if (debug) {
              console.log('[DEBUG] Failed to load session, creating new one');
            }
            currentSessionId = await contextManagerRef.current.createSession();
          }
        } else {
          // 创建新会话
          currentSessionId = await contextManagerRef.current.createSession();
        }

        // 更新 Store 中的 sessionId
        sessionActions().setSessionId(currentSessionId);

        // 3. 创建 Agent
        agentRef.current = await Agent.create({
          apiKey,
          baseURL,
          model,
        });

        setIsInitializing(false);

        if (debug) {
          console.log('[DEBUG] Agent initialized successfully, sessionId:', currentSessionId);
        }
      } catch (error) {
        setInitError(error instanceof Error ? error.message : '初始化失败');
        setIsInitializing(false);
      }
    };

    initAgent();

    // 清理函数
    return () => {
      contextManagerRef.current?.cleanup();
    };
  }, [apiKey, baseURL, model, debug, resumeSessionId]);

  // ==================== Focus Management ====================
  useEffect(() => {
    if (confirmationState.isVisible) {
      focusActions().setFocus(FocusId.CONFIRMATION_PROMPT);
    } else if (activeModal === 'themeSelector') {
      focusActions().setFocus(FocusId.THEME_SELECTOR);
    } else {
      focusActions().setFocus(FocusId.MAIN_INPUT);
    }
  }, [confirmationState.isVisible, activeModal]);

  // ==================== Command Handler ====================
  const handleSubmit = useCallback(async (value: string) => {
    if (!value.trim() || !agentRef.current || !contextManagerRef.current) return;

    const ctxManager = contextManagerRef.current;

    // 添加用户消息到 UI Store
    sessionActions().addUserMessage(value);

    // 清空输入
    inputBuffer.clear();

    // 设置 thinking 状态
    sessionActions().setThinking(true);

    // 添加用户消息到 ContextManager（自动持久化）
    await ctxManager.addMessage('user', value);

    if (debug) {
      const contextMessages = ctxManager.getMessages();
      console.log('[DEBUG] Sending message:', value);
      console.log('[DEBUG] Context messages count:', contextMessages.length);
      console.log('[DEBUG] Current token count:', ctxManager.getTokenCount());
    }

    try {
      // 从 ContextManager 获取消息构建 ChatContext
      const contextMessages = ctxManager.getMessages();
      const modelName = model || 'gpt-4';
      
      // 计算输入 token 并更新 ContextManager
      const inputTokens = TokenCounter.countTokens(
        contextMessages.map(m => ({ role: m.role as Message['role'], content: m.content })),
        modelName
      );

      // 构建 ChatContext
      const chatContext: ChatContext = {
        sessionId: ctxManager.getCurrentSessionId() || sessionId,
        messages: contextMessages.map(m => ({
          role: m.role as Message['role'],
          content: m.content,
        })),
      };

      // 调用 Agent
      const result = await agentRef.current.chat(value, chatContext);

      // 添加助手消息到 UI Store
      sessionActions().addAssistantMessage(result);

      // 添加助手消息到 ContextManager（自动持久化）
      await ctxManager.addMessage('assistant', result);

      // 计算输出 token 并更新统计
      const outputTokens = TokenCounter.countTextTokens(result, modelName);
      const totalTokens = inputTokens + outputTokens;
      
      // 更新 ContextManager 的 token 计数
      ctxManager.updateTokenCount(totalTokens);
      
      // 更新 UI Store 的 token 统计
      sessionActions().updateTokenUsage({
        inputTokens: tokenUsage.inputTokens + inputTokens,
        outputTokens: tokenUsage.outputTokens + outputTokens,
      });

      if (debug) {
        console.log('[DEBUG] Token usage - input:', inputTokens, 'output:', outputTokens);
        console.log('[DEBUG] Total context tokens:', ctxManager.getTokenCount());
      }

    } catch (error) {
      const errorContent = `Error: ${(error as Error).message}`;
      sessionActions().addAssistantMessage(errorContent);
      
      // 错误也记录到 ContextManager
      await ctxManager.addMessage('assistant', errorContent);
    } finally {
      sessionActions().setThinking(false);
    }
  }, [debug, inputBuffer, model, sessionId, tokenUsage.inputTokens, tokenUsage.outputTokens]);

  // ==================== Initial Message ====================
  useEffect(() => {
    if (initialMessage && !initialMessageSent.current && !isInitializing && agentRef.current) {
      initialMessageSent.current = true;
      handleSubmit(initialMessage);
    }
  }, [initialMessage, handleSubmit, isInitializing]);

  // ==================== Render ====================

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

  // 需要设置时显示设置向导（TODO: 实现 ModelConfigWizard）
  if (initializationStatus === 'needsSetup') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="yellow">⚠️ No models configured.</Text>
        <Text color="gray">Please configure a model in ~/.clawdcode/config.json</Text>
      </Box>
    );
  }

  // 阻塞式模态框（确认对话框）
  if (confirmationState.isVisible && confirmationState.details) {
    return (
      <ConfirmationPrompt
        details={confirmationState.details}
        onResponse={handleResponse}
      />
    );
  }

  // 主界面
  return (
    <Box flexDirection="column" width="100%">
      {/* 标题 */}
      <Box marginBottom={1}>
        <Text bold color={theme.colors.primary}>🤖 ClawdCode - CLI Coding Agent</Text>
        {debug && <Text color={theme.colors.text.muted}> [DEBUG]</Text>}
      </Box>

      {/* 消息区域 */}
      <Box flexDirection="column" marginBottom={1}>
        {messages.map((msg, index) => (
          <MessageRenderer
            key={index}
            content={msg.content}
            role={msg.role}
            terminalWidth={terminalWidth - 2}
            showPrefix={true}
          />
        ))}

        {/* 加载指示器 */}
        {isThinking && <LoadingIndicator />}
      </Box>

      {/* 输入区域 */}
      {!isThinking && (
        <InputArea
          input={inputBuffer.value}
          cursorPosition={inputBuffer.cursorPosition}
          onChange={inputBuffer.setValue}
          onChangeCursorPosition={inputBuffer.setCursorPosition}
          onSubmit={handleSubmit}
          isProcessing={isThinking}
        />
      )}

      {/* 状态栏 */}
      <ChatStatusBar
        model={model}
        sessionId={sessionId}
        messageCount={messages.length}
        themeName={theme.name}
        tokenUsage={{
          input: tokenUsage.inputTokens,
          output: tokenUsage.outputTokens,
          total: tokenUsage.inputTokens + tokenUsage.outputTokens,
        }}
      />

      {/* 退出提示（追加在状态栏下方） */}
      {isExiting && exitSessionId && (
        <ExitMessage sessionId={exitSessionId} />
      )}
    </Box>
  );
};
