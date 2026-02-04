/**
 * ErrorBoundary - React 错误边界组件
 * 
 * 用于捕获子组件树中的 JavaScript 错误，
 * 记录错误并显示备用 UI，而不是让整个应用崩溃。
 */

import React from 'react';
import { Box, Text } from 'ink';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    // 更新 state 以便下次渲染显示备用 UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // 可以在这里记录错误到日志服务
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      // 如果提供了自定义 fallback，使用它
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // 默认错误 UI
      return (
        <Box flexDirection="column" padding={1}>
          <Text color="red" bold>
            ❌ Application Error
          </Text>
          <Box marginTop={1}>
            <Text color="yellow">
              An unexpected error occurred. Please restart the application.
            </Text>
          </Box>
          {this.state.error && (
            <Box marginTop={1} flexDirection="column">
              <Text color="gray">Error: {this.state.error.message}</Text>
              {this.state.error.stack && (
                <Box marginTop={1}>
                  <Text color="gray" dimColor>
                    {this.state.error.stack.split('\n').slice(0, 5).join('\n')}
                  </Text>
                </Box>
              )}
            </Box>
          )}
          <Box marginTop={1}>
            <Text color="cyan">Press Ctrl+C to exit</Text>
          </Box>
        </Box>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
