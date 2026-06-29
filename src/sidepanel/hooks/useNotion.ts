import { useState, useCallback, useEffect } from 'react';
import { notionConfigRepo } from '@/db/repositories/notion-config.repo';
import type { NotionConfig, CreateNotionConfig } from '@/shared/types';
import { MSG_TYPES } from '@/shared/constants';

interface UseNotionReturn {
  configs: NotionConfig[];
  activeConfig: NotionConfig | null;
  isLoading: boolean;
  refresh: () => void;
  saveConfig: (config: CreateNotionConfig) => Promise<NotionConfig>;
  updateConfig: (id: number, config: Partial<CreateNotionConfig>) => Promise<NotionConfig | null>;
  deleteConfig: (id: number) => Promise<boolean>;
  testConnection: (token: string, parentPageId?: string) => Promise<{ success: boolean; error?: string }>;
}

export function useNotion(): UseNotionReturn {
  const [configs, setConfigs] = useState<NotionConfig[]>([]);
  const [activeConfig, setActiveConfig] = useState<NotionConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(() => {
    try {
      const allConfigs = notionConfigRepo.getAll();
      setConfigs(allConfigs);
      setActiveConfig(notionConfigRepo.getActive());
    } catch (err) {
      console.error('[PageLens] Failed to load Notion config:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const saveConfig = useCallback(async (config: CreateNotionConfig): Promise<NotionConfig> => {
    const result = await notionConfigRepo.create(config);
    refresh();
    return result;
  }, [refresh]);

  const updateConfig = useCallback(async (id: number, config: Partial<CreateNotionConfig>): Promise<NotionConfig | null> => {
    const result = await notionConfigRepo.update(id, config);
    refresh();
    return result;
  }, [refresh]);

  const deleteConfig = useCallback(async (id: number): Promise<boolean> => {
    const result = await notionConfigRepo.delete(id);
    refresh();
    return result;
  }, [refresh]);

  const testConnection = useCallback(async (token: string, parentPageId?: string) => {
    const response = await chrome.runtime.sendMessage({
      type: MSG_TYPES.TEST_NOTION_CONNECTION,
      token,
      parentPageId,
    });
    return { success: response.success, error: response.error };
  }, []);

  return {
    configs,
    activeConfig,
    isLoading,
    refresh,
    saveConfig,
    updateConfig,
    deleteConfig,
    testConnection,
  };
}
