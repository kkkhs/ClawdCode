/**
 * App.tsx - 主 UI 组件
 * 
 * 使用 Ink (React for CLI) 构建终端界面
 * 
 * 启动流程：
 * 1. AppWrapper 等待版本检查完成
 * 2. 如果有新版本 → 显示 UpdatePrompt
 * 3. 用户跳过或无更新 → 初始化 Store → 显示主界面
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { ErrorBoundary } from './components/common/ErrorBoundary.js';
import { UpdatePrompt } from './components/dialog/UpdatePrompt.js';
import { ClawdInterface } from './components/ClawdInterface.js';
import { themeManager } from './themes/index.js';
import type { PermissionMode } from '../cli/types.js';
import type { VersionCheckResult } from '../services/VersionChecker.js';
import type { RuntimeConfig, ClawdConfig } from '../config/types.js';
import { DEFAULT_CONFIG } from '../config/types.js';
import {
  ensureStoreInitialized,
  appActions,
  configActions,
  getConfig,
  useInitializationStatus,
} from '../store/index.js';

// ========== 类型定义 ==========

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

// ========== 工具函数 ==========

/**
 * 合并 CLI 参数到基础配置，生成 RuntimeConfig
 * 
 * CLI 参数优先级最高，会覆盖配置文件中的值
 */
function mergeRuntimeConfig(baseConfig: ClawdConfig, props: AppProps): RuntimeConfig {
  const runtimeConfig: RuntimeConfig = {
    ...baseConfig,
  };

  // 合并 CLI 参数
  if (props.initialMessage) {
    runtimeConfig.initialMessage = props.initialMessage;
  }

  if (props.resumeSessionId) {
    runtimeConfig.resumeSessionId = props.resumeSessionId;
  }

  if (props.permissionMode) {
    runtimeConfig.defaultPermissionMode = props.permissionMode;
  }

  // 如果 CLI 传入了 model，更新 currentModelId
  if (props.model) {
    runtimeConfig.currentModelId = props.model;
  }

  return runtimeConfig;
}

/**
 * 初始化 Store 状态
 * 
 * 1. 设置配置到 Store
 * 2. 检查是否需要设置向导
 * 3. 设置初始化状态
 */
function initializeStoreState(config: RuntimeConfig): void {
  // 设置配置
  configActions().setConfig(config);

  // 检查是否需要设置向导
  // 支持两种配置方式：default（单模型）或 models（多模型）
  const hasDefaultConfig = config.default?.apiKey;
  const hasModelsConfig = config.models && config.models.length > 0;
  
  if (!hasDefaultConfig && !hasModelsConfig) {
    appActions().setInitializationStatus('needsSetup');
  } else {
    appActions().setInitializationStatus('ready');
  }
}

// ========== AppWrapper 组件 ==========

/**
 * AppWrapper - 处理版本检查和初始化流程
 * 
 * 流程：
 * 1. 初始化 Zustand Store（加载配置文件）
 * 2. 合并 CLI 参数生成 RuntimeConfig
 * 3. 初始化 Store 状态
 * 4. 等待版本检查
 * 5. 显示主界面
 */
const AppWrapper: React.FC<AppProps> = (props) => {
  const { versionCheckPromise, permissionMode, ...mainProps } = props;
  
  // 使用 Store 状态
  const initializationStatus = useInitializationStatus();
  
  const [versionInfo, setVersionInfo] = useState<VersionCheckResult | null>(null);
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);

  // 初始化应用（包括 Store）
  const initializeApp = useCallback(async () => {
    if (props.debug) {
      console.log('[DEBUG] Initializing application and Store...');
    }
    
    try {
      appActions().setInitializationStatus('loading');
      
      // 1. 初始化 Store（加载配置文件）
      await ensureStoreInitialized();
      
      // 2. 从 Store 读取基础配置
      const baseConfig = getConfig() ?? DEFAULT_CONFIG;
      
      // 3. 合并 CLI 参数生成 RuntimeConfig
      const mergedConfig = mergeRuntimeConfig(baseConfig, props);
      
      // 4. 初始化 Store 状态
      initializeStoreState(mergedConfig);
      
      // 注意：主题已在 main.tsx 的 initializeFromConfig() 中初始化
      // 用户选择的主题优先级高于项目配置，所以这里不再重复设置
      
      if (props.debug) {
        console.log('[DEBUG] Store initialized successfully');
        console.log('[DEBUG] Config:', mergedConfig);
      }
    } catch (error) {
      appActions().setInitializationError(
        error instanceof Error ? error.message : 'Unknown initialization error'
      );
      if (props.debug) {
        console.log('[DEBUG] Store initialization failed:', error);
      }
    }
  }, [props]);

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

      // 2. 无需更新，初始化应用
      await initializeApp();
    };

    initialize();
  }, [versionCheckPromise, initializeApp, props.debug]);

  // 显示版本更新提示
  if (showUpdatePrompt && versionInfo) {
    return (
      <UpdatePrompt
        versionInfo={versionInfo}
        onComplete={async () => {
          setShowUpdatePrompt(false);
          await initializeApp();
        }}
      />
    );
  }

  // 等待初始化完成
  if (initializationStatus === 'pending' || initializationStatus === 'loading') {
    return (
      <Box padding={1}>
        <Text color="yellow">
          <Spinner type="dots" />
        </Text>
        <Text color="yellow"> Starting ClawdCode...</Text>
      </Box>
    );
  }

  // 初始化错误
  if (initializationStatus === 'error') {
    return (
      <Box padding={1} flexDirection="column">
        <Text color="red">❌ Initialization failed</Text>
        <Text color="gray">Please check your configuration and try again.</Text>
      </Box>
    );
  }

  // 显示主界面（使用 ClawdInterface）
  return <ClawdInterface {...mainProps} />;
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
