import { useState, useCallback, useEffect, useRef } from 'react';
import { Plus, MessageSquare, Globe, Loader2 } from 'lucide-react';
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
import { extractDomain } from '@/shared/utils';
import { useTranslation } from '@/sidepanel/contexts/LanguageContext';
import type { ThinkMode } from '@/shared/types';

export function ChatPage() {
  const chat = useChat();
  const { models } = useModels();
  const { showToast } = useToast();
  const { t } = useTranslation();
  const [sending, setSending] = useState(false);
  const [thinkMode, setThinkMode] = useState<ThinkMode>('none');
  const pageContextRef = useRef<{ url: string; content: string; comments?: any[] | null; title?: string | null } | null>(null);
  const tabListenerRegistered = useRef(false);
  const currentWindowId = useRef<number | null>(null);

  // Ensure selectedModelId is valid: set default on mount, and re-select default
  // when the currently selected model no longer exists (e.g. deleted/deactivated).
  useEffect(() => {
    const selectedExists =
      chat.selectedModelId != null &&
      models.some((m) => m.id === chat.selectedModelId);

    if (!selectedExists && models.length > 0) {
      const defaultModel = modelConfigRepo.getDefault();
      if (defaultModel) {
        chat.setModel(defaultModel.id);
      }
    }
  }, [models, chat.selectedModelId, chat.setModel]);

  // Get current window ID on mount
  useEffect(() => {
    chrome.windows.getCurrent().then((win) => {
      currentWindowId.current = win.id ?? null;
    });
  }, []);

  // Detect initial page URL on mount
  useEffect(() => {
    const detectInitialPage = async () => {
      try {
        const tabResponse = await chrome.runtime.sendMessage({
          type: MSG_TYPES.GET_ACTIVE_TAB,
        });
        if (tabResponse?.url && (tabResponse.url.startsWith('http://') || tabResponse.url.startsWith('https://'))) {
          chat.setPageContext(tabResponse.url, tabResponse.title || '');
        }
      } catch {
        // Silently ignore
      }
    };
    detectInitialPage();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for tab URL changes
  useEffect(() => {
    if (tabListenerRegistered.current) return;
    tabListenerRegistered.current = true;

    const handleTabUpdated = (
      _tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
      tab: chrome.tabs.Tab,
    ) => {
      if (changeInfo.url && tab.active && tab.windowId === currentWindowId.current) {
        const url = changeInfo.url;
        if (url.startsWith('http://') || url.startsWith('https://')) {
          chat.setPageContext(url, tab.title || '');
        }
      }
    };

    const handleTabActivated = async (activeInfo: chrome.tabs.TabActiveInfo) => {
      if (activeInfo.windowId !== currentWindowId.current) return;
      try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
          chat.setPageContext(tab.url, tab.title || '');
        }
      } catch {
        // Tab may not be accessible
      }
    };

    chrome.tabs.onUpdated.addListener(handleTabUpdated);
    chrome.tabs.onActivated.addListener(handleTabActivated);

    return () => {
      chrome.tabs.onUpdated.removeListener(handleTabUpdated);
      chrome.tabs.onActivated.removeListener(handleTabActivated);
      tabListenerRegistered.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = useCallback(async (content: string) => {
    setSending(true);
    try {
      let pageContext: string | null = null;
      let comments: any[] | null = null;
      let pageTitle: string | null = null;

      try {
        const tabResponse = await chrome.runtime.sendMessage({
          type: MSG_TYPES.GET_ACTIVE_TAB,
        });
        const currentUrl = tabResponse?.url || '';

        if (currentUrl !== pageContextRef.current?.url) {
          const response = await chrome.runtime.sendMessage({
            type: MSG_TYPES.EXTRACT_PAGE,
          });
          if (response?.data?.textContent) {
            pageContext = response.data.textContent;
            comments = response.data.comments || null;
            pageTitle = response.data.title || null;
            pageContextRef.current = { url: currentUrl, content: response.data.textContent, comments, title: pageTitle };
          }
        } else {
          pageContext = pageContextRef.current?.content || null;
          comments = pageContextRef.current?.comments || null;
          pageTitle = pageContextRef.current?.title || null;
        }
      } catch {
        // Silently ignore
      }

      await chat.sendMessage(content, pageContext, thinkMode, comments, pageTitle);
    } catch (err: any) {
      showToast('error', err.message || t('chat.sendFailed'));
    } finally {
      setSending(false);
    }
  }, [chat, showToast, thinkMode, t]);

  const handleQuickAction = useCallback((prompt: string) => {
    handleSend(prompt);
  }, [handleSend]);

  const handleNewChat = useCallback(() => {
    chat.clearCurrentChat();
  }, [chat]);

  const hasMessages = chat.messages.length > 0 || chat.isStreaming;
  const hasModels = models.length > 0;
  const pageDomain = chat.currentPageUrl ? extractDomain(chat.currentPageUrl) : null;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <ModelSelector
            models={models}
            selectedId={chat.selectedModelId}
            onSelect={chat.setModel}
            disabled={chat.isStreaming}
          />
          {pageDomain && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-700 rounded shrink-0" title={chat.currentPageUrl ?? ''}>
              <Globe size={10} />
              {pageDomain}
            </span>
          )}
        </div>
        <button
          onClick={handleNewChat}
          className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-md transition-colors shrink-0"
          title={t('chat.newChat')}
        >
          <Plus size={14} />
          {t('chat.newChat')}
        </button>
      </div>

      {/* Summary progress indicator */}
      {chat.summaryProgress && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800 shrink-0">
          <Loader2 size={14} className="animate-spin" />
          <span>正在分析页面内容 ({chat.summaryProgress.current}/{chat.summaryProgress.total})...</span>
        </div>
      )}

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
          title={t('chat.emptyTitle')}
          description={hasModels ? t('chat.emptyDescWithModels') : t('chat.emptyDescNoModels')}
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
