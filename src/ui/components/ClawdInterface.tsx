/**
 * ClawdInterface.tsx - 主界面协调组件
 * 
 * 职责：
 * - 焦点状态管理（哪个组件接收键盘输入）
 * - 模态框显示（确认对话框、选择器等）
 * - 业务逻辑 Hooks 的调用
 * - 协调各个 UI 区域的渲染
 */

import React, { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

// ========== 节流工具 ==========

/**
 * 创建节流的流式更新器
 * 累积 delta 内容，定期批量更新 UI，避免频繁重绘
 */
function createThrottledStreamUpdater(
  updateContent: (delta: string) => void,
  updateThinking: (delta: string) => void,
  intervalMs: number = 50
) {
  let contentBuffer = '';
  let thinkingBuffer = '';
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (contentBuffer) {
      updateContent(contentBuffer);
      contentBuffer = '';
    }
    if (thinkingBuffer) {
      updateThinking(thinkingBuffer);
      thinkingBuffer = '';
    }
    timer = null;
  };

  return {
    appendContent: (delta: string) => {
      contentBuffer += delta;
      if (!timer) {
        timer = setTimeout(flush, intervalMs);
      }
    },
    appendThinking: (delta: string) => {
      thinkingBuffer += delta;
      if (!timer) {
        timer = setTimeout(flush, intervalMs);
      }
    },
    flush: () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      flush();
    },
    clear: () => {
      contentBuffer = '';
      thinkingBuffer = '';
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

import { Agent } from '../../agent/Agent.js';
import type { Message, ChatContext } from '../../agent/types.js';

// Store
import {
  useInitializationStatus,
  useActiveModal,
  useSessionId,
  // 以下 hooks 仅在子组件中使用
  useHasStreamingMessage,
  useMessages,
  useIsThinking,
  usePendingCommands,
  useTokenUsage,
  // Actions
  sessionActions,
  focusActions,
  commandActions,
  FocusId,
  useCurrentFocus,
  getState,
  subscribe,
} from '../../store/index.js';

// Context
import { ContextManager, TokenCounter } from '../../context/index.js';

// Components
import { MessageRenderer } from './markdown/MessageRenderer.js';
import { InputArea } from './input/InputArea.js';
import { LoadingIndicator } from './common/LoadingIndicator.js';
import { ChatStatusBar } from './layout/ChatStatusBar.js';
import { MessageList } from './layout/MessageList.js';
import { ConfirmationPrompt } from './dialog/ConfirmationPrompt.js';
import { InteractiveSelector, type SelectorOption } from './dialog/InteractiveSelector.js';
import { ExitMessage } from './common/ExitMessage.js';
import { useConfirmation } from '../hooks/useConfirmation.js';

// Hooks
import { useTerminalWidth } from '../hooks/useTerminalWidth.js';
import { useCtrlCHandler } from '../hooks/useCtrlCHandler.js';

// Theme
import { themeManager } from '../themes/index.js';

// ========== Types ==========

export interface ClawdInterfaceProps {
  apiKey: string;
  baseURL?: string;
  model?: string;
  initialMessage?: string;
  debug?: boolean;
  resumeSessionId?: string;
}

// ========== Memoized Sub-Components ==========

/**
 * 队列命令预览组件 - 自己订阅状态
 */
const QueuedCommands: React.FC = React.memo(() => {
  const pendingCommands = usePendingCommands();
  const theme = themeManager.getTheme();
  
  if (pendingCommands.length === 0) return null;
  
  return (
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
  );
});

QueuedCommands.displayName = 'QueuedCommands';

/**
 * 加载指示器包装组件 - 自己订阅状态
 */
const ThinkingIndicator: React.FC = React.memo(() => {
  const isThinking = useIsThinking();
  const hasStreamingMessage = useHasStreamingMessage();
  
  if (!isThinking || hasStreamingMessage) return null;
  
  return <LoadingIndicator />;
});

ThinkingIndicator.displayName = 'ThinkingIndicator';

/**
 * 最近消息预览组件（用于选择器模式）
 * 独立订阅消息状态，避免影响主界面渲染
 */
interface RecentMessagesPreviewProps {
  terminalWidth: number;
  count?: number;
}

const RecentMessagesPreview: React.FC<RecentMessagesPreviewProps> = React.memo(({ terminalWidth, count = 3 }) => {
  const messages = useMessages();
  const recentMessages = messages.slice(-count);
  
  return (
    <Box flexDirection="column" marginBottom={1}>
      {recentMessages.map((msg, index) => (
        <MessageRenderer
          key={msg.id || index}
          content={msg.content}
          role={msg.role}
          terminalWidth={terminalWidth}
          showPrefix={true}
        />
      ))}
    </Box>
  );
});

RecentMessagesPreview.displayName = 'RecentMessagesPreview';

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
  // 只保留真正需要的订阅，其他通过 getState() 按需获取
  const initializationStatus = useInitializationStatus();
  const activeModal = useActiveModal();
  const sessionId = useSessionId(); // 用于 slash 命令上下文
  // currentFocus 通过 getState() 按需获取
  
  // 获取消息的函数（不订阅状态，避免重新渲染）
  const getMessages = useCallback(() => getState().session.messages, []);

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

  // Ctrl+C handler - 自己通过 getState() 获取状态
  useCtrlCHandler({
    onInterrupt: () => {
      // TODO: Abort current operation
      sessionActions().setThinking(false);
    },
    onBeforeExit: () => {
      // 使用 getState() 获取最新状态
      const currentMessageCount = getState().session.messages.length;
      const currentSessionId = contextManagerRef.current?.getCurrentSessionId() || getState().session.sessionId;
      
      if (currentSessionId && currentMessageCount > 0) {
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
          messages: getMessages(),
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

    // 创建流式消息占位
    const streamingMessageId = sessionActions().startStreamingMessage();

    // 创建节流更新器（每 50ms 批量更新一次，避免频繁重绘）
    const streamUpdater = createThrottledStreamUpdater(
      (delta) => sessionActions().appendToStreamingMessage(streamingMessageId, delta),
      (delta) => sessionActions().appendThinkingToStreamingMessage(streamingMessageId, delta),
      50 // 50ms 节流间隔
    );

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

      // 调用 Agent（带节流的流式回调）
      const result = await agentRef.current.chat(value, chatContext, {
        // 流式内容回调（节流）
        onContentDelta: (delta) => {
          streamUpdater.appendContent(delta);
        },
        // 流式思考内容回调（节流）
        onThinkingDelta: (delta) => {
          streamUpdater.appendThinking(delta);
        },
      });

      // 刷新剩余的缓冲内容
      streamUpdater.flush();

      // 完成流式消息
      sessionActions().finishStreamingMessage(streamingMessageId);

      // 添加助手消息到 ContextManager（自动持久化）
      await ctxManager.addMessage('assistant', result);

      // 计算输出 token 并更新统计
      const outputTokens = TokenCounter.countTextTokens(result, modelName);
      const totalTokens = inputTokens + outputTokens;
      
      // 更新 ContextManager 的 token 计数
      ctxManager.updateTokenCount(totalTokens);
      
      // 更新 UI Store 的 token 统计（使用 getState() 获取当前值）
      const currentTokenUsage = getState().session.tokenUsage;
      sessionActions().updateTokenUsage({
        inputTokens: currentTokenUsage.inputTokens + inputTokens,
        outputTokens: currentTokenUsage.outputTokens + outputTokens,
      });

      if (debug) {
        console.log('[DEBUG] Token usage - input:', inputTokens, 'output:', outputTokens);
        console.log('[DEBUG] Total context tokens:', ctxManager.getTokenCount());
      }

    } catch (error) {
      // 清理节流缓冲
      streamUpdater.clear();
      
      const errorContent = `Error: ${(error as Error).message}`;
      // 更新流式消息为错误内容
      sessionActions().appendToStreamingMessage(streamingMessageId, errorContent);
      sessionActions().finishStreamingMessage(streamingMessageId);
      
      // 错误也记录到 ContextManager
      await ctxManager.addMessage('assistant', errorContent);
    } finally {
      sessionActions().setThinking(false);
    }
  }, [debug, model, sessionId, getMessages]);

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
  // 使用 store subscribe 而不是 useEffect + hooks，避免状态订阅导致的重新渲染
  useEffect(() => {
    let prevIsThinking = getState().session.isThinking;
    
    const unsubscribe = subscribe((state) => {
      const currentIsThinking = state.session.isThinking;
      const hasPending = state.command.pendingCommands.length > 0;
      
      // 检测 isThinking 从 true 变为 false
      if (prevIsThinking && !currentIsThinking && hasPending) {
        processQueue();
      }
      
      prevIsThinking = currentIsThinking;
    });
    
    return unsubscribe;
  }, [processQueue]);

  // ==================== Command Handler ====================
  const handleSubmit = useCallback(async (value: string) => {
    if (!value.trim()) return;

    // 命令历史由 InputArea 自己管理，无需在此处理

    // 使用 getState() 获取最新状态，避免订阅导致的重新渲染
    const currentState = getState();
    const currentIsThinking = currentState.session.isThinking;
    const currentPendingCount = currentState.command.pendingCommands.length;

    // 如果正在处理中，将命令加入队列
    if (currentIsThinking) {
      commandActions().enqueueCommand(value);
      if (debug) {
        console.log('[DEBUG] Command queued:', value, 'Queue size:', currentPendingCount + 1);
      }
      return;
    }

    // 否则直接处理
    await processCommand(value);
  }, [processCommand, debug]);

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
        <RecentMessagesPreview terminalWidth={terminalWidth - 2} count={3} />

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

      {/* 消息区域 - 使用优化的 MessageList 组件 */}
      <Box flexDirection="column" marginBottom={1}>
        <MessageList terminalWidth={terminalWidth - 2} />

        {/* 加载指示器 - 自己订阅状态 */}
        <ThinkingIndicator />

        {/* 队列中的命令预览 - 自己订阅状态 */}
        <QueuedCommands />
      </Box>

      {/* 输入区域 - 完全自管理状态（包括命令历史） */}
      <InputArea
        onSubmit={handleSubmit}
      />

      {/* 状态栏 - 自己订阅状态 */}
      <ChatStatusBar model={model} />

      {/* 退出提示（追加在状态栏下方） */}
      {isExiting && exitSessionId && (
        <ExitMessage sessionId={exitSessionId} />
      )}
    </Box>
  );
};
