import { getDb, saveDatabase, getNextId } from '../database';
import type { FeishuConfig, CreateFeishuConfig } from '@/shared/types';

function now(): string {
  return new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
}

export const feishuConfigRepo = {
  getAll(): FeishuConfig[] {
    return getDb().feishuConfigs;
  },

  getById(id: number): FeishuConfig | null {
    return getDb().feishuConfigs.find(f => f.id === id) ?? null;
  },

  async create(config: CreateFeishuConfig): Promise<FeishuConfig> {
    const item: FeishuConfig = {
      id: getNextId(),
      name: config.name ?? 'default',
      app_id: config.app_id,
      app_secret: config.app_secret,
      folder_token: config.folder_token ?? '',
      is_active: config.is_active ?? 1,
      created_at: now(),
      updated_at: now(),
    };
    getDb().feishuConfigs.push(item);
    await saveDatabase();
    return item;
  },

  async update(id: number, config: Partial<CreateFeishuConfig>): Promise<FeishuConfig | null> {
    const item = getDb().feishuConfigs.find(f => f.id === id);
    if (!item) return null;

    if (config.name !== undefined) item.name = config.name;
    if (config.app_id !== undefined) item.app_id = config.app_id;
    if (config.app_secret !== undefined) item.app_secret = config.app_secret;
    if (config.folder_token !== undefined) item.folder_token = config.folder_token;
    if (config.is_active !== undefined) item.is_active = config.is_active;
    item.updated_at = now();

    await saveDatabase();
    return item;
  },

  async delete(id: number): Promise<boolean> {
    const db = getDb();
    const idx = db.feishuConfigs.findIndex(f => f.id === id);
    if (idx === -1) return false;
    db.feishuConfigs.splice(idx, 1);
    await saveDatabase();
    return true;
  },

  getActive(): FeishuConfig | null {
    return getDb().feishuConfigs.find(f => f.is_active) ?? null;
  },
};
