import { create } from 'zustand';
import { conversationRepo, messageRepo } from '@/db/repositories/conversation.repo';
import type { Conversation, Message } from '@/shared/types';

interface ChatState {
  conversations: Conversation[];
  currentConversationId: number | null;
  messages: Message[];
  selectedModelId: number | null;
  isStreaming: boolean;
  streamingContent: string;

  // Actions
  loadConversations: () => void;
  createConversation: (title?: string, modelConfigId?: number) => Promise<Conversation>;
  selectConversation: (id: number) => void;
  setModel: (modelId: number) => void;
  addMessage: (role: Message['role'], content: string, modelConfigId?: number) => Promise<Message>;
  startStreaming: () => void;
  appendStreamContent: (chunk: string) => void;
  endStreaming: (fullContent: string, modelConfigId?: number) => Promise<Message>;
  cancelStreaming: () => void;
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

  addMessage: async (role, content, modelConfigId) => {
    const { currentConversationId } = get();
    if (!currentConversationId) {
      throw new Error('No active conversation');
    }
    const message = await messageRepo.create(
      currentConversationId,
      role,
      content,
      modelConfigId,
    );
    set((state) => ({
      messages: [...state.messages, message],
    }));
    return message;
  },

  startStreaming: () => {
    set({ isStreaming: true, streamingContent: '' });
  },

  appendStreamContent: (chunk: string) => {
    set((state) => ({
      streamingContent: state.streamingContent + chunk,
    }));
  },

  endStreaming: async (fullContent: string, modelConfigId?: number) => {
    const { currentConversationId } = get();
    set({ isStreaming: false, streamingContent: '' });

    if (!currentConversationId) {
      throw new Error('No active conversation');
    }

    const message = await messageRepo.create(
      currentConversationId,
      'assistant',
      fullContent,
      modelConfigId,
    );
    set((state) => ({
      messages: [...state.messages, message],
    }));
    return message;
  },

  cancelStreaming: () => {
    set({ isStreaming: false, streamingContent: '' });
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
    });
  },
}));
