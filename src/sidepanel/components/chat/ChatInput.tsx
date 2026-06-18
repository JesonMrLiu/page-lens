import { useState, useRef, useEffect, type KeyboardEvent, type ClipboardEvent, type DragEvent } from 'react';
import { Send, Square, Paperclip, X, FileText } from 'lucide-react';
import { ThinkModeSelector } from './ThinkModeSelector';
import { useTranslation } from '@/sidepanel/contexts/LanguageContext';
import { useToast } from '@/sidepanel/components/shared/Toast';
import { processFiles, MAX_IMAGES_PER_MESSAGE, ACCEPT_ATTR } from '@/sidepanel/utils/attachment';
import type { ThinkMode, Attachment } from '@/shared/types';

interface ChatInputProps {
  onSend: (content: string, attachments: Attachment[]) => void;
  onCancel: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  placeholder?: string;
  thinkMode: ThinkMode;
  onThinkModeChange: (mode: ThinkMode) => void;
}

export function ChatInput({ onSend, onCancel, isStreaming, disabled, placeholder, thinkMode, onThinkModeChange }: ChatInputProps) {
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();
  const { showToast } = useToast();

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px';
    }
  }, [value]);

  const handleFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;

    // 限制单条消息图片总数
    const currentImageCount = attachments.filter((a) => a.kind === 'image').length;
    const remaining = Math.max(0, MAX_IMAGES_PER_MESSAGE - currentImageCount);
    if (arr.some((f) => f.type.startsWith('image/')) && remaining <= 0) {
      showToast('error', t('chatInput.tooManyImages', { count: MAX_IMAGES_PER_MESSAGE }));
    }

    const { attachments: processed, errors } = await processFiles(arr);

    // 图片受数量额度限制；文本附件不限数量
    const result: Attachment[] = [];
    let budget = remaining;
    for (const a of processed) {
      if (a.kind === 'image') {
        if (budget > 0) {
          result.push(a);
          budget -= 1;
        }
        continue;
      }
      result.push(a);
    }
    if (result.length > 0) {
      setAttachments((prev) => [...prev, ...result]);
    }
    if (errors.length > 0) {
      showToast('error', errors[0]);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSend = () => {
    const trimmed = value.trim();
    if ((!trimmed && attachments.length === 0) || disabled || isStreaming) return;
    onSend(trimmed, attachments);
    setValue('');
    setAttachments([]);
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

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) imageFiles.push(f);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault(); // 阻止图片被当作文本插入
      handleFiles(imageFiles);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer?.files?.length) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  return (
    <div
      className={`border-t p-3 shrink-0 transition-colors ${isDragOver ? 'border-t-2 border-primary-500 bg-primary-50/30 dark:bg-primary-900/10' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Think mode selector */}
      <div className="mb-2">
        <ThinkModeSelector
          value={thinkMode}
          onChange={onThinkModeChange}
          disabled={isStreaming}
        />
      </div>

      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="relative flex items-center gap-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg p-1.5 pr-6 max-w-[200px]"
            >
              {a.kind === 'image' && a.dataUrl ? (
                <img
                  src={a.dataUrl}
                  alt={a.name}
                  className="w-9 h-9 rounded object-cover shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center shrink-0">
                  <FileText size={16} className="text-primary-600 dark:text-primary-400" />
                </div>
              )}
              <span className="text-xs text-gray-600 dark:text-gray-300 truncate" title={a.name}>
                {a.name}
              </span>
              <button
                onClick={() => removeAttachment(a.id)}
                className="absolute top-0 right-0 w-4 h-4 bg-gray-300 dark:bg-gray-600 hover:bg-red-500 text-white rounded-full flex items-center justify-center transition-colors"
                title={t('chatInput.removeAttachment')}
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept={ACCEPT_ATTR}
        onChange={(e) => {
          if (e.target.files?.length) handleFiles(e.target.files);
          e.target.value = ''; // 允许重复选择同一文件
        }}
      />

      <div className="flex items-end gap-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isStreaming}
          className="shrink-0 w-9 h-9 text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title={t('chatInput.attach')}
        >
          <Paperclip size={16} />
        </button>
        <textarea
          ref={textareaRef}
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 focus:border-transparent min-h-[36px] max-h-[160px] bg-white dark:bg-gray-700 dark:text-gray-100"
          placeholder={placeholder ?? t('chatInput.placeholder')}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
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
            disabled={(!value.trim() && attachments.length === 0) || disabled}
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
