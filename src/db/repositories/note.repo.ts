import { getDb, saveDatabase, getNextId } from '../database';
import { conversationRepo } from './conversation.repo';
import type { Note } from '@/shared/types';

function now(): string {
  return new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
}

/**
 * 获取笔记的来源网页 URL。
 * 优先使用笔记自身的 source_url；旧笔记没有该字段时，回退到所属对话记录的 page_url。
 */
export function getEffectiveSourceUrl(note: Note): string {
  if (note.source_url) return note.source_url;
  if (note.conversation_id != null) {
    return conversationRepo.getById(note.conversation_id)?.page_url || '';
  }
  return '';
}

export const noteRepo = {
  getAll(): Note[] {
    return getDb().notes.sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  },

  getBySourceType(sourceType: Note['source_type']): Note[] {
    return getDb().notes
      .filter(n => n.source_type === sourceType)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },

  getById(id: number): Note | null {
    return getDb().notes.find(n => n.id === id) ?? null;
  },

  getByMessageId(messageId: number): Note | null {
    return getDb().notes.find(n => n.message_id === messageId) ?? null;
  },

  async create(note: {
    title: string;
    content: string;
    source_url?: string;
    source_type?: Note['source_type'];
    conversation_id?: number;
    message_id?: number;
    tags?: string;
  }): Promise<Note> {
    const item: Note = {
      id: getNextId(),
      title: note.title,
      content: note.content,
      source_url: note.source_url ?? '',
      source_type: note.source_type ?? 'chat',
      conversation_id: note.conversation_id ?? null,
      message_id: note.message_id ?? null,
      feishu_doc_id: '',
      feishu_doc_url: '',
      tags: note.tags ?? '',
      created_at: now(),
      updated_at: now(),
    };
    getDb().notes.push(item);
    await saveDatabase();
    return item;
  },

  async update(id: number, updates: Partial<Pick<Note, 'title' | 'content' | 'tags'>>): Promise<Note | null> {
    const item = getDb().notes.find(n => n.id === id);
    if (!item) return null;

    if (updates.title !== undefined) item.title = updates.title;
    if (updates.content !== undefined) item.content = updates.content;
    if (updates.tags !== undefined) item.tags = updates.tags;
    item.updated_at = now();

    await saveDatabase();
    return item;
  },

  async updateFeishuExport(id: number, docId: string, docUrl: string): Promise<void> {
    const item = getDb().notes.find(n => n.id === id);
    if (item) {
      item.feishu_doc_id = docId;
      item.feishu_doc_url = docUrl;
      item.updated_at = now();
      await saveDatabase();
    }
  },

  /**
   * 清除笔记的飞书云文档关联（如检测到云文档已被删除时调用）。
   * 清除后该笔记会重新被视为「未导出」，UI 按钮回到「导出到飞书」。
   */
  async clearFeishuExport(id: number): Promise<void> {
    const item = getDb().notes.find(n => n.id === id);
    if (item) {
      item.feishu_doc_id = '';
      item.feishu_doc_url = '';
      item.updated_at = now();
      await saveDatabase();
    }
  },

  async delete(id: number): Promise<boolean> {
    const db = getDb();
    const idx = db.notes.findIndex(n => n.id === id);
    if (idx === -1) return false;
    db.notes.splice(idx, 1);
    await saveDatabase();
    return true;
  },
};
