import { getDb, saveDatabase, getNextId } from '../database';
import type { Conversation, Message, ThinkingProcess } from '@/shared/types';
import { normalizePageUrl } from '@/shared/utils';

function now(): string {
  return new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
}

export const conversationRepo = {
  getAll(): Conversation[] {
    return getDb().conversations.sort((a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  },

  getById(id: number): Conversation | null {
    return getDb().conversations.find(c => c.id === id) ?? null;
  },

  async create(title: string = 'New Chat', modelConfigId?: number, pageUrl?: string, pageTitle?: string): Promise<Conversation> {
    const item: Conversation = {
      id: getNextId(),
      title,
      model_config_id: modelConfigId ?? null,
      page_url: pageUrl ?? '',
      page_title: pageTitle ?? '',
      created_at: now(),
      updated_at: now(),
    };
    getDb().conversations.push(item);
    await saveDatabase();
    return item;
  },

  async updateTitle(id: number, title: string): Promise<void> {
    const item = getDb().conversations.find(c => c.id === id);
    if (item) {
      item.title = title;
      item.updated_at = now();
      await saveDatabase();
    }
  },

  async updateTimestamp(id: number): Promise<void> {
    const item = getDb().conversations.find(c => c.id === id);
    if (item) {
      item.updated_at = now();
      await saveDatabase();
    }
  },

  async delete(id: number): Promise<void> {
    const db = getDb();
    db.conversations = db.conversations.filter(c => c.id !== id);
    db.messages = db.messages.filter(m => m.conversation_id !== id);
    await saveDatabase();
  },

  getByPageUrl(normalizedUrl: string): Conversation[] {
    return getDb().conversations
      .filter(c => normalizePageUrl(c.page_url) === normalizedUrl)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  },
};

export const messageRepo = {
  getByConversationId(conversationId: number): Message[] {
    return getDb().messages
      .filter(m => m.conversation_id === conversationId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  },

  async create(conversationId: number, role: Message['role'], content: string, modelConfigId?: number, thinkingProcess?: ThinkingProcess[]): Promise<Message> {
    const item: Message = {
      id: getNextId(),
      conversation_id: conversationId,
      role,
      content,
      thinking_process: thinkingProcess && thinkingProcess.length > 0 ? thinkingProcess : undefined,
      model_config_id: modelConfigId ?? null,
      created_at: now(),
    };
    getDb().messages.push(item);
    // Update conversation timestamp
    const conv = getDb().conversations.find(c => c.id === conversationId);
    if (conv) conv.updated_at = now();
    await saveDatabase();
    return item;
  },

  async updateContent(id: number, content: string): Promise<void> {
    const item = getDb().messages.find(m => m.id === id);
    if (item) {
      item.content = content;
      await saveDatabase();
    }
  },
};
