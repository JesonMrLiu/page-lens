import type { ModelConfig, FeishuConfig, Conversation, Message, Note } from '@/shared/types';

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

const STORAGE_KEY = 'ai_summary_data';

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
 * Instant — no WASM loading needed.
 */
export async function initDatabase(): Promise<AppData> {
  if (cachedData) return cachedData;

  const result = await chrome.storage.local.get(STORAGE_KEY);
  if (result[STORAGE_KEY]) {
    cachedData = result[STORAGE_KEY] as AppData;
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
 */
export async function saveDatabase(): Promise<void> {
  if (!cachedData) return;
  await chrome.storage.local.set({ [STORAGE_KEY]: cachedData });
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
