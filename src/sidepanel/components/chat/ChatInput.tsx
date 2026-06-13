import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { Send, Square } from 'lucide-react';
import { ThinkModeSelector } from './ThinkModeSelector';
import { useTranslation } from '@/sidepanel/contexts/LanguageContext';
import type { ThinkMode } from '@/shared/types';

interface ChatInputProps {
  onSend: (content: string) => void;
  onCancel: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  placeholder?: string;
  thinkMode: ThinkMode;
  onThinkModeChange: (mode: ThinkMode) => void;
}

export function ChatInput({ onSend, onCancel, isStreaming, disabled, placeholder, thinkMode, onThinkModeChange }: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { t } = useTranslation();

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px';
    }
  }, [value]);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled || isStreaming) return;
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 shrink-0">
      {/* Think mode selector */}
      <div className="mb-2">
        <ThinkModeSelector
          value={thinkMode}
          onChange={onThinkModeChange}
          disabled={isStreaming}
        />
      </div>

      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 focus:border-transparent min-h-[36px] max-h-[160px] bg-white dark:bg-gray-700 dark:text-gray-100"
          placeholder={placeholder ?? t('chatInput.placeholder')}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
        />
        {isStreaming ? (
          <button
            onClick={onCancel}
            className="shrink-0 w-9 h-9 bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white rounded-lg flex items-center justify-center transition-colors"
            title={t('chatInput.stopGenerating')}
          >
            <Square size={14} />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!value.trim() || disabled}
            className="shrink-0 w-9 h-9 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white rounded-lg flex items-center justify-center transition-colors disabled:cursor-not-allowed"
            title={t('chatInput.send')}
          >
            <Send size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
