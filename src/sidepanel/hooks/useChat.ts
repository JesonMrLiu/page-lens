import { useCallback, useRef } from 'react';
import { useChatStore } from '@/sidepanel/stores/chat-store';
import { modelConfigRepo } from '@/db/repositories/model-config.repo';
import { MSG_TYPES, STORAGE_KEYS, DEFAULT_NORMAL_ROUNDS, DEFAULT_DEEP_ROUNDS } from '@/shared/constants';
import type { ChatMessageInput, ThinkMode } from '@/shared/types';

/**
 * Hook for managing chat interactions with AI models.
 * Handles sending messages, streaming responses, and conversation management.
 */
export function useChat() {
  const store = useChatStore();
  const abortRef = useRef<AbortController | null>(null);

  const getThinkRounds = useCallback(async (mode: ThinkMode): Promise<number> => {
    if (mode === 'none') return 0;

    return new Promise((resolve) => {
      chrome.storage.local.get(
        [STORAGE_KEYS.THINK_NORMAL_ROUNDS, STORAGE_KEYS.THINK_DEEP_ROUNDS],
        (result) => {
          if (mode === 'normal') {
            resolve(result[STORAGE_KEYS.THINK_NORMAL_ROUNDS] || DEFAULT_NORMAL_ROUNDS);
          } else {
            resolve(result[STORAGE_KEYS.THINK_DEEP_ROUNDS] || DEFAULT_DEEP_ROUNDS);
          }
        },
      );
    });
  }, []);

  const sendMessage = useCallback(async (content: string, pageContext?: string | null) => {
    const { currentConversationId, selectedModelId, thinkMode } = store;

    // Get model config
    const model = selectedModelId
      ? modelConfigRepo.getById(selectedModelId)
      : modelConfigRepo.getDefault();

    if (!model) {
      throw new Error('请先在设置中配置 AI 模型');
    }

    // Create conversation if needed
    let convId = currentConversationId;
    if (!convId) {
      const conv = await store.createConversation(
        content.slice(0, 50) + (content.length > 50 ? '...' : ''),
        model.id,
        store.currentPageUrl ?? undefined,
        store.currentPageTitle ?? undefined,
      );
      convId = conv.id;
      store.setModel(model.id);
    }

    // Build messages array for API (before adding current message to store)
    const messages: ChatMessageInput[] = [];

    // Add page context as a system message if available
    if (pageContext) {
      messages.push({
        role: 'system',
        content: `以下是当前页面的内容，请作为参考上下文来回答用户的问题：\n\n${pageContext}`,
      });
    }

    // Add conversation history (exclude system messages from previous turns)
    const historyMessages = store.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
    messages.push(...historyMessages);

    // Add the current user message
    messages.push({ role: 'user', content });

    // Now persist the user message to DB (updates store for future turns)
    await store.addMessage('user', content);

    // Start streaming
    store.startStreaming();

    // Get think rounds config
    const thinkRounds = await getThinkRounds(thinkMode);

    // Create abort controller
    const abortController = new AbortController();
    abortRef.current = abortController;

    return new Promise<void>((resolve, reject) => {
      // Send request via background service worker
      // Include model config directly since service worker can't access sql.js
      chrome.runtime.sendMessage({
        type: MSG_TYPES.CHAT_REQUEST,
        conversationId: convId,
        modelConfigId: model.id,
        messages,
        modelConfig: {
          baseUrl: model.base_url,
          apiKey: model.api_key,
          model: model.model_id,
          maxTokens: model.max_tokens,
          temperature: model.temperature,
        },
        thinkMode,
        thinkRounds,
      });

      // Listen for stream chunks
      const listener = (message: any) => {
        if (message.conversationId !== convId) return;

        switch (message.type) {
          case MSG_TYPES.CHAT_STREAM_CHUNK:
            store.appendStreamContent(message.content);
            break;

          case 'THINK_STREAM_START':
            store.startThinking();
            break;

          case 'THINK_STREAM_CHUNK':
            store.appendThinkContent(message.round, message.content);
            break;

          case 'THINK_STREAM_ROUND_END':
            store.endThinkRound(message.round, message.fullContent);
            break;

          case MSG_TYPES.CHAT_STREAM_END:
            chrome.runtime.onMessage.removeListener(listener);
            store.endStreaming(message.fullContent, model.id, message.thinkingProcess)
              .then(() => resolve())
              .catch(reject);
            abortRef.current = null;
            break;

          case MSG_TYPES.CHAT_STREAM_ERROR:
            chrome.runtime.onMessage.removeListener(listener);
            store.cancelStreaming();
            abortRef.current = null;
            reject(new Error(message.error));
            break;
        }
      };

      chrome.runtime.onMessage.addListener(listener);
    });
  }, [store, getThinkRounds]);

  const cancelStream = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (store.currentConversationId) {
      chrome.runtime.sendMessage({
        type: MSG_TYPES.CANCEL_STREAM,
        conversationId: store.currentConversationId,
      });
    }
    store.cancelStreaming();
  }, [store]);

  return {
    ...store,
    sendMessage,
    cancelStream,
  };
}
