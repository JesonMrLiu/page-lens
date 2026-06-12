import { Bot, User, Copy, Check, Bookmark } from 'lucide-react';
import { useState } from 'react';
import type { Message } from '@/shared/types';
import { formatDate } from '@/shared/utils';
import { noteRepo } from '@/db/repositories/note.repo';
import { useToast } from '@/sidepanel/components/shared/Toast';
import { MarkdownRenderer } from '@/sidepanel/components/shared/MarkdownRenderer';
import { ThinkingProcessPanel } from './ThinkingProcessPanel';

interface ChatMessageProps {
  message: Message;
  conversationTitle?: string;
}

export function ChatMessage({ message, conversationTitle }: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const { showToast } = useToast();
  const isUser = message.role === 'user';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveAsNote = async () => {
    try {
      const title = conversationTitle || message.content.slice(0, 30) + '...';
      await noteRepo.create({
        title,
        content: message.content,
        source_type: 'chat',
        conversation_id: message.conversation_id,
      });
      setSaved(true);
      showToast('success', '已保存为笔记');
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('[PageLens] Failed to save note:', err);
      showToast('error', '保存失败');
    }
  };

  return (
    <div className={`flex gap-2.5 px-4 py-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div
        className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
          isUser
            ? 'bg-primary-600 text-white'
            : 'bg-gray-100 text-gray-600'
        }`}
      >
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>

      {/* Content */}
      <div className={`flex-1 min-w-0 ${isUser ? 'text-right' : 'text-left'}`}>
        {/* Thinking process panel (only for assistant messages) */}
        {!isUser && message.thinking_process && message.thinking_process.length > 0 && (
          <ThinkingProcessPanel
            processes={message.thinking_process}
            isThinking={false}
          />
        )}

        <div
          className={`inline-block text-left max-w-[90%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
            isUser
              ? 'bg-primary-600 text-white rounded-br-sm'
              : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          ) : (
            <MarkdownRenderer
              content={message.content}
              className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-pre:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-code:text-primary-700 prose-code:bg-primary-50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none"
            />
          )}
        </div>

        {/* Meta row */}
        <div className={`flex items-center gap-2 mt-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
          <span className="text-[10px] text-gray-400">
            {formatDate(message.created_at)}
          </span>
          {!isUser && (
            <>
              <button
                onClick={handleCopy}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                title="复制"
              >
                {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
              </button>
              <button
                onClick={handleSaveAsNote}
                className={`transition-colors ${saved ? 'text-primary-600' : 'text-gray-400 hover:text-gray-600'}`}
                title={saved ? '已保存' : '保存为笔记'}
              >
                <Bookmark size={12} fill={saved ? 'currentColor' : 'none'} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
