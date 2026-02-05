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
  commandActions,
  FocusId,
  useCurrentFocus,
  usePendingCommands,
} from '../../store/index.js';

// Context
import { ContextManager, TokenCounter } from '../../context/index.js';

// Components
import { MessageRenderer } from './markdown/MessageRenderer.js';
import { InputArea } from './input/InputArea.js';
import { LoadingIndicator } from './common/LoadingIndicator.js';
import { ChatStatusBar } from './layout/ChatStatusBar.js';
import { ConfirmationPrompt } from './dialog/ConfirmationPrompt.js';
import { InteractiveSelector, type SelectorOption } from './dialog/InteractiveSelector.js';
import { ExitMessage } from './common/ExitMessage.js';
import { useConfirmation } from '../hooks/useConfirmation.js';

// Hooks
import { useTerminalWidth } from '../hooks/useTerminalWidth.js';
import { useCtrlCHandler } from '../hooks/useCtrlCHandler.js';
import { useInputBuffer } from '../hooks/useInputBuffer.js';
import { useCommandHistory } from '../hooks/useCommandHistory.js';

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
  const pendingCommands = usePendingCommands();

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
  
  // 选择器状态
  const [selectorState, setSelectorState] = useState<{
    isVisible: boolean;
    title: string;
    options: SelectorOption[];
    handler: 'theme' | 'model' | null;
  }>({
    isVisible: false,
    title: '',
    options: [],
    handler: null,
  });

  // ==================== Hooks ====================
  const { confirmationState, handleResponse } = useConfirmation();
  const inputBuffer = useInputBuffer('', 0);
  const commandHistory = useCommandHistory();

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

        // 4. 初始化自定义 Slash Commands
        const { initializeCustomCommands } = await import('../../slash-commands/index.js');
        const customCmdResult = await initializeCustomCommands(process.cwd());
        
        if (debug && customCmdResult.count > 0) {
          console.log('[DEBUG] Loaded', customCmdResult.count, 'custom commands');
        }
        if (customCmdResult.warnings.length > 0) {
          console.warn('[WARN] Custom commands:', customCmdResult.warnings);
        }

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
    } else if (selectorState.isVisible) {
      focusActions().setFocus(FocusId.SELECTOR);
    } else if (activeModal === 'themeSelector') {
      focusActions().setFocus(FocusId.THEME_SELECTOR);
    } else {
      focusActions().setFocus(FocusId.MAIN_INPUT);
    }
  }, [confirmationState.isVisible, selectorState.isVisible, activeModal]);

  // ==================== Command History Handlers ====================
  const handleArrowUp = useCallback(() => {
    const prevCommand = commandHistory.getPreviousCommand();
    if (prevCommand !== null) {
      inputBuffer.setValue(prevCommand);
      inputBuffer.setCursorPosition(prevCommand.length);
    }
  }, [commandHistory, inputBuffer]);

  const handleArrowDown = useCallback(() => {
    const nextCommand = commandHistory.getNextCommand();
    if (nextCommand !== null) {
      inputBuffer.setValue(nextCommand);
      inputBuffer.setCursorPosition(nextCommand.length);
    }
  }, [commandHistory, inputBuffer]);

  // ==================== Selector Handlers ====================
  const handleSelectorSelect = useCallback(async (value: string) => {
    const { handler } = selectorState;
    
    if (handler === 'theme') {
      const { themeManager } = await import('../themes/index.js');
      themeManager.setTheme(value);
      sessionActions().addAssistantMessage(`✓ 主题已切换为 ${value}`);
    } else if (handler === 'model') {
      const { configActions } = await import('../../store/index.js');
      configActions().updateConfig({ currentModelId: value });
      sessionActions().addAssistantMessage(`✓ 模型已切换为 ${value}`);
    }
    
    setSelectorState({ isVisible: false, title: '', options: [], handler: null });
    focusActions().setFocus(FocusId.MAIN_INPUT);
  }, [selectorState]);

  const handleSelectorCancel = useCallback(() => {
    setSelectorState({ isVisible: false, title: '', options: [], handler: null });
    focusActions().setFocus(FocusId.MAIN_INPUT);
    sessionActions().addAssistantMessage('已取消选择');
  }, []);

  // ==================== Core Command Processor ====================
  /**
   * 处理单个命令的核心逻辑（包括 slash 命令和普通消息）
   */
  const processCommand = useCallback(async (value: string) => {
    // 检查是否是 slash 命令
    const { isSlashCommand, executeSlashCommand } = await import('../../slash-commands/index.js');
    
    if (isSlashCommand(value)) {
      // 执行 slash 命令
      sessionActions().addUserMessage(value);
      sessionActions().setThinking(true);
      
      try {
        const result = await executeSlashCommand(value, {
          cwd: process.cwd(),
          sessionId,
          messages,
          contextManager: contextManagerRef.current,
          modelName: model,
        });
        
        // 处理选择器类型的结果
        if (result.type === 'selector' && result.selector) {
          sessionActions().setThinking(false);
          setSelectorState({
            isVisible: true,
            title: result.selector.title,
            options: result.selector.options,
            handler: result.selector.handler,
          });
          focusActions().setFocus(FocusId.SELECTOR);
          return;
        }
        
        // 显示命令结果
        if (result.content) {
          sessionActions().addAssistantMessage(result.content);
        } else if (result.message) {
          sessionActions().addAssistantMessage(result.message);
        } else if (result.error) {
          sessionActions().addAssistantMessage(`❌ ${result.error}`);
        }
      } catch (error) {
        sessionActions().addAssistantMessage(
          `❌ 命令执行失败: ${error instanceof Error ? error.message : String(error)}`
        );
      } finally {
        sessionActions().setThinking(false);
      }
      return;
    }

    // 正常消息处理
    if (!agentRef.current || !contextManagerRef.current) return;

    const ctxManager = contextManagerRef.current;

    // 添加用户消息到 UI Store
    sessionActions().addUserMessage(value);

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
  }, [debug, model, sessionId, messages, tokenUsage.inputTokens, tokenUsage.outputTokens]);

  // ==================== Queue Processor ====================
  /**
   * 处理命令队列中的下一个命令
   */
  const processQueue = useCallback(async () => {
    const nextCommand = commandActions().dequeueCommand();
    if (nextCommand) {
      if (debug) {
        console.log('[DEBUG] Processing queued command:', nextCommand);
      }
      await processCommand(nextCommand);
    }
  }, [processCommand, debug]);

  // 当 isThinking 变为 false 时，检查队列并处理下一个命令
  useEffect(() => {
    if (!isThinking && pendingCommands.length > 0) {
      processQueue();
    }
  }, [isThinking, pendingCommands.length, processQueue]);

  // ==================== Command Handler ====================
  const handleSubmit = useCallback(async (value: string) => {
    if (!value.trim()) return;

    // 添加到命令历史
    commandHistory.addToHistory(value);

    // 清空输入
    inputBuffer.clear();

    // 如果正在处理中，将命令加入队列
    if (isThinking) {
      commandActions().enqueueCommand(value);
      if (debug) {
        console.log('[DEBUG] Command queued:', value, 'Queue size:', pendingCommands.length + 1);
      }
      return;
    }

    // 否则直接处理
    await processCommand(value);
  }, [inputBuffer, commandHistory, isThinking, processCommand, debug, pendingCommands.length]);

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

  // 交互式选择器
  if (selectorState.isVisible) {
    return (
      <Box flexDirection="column" width="100%">
        {/* 标题 - 极客风格 */}
        <Box flexDirection="column" marginBottom={1}>
          <Box>
            <Text color={theme.colors.text.muted}>┌─</Text>
            <Text bold color={theme.colors.primary}> clawd</Text>
            <Text color={theme.colors.text.secondary}>code </Text>
          </Box>
        </Box>

        {/* 消息区域（简化显示） */}
        <Box flexDirection="column" marginBottom={1}>
          {messages.slice(-3).map((msg, index) => (
            <MessageRenderer
              key={index}
              content={msg.content}
              role={msg.role}
              terminalWidth={terminalWidth - 2}
              showPrefix={true}
            />
          ))}
        </Box>

        {/* 选择器 */}
        <InteractiveSelector
          title={selectorState.title}
          options={selectorState.options}
          onSelect={handleSelectorSelect}
          onCancel={handleSelectorCancel}
          focusId={FocusId.SELECTOR}
        />
      </Box>
    );
  }

  // 主界面
  return (
    <Box flexDirection="column" width="100%">
      {/* 标题 - 极客风格 */}
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text color={theme.colors.text.muted}>┌─</Text>
          <Text bold color={theme.colors.primary}> clawd</Text>
          <Text color={theme.colors.text.secondary}>code </Text>
          <Text color={theme.colors.text.muted}>─ </Text>
          <Text color={theme.colors.text.muted} dimColor>v{process.env.npm_package_version || '0.1.0'}</Text>
          {debug && <Text color={theme.colors.warning}> [debug]</Text>}
        </Box>
        <Text color={theme.colors.text.muted} dimColor>│  AI-powered coding agent · /help for commands</Text>
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

        {/* 队列中的命令预览 */}
        {pendingCommands.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text color={theme.colors.text.muted} dimColor>
              ── Queued ({pendingCommands.length}) ──
            </Text>
            {pendingCommands.map((cmd, index) => (
              <Box key={index} marginLeft={2}>
                <Text color={theme.colors.text.muted} dimColor>
                  {index + 1}. {cmd.length > 60 ? cmd.slice(0, 57) + '...' : cmd}
                </Text>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {/* 输入区域 - 始终可见，处理中时显示队列提示 */}
      <InputArea
        input={inputBuffer.value}
        cursorPosition={inputBuffer.cursorPosition}
        onChange={inputBuffer.setValue}
        onChangeCursorPosition={inputBuffer.setCursorPosition}
        onSubmit={handleSubmit}
        onArrowUp={handleArrowUp}
        onArrowDown={handleArrowDown}
        isProcessing={isThinking}
        placeholder={
          isThinking
            ? pendingCommands.length > 0
              ? `Queued: ${pendingCommands.length} command(s). Type to add more...`
              : 'Processing... Type to queue next command'
            : 'Type a message... (Ctrl+C to exit)'
        }
      />

      {/* 状态栏 */}
      <ChatStatusBar
        model={model}
        sessionId={sessionId}
        messageCount={messages.length}
        queuedCommands={pendingCommands.length}
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
