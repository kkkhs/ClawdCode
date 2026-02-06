/**
 * MessageList - 消息列表组件
 * 
 * 优化策略：
 * - 订阅消息 ID 列表而非整个消息数组
 * - 每条消息独立渲染，只有变化的消息会重新渲染
 * - 流式消息单独处理
 */

import React from 'react';
import { Box } from 'ink';
import { MessageRenderer } from '../markdown/MessageRenderer.js';
import { useMessageIds, useMessageById } from '../../../store/selectors.js';

interface MessageItemProps {
  id: string;
  terminalWidth: number;
}

/**
 * 单条消息组件 - 独立订阅自己的状态
 */
const MessageItem: React.FC<MessageItemProps> = React.memo(({ id, terminalWidth }) => {
  const message = useMessageById(id);
  
  if (!message) return null;
  
  return (
    <MessageRenderer
      content={message.content}
      role={message.role}
      terminalWidth={terminalWidth}
      showPrefix={true}
      thinking={message.thinking}
      isStreaming={message.isStreaming}
    />
  );
});

MessageItem.displayName = 'MessageItem';

interface MessageListProps {
  terminalWidth: number;
}

/**
 * 消息列表组件
 */
export const MessageList: React.FC<MessageListProps> = React.memo(({ terminalWidth }) => {
  const messageIds = useMessageIds();
  
  return (
    <Box flexDirection="column">
      {messageIds.map((id) => (
        <MessageItem
          key={id}
          id={id}
          terminalWidth={terminalWidth}
        />
      ))}
    </Box>
  );
});

MessageList.displayName = 'MessageList';

export default MessageList;
