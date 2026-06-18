import { getDb, saveDatabase, getNextId } from '../database';
import type { ModelConfig, CreateModelConfig, UpdateModelConfig } from '@/shared/types';

function now(): string {
  return new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
}

export const modelConfigRepo = {
  getAll(): ModelConfig[] {
    return getDb().modelConfigs;
  },

  getById(id: number): ModelConfig | null {
    return getDb().modelConfigs.find(m => m.id === id) ?? null;
  },

  async create(config: CreateModelConfig): Promise<ModelConfig> {
    const db = getDb();
    const item: ModelConfig = {
      id: getNextId(),
      name: config.name,
      base_url: config.base_url,
      api_key: config.api_key,
      model_id: config.model_id,
      max_tokens: config.max_tokens ?? 4096,
      temperature: config.temperature ?? 0.7,
      full_url: config.full_url ?? 0,
      is_default: config.is_default ?? 0,
      is_active: config.is_active ?? 1,
      created_at: now(),
      updated_at: now(),
    };

    // If setting as default, unset others
    if (item.is_default) {
      db.modelConfigs.forEach(m => { m.is_default = 0; });
    }

    db.modelConfigs.push(item);
    await saveDatabase();
    return item;
  },

  async update(config: UpdateModelConfig): Promise<ModelConfig | null> {
    const db = getDb();
    const item = db.modelConfigs.find(m => m.id === config.id);
    if (!item) return null;

    if (config.name !== undefined) item.name = config.name;
    if (config.base_url !== undefined) item.base_url = config.base_url;
    if (config.api_key !== undefined) item.api_key = config.api_key;
    if (config.model_id !== undefined) item.model_id = config.model_id;
    if (config.max_tokens !== undefined) item.max_tokens = config.max_tokens;
    if (config.temperature !== undefined) item.temperature = config.temperature;
    if (config.full_url !== undefined) item.full_url = config.full_url;
    if (config.is_default !== undefined) {
      if (config.is_default) {
        db.modelConfigs.forEach(m => { m.is_default = 0; });
      }
      item.is_default = config.is_default;
    }
    if (config.is_active !== undefined) item.is_active = config.is_active;
    item.updated_at = now();

    await saveDatabase();
    return item;
  },

  async delete(id: number): Promise<boolean> {
    const db = getDb();
    const idx = db.modelConfigs.findIndex(m => m.id === id);
    if (idx === -1) return false;
    // 默认模型不允许删除：需先将其他模型设为默认，使其变为非默认后才可删除
    if (db.modelConfigs[idx].is_default) {
      throw new Error('Cannot delete the default model; set another model as default first.');
    }
    db.modelConfigs.splice(idx, 1);
    await saveDatabase();
    return true;
  },

  getDefault(): ModelConfig | null {
    const db = getDb();
    return db.modelConfigs.find(m => m.is_default && m.is_active)
      ?? db.modelConfigs.find(m => m.is_active)
      ?? null;
  },

  getActive(): ModelConfig[] {
    return getDb().modelConfigs.filter(m => m.is_active);
  },
};
