import { getDb, saveDatabase, getNextId } from '../database';
import type { Note } from '@/shared/types';

function now(): string {
  return new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
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

  async create(note: {
    title: string;
    content: string;
    source_url?: string;
    source_type?: Note['source_type'];
    conversation_id?: number;
    tags?: string;
  }): Promise<Note> {
    const item: Note = {
      id: getNextId(),
      title: note.title,
      content: note.content,
      source_url: note.source_url ?? '',
      source_type: note.source_type ?? 'chat',
      conversation_id: note.conversation_id ?? null,
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

  async delete(id: number): Promise<boolean> {
    const db = getDb();
    const idx = db.notes.findIndex(n => n.id === id);
    if (idx === -1) return false;
    db.notes.splice(idx, 1);
    await saveDatabase();
    return true;
  },
};
