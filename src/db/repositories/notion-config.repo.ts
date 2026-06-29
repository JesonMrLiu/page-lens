import { getDb, saveDatabase, getNextId } from '../database';
import type { NotionConfig, CreateNotionConfig } from '@/shared/types';

function now(): string {
  return new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
}

export const notionConfigRepo = {
  getAll(): NotionConfig[] {
    return getDb().notionConfigs;
  },

  getById(id: number): NotionConfig | null {
    return getDb().notionConfigs.find(n => n.id === id) ?? null;
  },

  async create(config: CreateNotionConfig): Promise<NotionConfig> {
    const item: NotionConfig = {
      id: getNextId(),
      name: config.name ?? 'default',
      token: config.token,
      parent_page_id: config.parent_page_id ?? '',
      is_active: config.is_active ?? 1,
      created_at: now(),
      updated_at: now(),
    };
    getDb().notionConfigs.push(item);
    await saveDatabase();
    return item;
  },

  async update(id: number, config: Partial<CreateNotionConfig>): Promise<NotionConfig | null> {
    const item = getDb().notionConfigs.find(n => n.id === id);
    if (!item) return null;

    if (config.name !== undefined) item.name = config.name;
    if (config.token !== undefined) item.token = config.token;
    if (config.parent_page_id !== undefined) item.parent_page_id = config.parent_page_id;
    if (config.is_active !== undefined) item.is_active = config.is_active;
    item.updated_at = now();

    await saveDatabase();
    return item;
  },

  async delete(id: number): Promise<boolean> {
    const db = getDb();
    const idx = db.notionConfigs.findIndex(n => n.id === id);
    if (idx === -1) return false;
    db.notionConfigs.splice(idx, 1);
    await saveDatabase();
    return true;
  },

  getActive(): NotionConfig | null {
    return getDb().notionConfigs.find(n => n.is_active) ?? null;
  },
};
