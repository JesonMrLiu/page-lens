import { Bot, User, Copy, Check, Bookmark } from 'lucide-react';
import { useState, useMemo } from 'react';
import type { Message } from '@/shared/types';
import { formatDate } from '@/shared/utils';
import { noteRepo } from '@/db/repositories/note.repo';
import { conversationRepo } from '@/db/repositories/conversation.repo';
import { modelConfigRepo } from '@/db/repositories/model-config.repo';
import { useToast } from '@/sidepanel/components/shared/Toast';
import { MarkdownRenderer } from '@/sidepanel/components/shared/MarkdownRenderer';
import { MSG_TYPES } from '@/shared/constants';
import { ThinkingProcessPanel } from './ThinkingProcessPanel';
import { useTranslation } from '@/sidepanel/contexts/LanguageContext';

interface ChatMessageProps {
  message: Message;
  conversationTitle?: string;
}

async function generateTitleByAI(content: string): Promise<string> {
  try {
    const model = modelConfigRepo.getDefault();
    if (!model) return '';
    const response = await chrome.runtime.sendMessage({
      type: MSG_TYPES.GENERATE_TITLE,
      content,
      modelConfig: {
        baseUrl: model.base_url,
        apiKey: model.api_key,
        model: model.model_id,
      },
    });
    return response?.success && response.title ? response.title : '';
  } catch {
    return '';
  }
}

export function ChatMessage({ message, conversationTitle }: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const initialSaved = useMemo(() => noteRepo.getByMessageId(message.id) !== null, [message.id]);
  const [saved, setSaved] = useState(initialSaved);
  const { showToast } = useToast();
  const { t, locale } = useTranslation();
  const isUser = message.role === 'user';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveAsNote = async () => {
    if (saved) {
      showToast('info', t('chatMessage.alreadySaved'));
      return;
    }
    try {
      const conversation = conversationRepo.getById(message.conversation_id);

      let title = conversation?.page_title?.trim() || '';
      if (!title) {
        title = await generateTitleByAI(message.content);
      }
      if (!title) {
        title = conversationTitle || message.content.slice(0, 30) + '...';
      }

      await noteRepo.create({
        title,
        content: message.content,
        source_url: conversation?.page_url || '',
        source_type: 'chat',
        conversation_id: message.conversation_id,
        message_id: message.id,
      });
      setSaved(true);
      showToast('success', t('chatMessage.savedAsNote'));
    } catch (err) {
      console.error('[PageLens] Failed to save note:', err);
      showToast('error', t('chatMessage.saveFailed'));
    }
  };

  return (
    <div className={`flex gap-2.5 px-4 py-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div
        className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
          isUser
            ? 'bg-primary-600 dark:bg-primary-500 text-white'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
        }`}
      >
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>

      {/* Content */}
      <div className={`flex-1 min-w-0 ${isUser ? 'text-right' : 'text-left'}`}>
        {/* Thinking process panel */}
        {!isUser && message.thinking_process && message.thinking_process.length > 0 && (
          <ThinkingProcessPanel
            processes={message.thinking_process}
            isThinking={false}
          />
        )}

        <div
          className={`inline-block text-left max-w-[90%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
            isUser
              ? 'bg-primary-600 dark:bg-primary-500 text-white rounded-br-sm'
              : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-bl-sm'
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          ) : (
            <MarkdownRenderer
              content={message.content}
              className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-pre:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-code:text-primary-700 prose-code:bg-primary-50 dark:prose-code:text-primary-300 dark:prose-code:bg-primary-900/30 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none"
            />
          )}
        </div>

        {/* Meta row */}
        <div className={`flex items-center gap-2 mt-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            {formatDate(message.created_at, locale)}
          </span>
          {!isUser && (
            <>
              <button
                onClick={handleCopy}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                title={t('chatMessage.copy')}
              >
                {copied ? <Check size={12} className="text-green-500 dark:text-green-400" /> : <Copy size={12} />}
              </button>
              <button
                onClick={handleSaveAsNote}
                className={`transition-colors ${saved ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`}
                title={saved ? t('chatMessage.saved') : t('chatMessage.saveAsNote')}
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
