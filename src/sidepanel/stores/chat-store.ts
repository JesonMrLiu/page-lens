import { create } from 'zustand';
import { conversationRepo, messageRepo } from '@/db/repositories/conversation.repo';
import { normalizePageUrl } from '@/shared/utils';
import { MSG_TYPES } from '@/shared/constants';
import type { Conversation, Message, ThinkMode, ThinkingProcess } from '@/shared/types';

interface ChatState {
  conversations: Conversation[];
  currentConversationId: number | null;
  messages: Message[];
  selectedModelId: number | null;
  isStreaming: boolean;
  streamingContent: string;
  thinkMode: ThinkMode;
  thinkingProcess: ThinkingProcess[];
  isThinking: boolean;
  currentThinkRound: number;
  // Page context for conversation isolation
  currentPageUrl: string | null;
  currentPageTitle: string | null;
  // Chunked summary progress
  summaryProgress: { current: number; total: number } | null;

  // Actions
  loadConversations: () => void;
  createConversation: (title?: string, modelConfigId?: number, pageUrl?: string, pageTitle?: string) => Promise<Conversation>;
  selectConversation: (id: number) => void;
  setModel: (modelId: number) => void;
  setThinkMode: (mode: ThinkMode) => void;
  addMessage: (role: Message['role'], content: string, modelConfigId?: number, thinkingProcess?: ThinkingProcess[]) => Promise<Message>;
  startStreaming: () => void;
  appendStreamContent: (chunk: string) => void;
  endStreaming: (fullContent: string, modelConfigId?: number, thinkingProcess?: ThinkingProcess[]) => Promise<Message>;
  cancelStreaming: () => void;
  startThinking: () => void;
  appendThinkContent: (round: number, content: string) => void;
  endThinkRound: (round: number, fullContent: string) => void;
  endThinking: () => void;
  deleteConversation: (id: number) => Promise<void>;
  clearCurrentChat: () => void;
  // Page context actions
  setPageContext: (url: string, title: string) => void;
  getConversationsForCurrentPage: () => Conversation[];
  // Summary progress actions
  setSummaryProgress: (current: number, total: number) => void;
  clearSummaryProgress: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  messages: [],
  selectedModelId: null,
  isStreaming: false,
  streamingContent: '',
  thinkMode: 'none',
  thinkingProcess: [],
  isThinking: false,
  currentThinkRound: 0,
  currentPageUrl: null,
  currentPageTitle: null,
  summaryProgress: null,

  loadConversations: () => {
    const conversations = conversationRepo.getAll();
    set({ conversations });
  },

  createConversation: async (title?: string, modelConfigId?: number, pageUrl?: string, pageTitle?: string) => {
    const conversation = await conversationRepo.create(title, modelConfigId, pageUrl, pageTitle);
    set((state) => ({
      conversations: [conversation, ...state.conversations],
      currentConversationId: conversation.id,
      messages: [],
    }));
    return conversation;
  },

  selectConversation: (id: number) => {
    const messages = messageRepo.getByConversationId(id);
    set({
      currentConversationId: id,
      messages,
      streamingContent: '',
      isStreaming: false,
    });
  },

  setModel: (modelId: number) => {
    set({ selectedModelId: modelId });
  },

  setThinkMode: (mode: ThinkMode) => {
    set({ thinkMode: mode });
  },

  addMessage: async (role, content, modelConfigId, thinkingProcess) => {
    const { currentConversationId } = get();
    if (!currentConversationId) {
      throw new Error('No active conversation');
    }
    const message = await messageRepo.create(
      currentConversationId,
      role,
      content,
      modelConfigId,
      thinkingProcess,
    );
    set((state) => ({
      messages: [...state.messages, message],
    }));
    return message;
  },

  startStreaming: () => {
    set({
      isStreaming: true,
      streamingContent: '',
      thinkingProcess: [],
      isThinking: false,
      currentThinkRound: 0,
    });
  },

  appendStreamContent: (chunk: string) => {
    set((state) => ({
      streamingContent: state.streamingContent + chunk,
      // 兜底：正文 chunk 已到达，思考必然已结束，确保面板收起
      // 不依赖 THINK_STREAM_END 事件是否送达
      isThinking: state.isThinking ? false : state.isThinking,
    }));
  },

  endStreaming: async (fullContent: string, modelConfigId?: number, thinkingProcess?: ThinkingProcess[]) => {
    const { currentConversationId } = get();
    set({ isStreaming: false, streamingContent: '', isThinking: false });

    if (!currentConversationId) {
      throw new Error('No active conversation');
    }

    const message = await messageRepo.create(
      currentConversationId,
      'assistant',
      fullContent,
      modelConfigId,
      thinkingProcess,
    );
    set((state) => ({
      messages: [...state.messages, message],
    }));
    return message;
  },

  cancelStreaming: () => {
    set({
      isStreaming: false,
      streamingContent: '',
      isThinking: false,
      thinkingProcess: [],
      currentThinkRound: 0,
    });
  },

  startThinking: () => {
    set({
      isThinking: true,
      thinkingProcess: [],
      currentThinkRound: 1,
    });
  },

  appendThinkContent: (round: number, content: string) => {
    set((state) => {
      const existingIndex = state.thinkingProcess.findIndex((p) => p.round === round);
      if (existingIndex >= 0) {
        const updated = [...state.thinkingProcess];
        updated[existingIndex] = {
          ...updated[existingIndex],
          content: updated[existingIndex].content + content,
        };
        return { thinkingProcess: updated };
      } else {
        return {
          thinkingProcess: [
            ...state.thinkingProcess,
            { round, content, isThinking: true },
          ],
        };
      }
    });
  },

  endThinkRound: (round: number, fullContent: string) => {
    set((state) => {
      const existingIndex = state.thinkingProcess.findIndex((p) => p.round === round);
      if (existingIndex >= 0) {
        const updated = [...state.thinkingProcess];
        updated[existingIndex] = { round, content: fullContent, isThinking: true };
        return {
          thinkingProcess: updated,
          currentThinkRound: round + 1,
        };
      } else {
        return {
          thinkingProcess: [
            ...state.thinkingProcess,
            { round, content: fullContent, isThinking: true },
          ],
          currentThinkRound: round + 1,
        };
      }
    });
  },

  endThinking: () => {
    set({ isThinking: false });
  },

  deleteConversation: async (id: number) => {
    await conversationRepo.delete(id);
    const { currentConversationId } = get();
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== id),
      currentConversationId: currentConversationId === id ? null : currentConversationId,
      messages: currentConversationId === id ? [] : state.messages,
    }));
  },

  clearCurrentChat: () => {
    set({
      currentConversationId: null,
      messages: [],
      streamingContent: '',
      isStreaming: false,
      thinkMode: 'none',
      thinkingProcess: [],
      isThinking: false,
      currentThinkRound: 0,
    });
  },

  setPageContext: (url: string, title: string) => {
    const normalizedUrl = normalizePageUrl(url);
    const { currentPageUrl, isStreaming, currentConversationId } = get();

    // Same page — no change needed
    if (normalizedUrl === currentPageUrl) return;

    // Cancel active stream when switching pages
    if (isStreaming && currentConversationId) {
      chrome.runtime.sendMessage({
        type: MSG_TYPES.CANCEL_STREAM,
        conversationId: currentConversationId,
      });
    }

    // Update page context and reload conversations for this page
    const pageConversations = conversationRepo.getByPageUrl(normalizedUrl);

    if (pageConversations.length > 0) {
      // Auto-select the most recent conversation for this page
      const latest = pageConversations[0];
      const messages = messageRepo.getByConversationId(latest.id);
      set({
        currentPageUrl: normalizedUrl,
        currentPageTitle: title,
        currentConversationId: latest.id,
        messages,
        streamingContent: '',
        isStreaming: false,
      });
    } else {
      // No conversations for this page — show empty state
      set({
        currentPageUrl: normalizedUrl,
        currentPageTitle: title,
        currentConversationId: null,
        messages: [],
        streamingContent: '',
        isStreaming: false,
      });
    }
  },

  getConversationsForCurrentPage: () => {
    const { conversations, currentPageUrl } = get();
    if (!currentPageUrl) {
      // No page context — show conversations without page_url (legacy/global)
      return conversations.filter((c) => !c.page_url);
    }
    return conversations.filter(
      (c) => normalizePageUrl(c.page_url) === currentPageUrl,
    );
  },

  setSummaryProgress: (current: number, total: number) => {
    set({ summaryProgress: { current, total } });
  },

  clearSummaryProgress: () => {
    set({ summaryProgress: null });
  },
}));
