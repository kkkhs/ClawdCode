/**
 * ClawdInterface - 主界面协调组件
 * 
 * 管理焦点状态、模态框显示、业务逻辑调用
 */

import React, { useEffect, useCallback, useState, useRef } from 'react';
import { Box, Text, useApp } from 'ink';

// 组件
import { MessageArea, type UIMessage } from './layout/MessageArea.js';
import { InputArea } from './input/InputArea.js';
import { LoadingIndicator } from './common/LoadingIndicator.js';
import { ChatStatusBar } from './layout/ChatStatusBar.js';
import { ConfirmationPrompt } from './dialog/ConfirmationPrompt.js';
import { ErrorBoundary } from './common/ErrorBoundary.js';

// Hooks
import { useInputBuffer, useCommandHistory, useConfirmation } from '../hooks/index.js';
import { useFocusActions, FocusId, useCurrentFocus } from '../focus/index.js';

// 主题
import { themeManager } from '../themes/index.js';

// Agent
import { Agent } from '../../agent/index.js';
import type { Message, ChatContext } from '../../agent/types.js';

interface ClawdInterfaceProps {
  /** API Key */
  apiKey: string;
  /** API Base URL */
  baseURL?: string;
  /** 模型名称 */
  model?: string;
  /** 初始消息 */
  initialMessage?: string;
  /** 调试模式 */
  debug?: boolean;
  /** 恢复会话 ID */
  resumeSessionId?: string;
}

/**
 * 主界面组件
 */
export const ClawdInterface: React.FC<ClawdInterfaceProps> = ({
  apiKey,
  baseURL,
  model = 'gpt-4',
  initialMessage,
  debug = false,
  resumeSessionId,
}) => {
  const { exit } = useApp();
  const theme = themeManager.getTheme();
  const focusActions = useFocusActions();
  const currentFocus = useCurrentFocus();

  // ==================== State ====================
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);

  // Agent 实例和上下文
  const agentRef = useRef<Agent | null>(null);
  const contextRef = useRef<ChatContext>({
    sessionId: resumeSessionId || `session-${Date.now()}`,
    messages: [],
  });
  const initialMessageSent = useRef(false);

  // Input buffer
  const inputBuffer = useInputBuffer('', 0);

  // Command history
  const commandHistory = useCommandHistory();

  // Confirmation dialog
  const { confirmationState, confirmationHandler, handleResponse } = useConfirmation();

  // ==================== Effects ====================

  // 焦点管理
  useEffect(() => {
    if (confirmationState.isVisible) {
      focusActions.setFocus(FocusId.CONFIRMATION_PROMPT);
    } else {
      focusActions.setFocus(FocusId.MAIN_INPUT);
    }
  }, [confirmationState.isVisible, focusActions]);

  // 初始化 Agent
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

        // 如果有 resumeSessionId，显示状态
        if (resumeSessionId) {
          setSessionStatus(`Session: ${resumeSessionId}`);
        } else {
          setSessionStatus(`New session: ${contextRef.current.sessionId}`);
        }

        if (debug) {
          console.log('[DEBUG] Agent initialized successfully');
        }
      } catch (error) {
        console.error('Failed to initialize Agent:', error);
      }
    };

    initAgent();
  }, [apiKey, baseURL, model, debug, resumeSessionId]);

  // 处理初始消息
  useEffect(() => {
    if (initialMessage && !initialMessageSent.current && agentRef.current) {
      initialMessageSent.current = true;
      handleSubmit(initialMessage);
    }
  }, [initialMessage]);

  // ==================== Handlers ====================

  const handleSubmit = useCallback(
    async (value: string) => {
      if (!value.trim() || !agentRef.current || isThinking) return;

      // 清空输入
      inputBuffer.clear();

      // 添加到历史
      commandHistory.addToHistory(value);

      // 添加用户消息到 UI
      const userMessage: UIMessage = {
        role: 'user',
        content: value,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMessage]);

      // 添加到上下文
      const userCtxMessage: Message = { role: 'user', content: value };
      contextRef.current.messages.push(userCtxMessage);

      // 开始思考
      setIsThinking(true);

      try {
        // 调用 Agent
        const result = await agentRef.current.chat(value, contextRef.current);

        // 添加助手消息到 UI
        const assistantMessage: UIMessage = {
          role: 'assistant',
          content: result,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMessage]);

        // 添加到上下文
        const assistantCtxMessage: Message = { role: 'assistant', content: result };
        contextRef.current.messages.push(assistantCtxMessage);
      } catch (error) {
        const errorMessage: UIMessage = {
          role: 'assistant',
          content: `Error: ${(error as Error).message}`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsThinking(false);
      }
    },
    [isThinking, inputBuffer, commandHistory]
  );

  const handleAbort = useCallback(() => {
    // TODO: 实现中断逻辑
    setIsThinking(false);
  }, []);

  // ==================== Render ====================

  // 阻塞式模态框
  if (confirmationState.isVisible && confirmationState.details) {
    return (
      <ConfirmationPrompt
        details={confirmationState.details}
        onResponse={handleResponse}
      />
    );
  }

  return (
    <ErrorBoundary>
      <Box flexDirection="column" width="100%" minHeight={10}>
        {/* 标题栏 */}
        <Box paddingX={1} marginBottom={1}>
          <Text bold color={theme.colors.primary}>
            🤖 ClawdCode
          </Text>
          {debug && <Text color={theme.colors.text.muted}> [DEBUG]</Text>}
        </Box>

        {/* 会话状态 */}
        {sessionStatus && (
          <Box paddingX={1} marginBottom={1}>
            <Text color={theme.colors.text.muted}>{sessionStatus}</Text>
          </Box>
        )}

        {/* 消息区域 */}
        <Box flexGrow={1} flexDirection="column">
          <MessageArea messages={messages} />
        </Box>

        {/* 加载指示器 */}
        <LoadingIndicator isVisible={isThinking} />

        {/* 输入区域 */}
        <InputArea
          input={inputBuffer.value}
          cursorPosition={inputBuffer.cursorPosition}
          onChange={inputBuffer.setValue}
          onChangeCursorPosition={inputBuffer.setCursorPosition}
          onSubmit={handleSubmit}
          isProcessing={isThinking}
        />

        {/* 状态栏 */}
        <ChatStatusBar
          model={model}
          sessionId={contextRef.current.sessionId}
          messageCount={messages.length}
          themeName={themeManager.getCurrentThemeName()}
        />
      </Box>
    </ErrorBoundary>
  );
};

export default ClawdInterface;
