import type { ModelConfig, FeishuConfig, Conversation, Message, Note } from '@/shared/types';
import { STORAGE_KEYS } from '@/shared/constants';

/**
 * Application data stored in chrome.storage.local
 */
export interface AppData {
  modelConfigs: ModelConfig[];
  feishuConfigs: FeishuConfig[];
  conversations: Conversation[];
  messages: Message[];
  notes: Note[];
  nextId: number;
}

const STORAGE_KEY = STORAGE_KEYS.DB_DATA;

let cachedData: AppData | null = null;

function getDefaultData(): AppData {
  return {
    modelConfigs: [],
    feishuConfigs: [],
    conversations: [],
    messages: [],
    notes: [],
    nextId: 1,
  };
}

/**
 * Initialize the data store.
 * Loads existing data from chrome.storage.local or creates default empty data.
 * Includes data migration to ensure all fields exist.
 */
export async function initDatabase(): Promise<AppData> {
  if (cachedData) return cachedData;

  const result = await chrome.storage.local.get(STORAGE_KEY);
  if (result[STORAGE_KEY]) {
    cachedData = result[STORAGE_KEY] as AppData;
    // 数据迁移：确保所有字段都存在（兼容旧版本数据）
    if (!Array.isArray(cachedData.modelConfigs)) cachedData.modelConfigs = [];
    if (!Array.isArray(cachedData.feishuConfigs)) cachedData.feishuConfigs = [];
    if (!Array.isArray(cachedData.conversations)) cachedData.conversations = [];
    if (!Array.isArray(cachedData.messages)) cachedData.messages = [];
    if (!Array.isArray(cachedData.notes)) cachedData.notes = [];
    if (!cachedData.nextId) cachedData.nextId = 1;
    // 迁移 notes：为旧数据补充 message_id 字段
    if (Array.isArray(cachedData.notes)) {
      for (const note of cachedData.notes) {
        if (note.message_id === undefined) note.message_id = null;
      }
    }
    // 迁移 modelConfigs：为旧数据补充 full_url 字段
    if (Array.isArray(cachedData.modelConfigs)) {
      for (const mc of cachedData.modelConfigs) {
        if (mc.full_url === undefined) mc.full_url = 0;
      }
    }
  } else {
    cachedData = getDefaultData();
    await saveDatabase();
  }

  console.log('[PageLens] Data store initialized');
  return cachedData;
}

/**
 * Get the current data instance.
 * Throws if not initialized.
 */
export function getDb(): AppData {
  if (!cachedData) {
    throw new Error('Data store not initialized. Call initDatabase() first.');
  }
  return cachedData;
}

/**
 * Save current data to chrome.storage.local.
 * Throws on failure so callers can handle errors.
 */
export async function saveDatabase(): Promise<void> {
  if (!cachedData) return;
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: cachedData });
  } catch (err) {
    console.error('[PageLens] Failed to save database:', err);
    throw err;
  }
}

/**
 * Generate a unique auto-increment ID.
 */
export function getNextId(): number {
  const db = getDb();
  const id = db.nextId;
  db.nextId++;
  return id;
}
