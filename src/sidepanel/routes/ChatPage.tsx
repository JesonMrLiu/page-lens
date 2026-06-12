import { useState, useCallback, useEffect, useRef } from 'react';
import { Plus, MessageSquare } from 'lucide-react';
import { ModelSelector } from '@/sidepanel/components/chat/ModelSelector';
import { ChatMessageList } from '@/sidepanel/components/chat/ChatMessageList';
import { ChatInput } from '@/sidepanel/components/chat/ChatInput';
import { QuickActions } from '@/sidepanel/components/chat/QuickActions';
import { EmptyState } from '@/sidepanel/components/shared/EmptyState';
import { useChat } from '@/sidepanel/hooks/useChat';
import { useModels } from '@/sidepanel/hooks/useModels';
import { modelConfigRepo } from '@/db/repositories/model-config.repo';
import { useToast } from '@/sidepanel/components/shared/Toast';
import { MSG_TYPES } from '@/shared/constants';
import type { ThinkMode } from '@/shared/types';

export function ChatPage() {
  const chat = useChat();
  const { models } = useModels();
  const { showToast } = useToast();
  const [sending, setSending] = useState(false);
  const [thinkMode, setThinkMode] = useState<ThinkMode>('none');
  const pageContextRef = useRef<{ url: string; content: string } | null>(null);

  // Set default model on mount
  useEffect(() => {
    if (!chat.selectedModelId && models.length > 0) {
      const defaultModel = modelConfigRepo.getDefault();
      if (defaultModel) {
        chat.setModel(defaultModel.id);
      }
    }
  }, [models, chat.selectedModelId, chat.setModel]);

  const handleSend = useCallback(async (content: string) => {
    setSending(true);
    try {
      let pageContext: string | null = null;

      try {
        // 获取当前标签页 URL，判断是否切换了页面
        const tabResponse = await chrome.runtime.sendMessage({
          type: MSG_TYPES.GET_ACTIVE_TAB,
        });
        const currentUrl = tabResponse?.url || '';

        // URL 变化或首次发送时，重新提取页面内容
        if (currentUrl !== pageContextRef.current?.url) {
          const response = await chrome.runtime.sendMessage({
            type: MSG_TYPES.EXTRACT_PAGE,
          });
          if (response?.data?.textContent) {
            pageContext = response.data.textContent;
            pageContextRef.current = { url: currentUrl, content: response.data.textContent };
          }
        } else {
          // 同一页面，复用缓存
          pageContext = pageContextRef.current?.content || null;
        }
      } catch {
        // 提取失败时静默忽略，消息照常发送
      }

      // Set think mode in store before sending
      chat.setThinkMode(thinkMode);
      await chat.sendMessage(content, pageContext);
    } catch (err: any) {
      showToast('error', err.message || '发送失败');
    } finally {
      setSending(false);
    }
  }, [chat, showToast, thinkMode]);

  const handleQuickAction = useCallback((prompt: string) => {
    handleSend(prompt);
  }, [handleSend]);

  const handleNewChat = useCallback(() => {
    chat.clearCurrentChat();
  }, [chat]);

  const hasMessages = chat.messages.length > 0 || chat.isStreaming;
  const hasModels = models.length > 0;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-white shrink-0">
        <ModelSelector
          models={models}
          selectedId={chat.selectedModelId}
          onSelect={chat.setModel}
          disabled={chat.isStreaming}
        />
        <button
          onClick={handleNewChat}
          className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-md transition-colors"
          title="新对话"
        >
          <Plus size={14} />
          新对话
        </button>
      </div>

      {/* Messages area */}
      {hasMessages ? (
        <ChatMessageList
          messages={chat.messages}
          isStreaming={chat.isStreaming}
          streamingContent={chat.streamingContent}
          conversationTitle={chat.conversations.find(c => c.id === chat.currentConversationId)?.title}
          thinkingProcess={chat.thinkingProcess}
          isThinking={chat.isThinking}
          currentThinkRound={chat.currentThinkRound}
        />
      ) : (
        <EmptyState
          icon={<MessageSquare size={48} />}
          title="开始对话"
          description={hasModels ? '输入消息开始与 AI 对话，或使用下方快捷操作' : '请先在设置中配置 AI 模型'}
        />
      )}

      {/* Quick actions */}
      {hasModels && !chat.isStreaming && (
        <QuickActions
          onAction={handleQuickAction}
          disabled={!hasModels || sending}
        />
      )}

      {/* Input area */}
      <ChatInput
        onSend={handleSend}
        onCancel={chat.cancelStream}
        isStreaming={chat.isStreaming}
        disabled={sending && !chat.isStreaming}
        thinkMode={thinkMode}
        onThinkModeChange={setThinkMode}
      />
    </div>
  );
}
