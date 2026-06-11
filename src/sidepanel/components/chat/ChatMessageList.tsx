import { useEffect, useRef } from 'react';
import type { Message } from '@/shared/types';
import { ChatMessage } from './ChatMessage';
import { StreamingMessage } from './StreamingMessage';

interface ChatMessageListProps {
  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;
  conversationTitle?: string;
}

export function ChatMessageList({ messages, isStreaming, streamingContent, conversationTitle }: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages or streaming content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  return (
    <div className="flex-1 overflow-y-auto">
      {messages.map((msg) => (
        <ChatMessage key={msg.id} message={msg} conversationTitle={conversationTitle} />
      ))}
      {isStreaming && <StreamingMessage content={streamingContent} />}
      <div ref={bottomRef} />
    </div>
  );
}
