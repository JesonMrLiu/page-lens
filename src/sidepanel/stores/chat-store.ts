import { create } from 'zustand';
import { conversationRepo, messageRepo } from '@/db/repositories/conversation.repo';
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

  // Actions
  loadConversations: () => void;
  createConversation: (title?: string, modelConfigId?: number) => Promise<Conversation>;
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

  loadConversations: () => {
    const conversations = conversationRepo.getAll();
    set({ conversations });
  },

  createConversation: async (title?: string, modelConfigId?: number) => {
    const conversation = await conversationRepo.create(title, modelConfigId);
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
        // Update existing round content
        const updated = [...state.thinkingProcess];
        updated[existingIndex] = {
          ...updated[existingIndex],
          content: updated[existingIndex].content + content,
        };
        return { thinkingProcess: updated };
      } else {
        // Add new round
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
        // Update existing round with full content
        const updated = [...state.thinkingProcess];
        updated[existingIndex] = { round, content: fullContent, isThinking: true };
        return {
          thinkingProcess: updated,
          currentThinkRound: round + 1,
        };
      } else {
        // Add completed round
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
}));
