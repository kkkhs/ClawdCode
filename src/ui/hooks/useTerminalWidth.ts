/**
 * useTerminalWidth - 监听终端宽度变化
 */

import { useState, useEffect } from 'react';

/**
 * 获取并监听终端宽度
 * @returns 当前终端宽度
 */
export const useTerminalWidth = (): number => {
  const [width, setWidth] = useState(process.stdout.columns || 80);

  useEffect(() => {
    const handleResize = () => {
      setWidth(process.stdout.columns || 80);
    };

    process.stdout.on('resize', handleResize);
    
    return () => {
      process.stdout.off('resize', handleResize);
    };
  }, []);

  return width;
};

/**
 * 获取并监听终端高度
 * @returns 当前终端高度
 */
export const useTerminalHeight = (): number => {
  const [height, setHeight] = useState(process.stdout.rows || 24);

  useEffect(() => {
    const handleResize = () => {
      setHeight(process.stdout.rows || 24);
    };

    process.stdout.on('resize', handleResize);
    
    return () => {
      process.stdout.off('resize', handleResize);
    };
  }, []);

  return height;
};

/**
 * 获取终端尺寸（宽度和高度）
 */
export const useTerminalSize = (): { width: number; height: number } => {
  const width = useTerminalWidth();
  const height = useTerminalHeight();
  return { width, height };
};
