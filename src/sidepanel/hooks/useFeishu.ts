import { useState, useCallback, useEffect } from 'react';
import { feishuConfigRepo } from '@/db/repositories/feishu-config.repo';
import type { FeishuConfig, CreateFeishuConfig } from '@/shared/types';
import { MSG_TYPES } from '@/shared/constants';

interface UseFeishuReturn {
  configs: FeishuConfig[];
  activeConfig: FeishuConfig | null;
  isLoading: boolean;
  refresh: () => void;
  saveConfig: (config: CreateFeishuConfig) => Promise<FeishuConfig>;
  updateConfig: (id: number, config: Partial<CreateFeishuConfig>) => Promise<FeishuConfig | null>;
  deleteConfig: (id: number) => Promise<boolean>;
  testConnection: (appId: string, appSecret: string, folderToken?: string) => Promise<{ success: boolean; error?: string }>;
}

export function useFeishu(): UseFeishuReturn {
  const [configs, setConfigs] = useState<FeishuConfig[]>([]);
  const [activeConfig, setActiveConfig] = useState<FeishuConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(() => {
    try {
      const allConfigs = feishuConfigRepo.getAll();
      setConfigs(allConfigs);
      setActiveConfig(feishuConfigRepo.getActive());
    } catch (err) {
      console.error('[PageLens] Failed to load Feishu config:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const saveConfig = useCallback(async (config: CreateFeishuConfig): Promise<FeishuConfig> => {
    const result = await feishuConfigRepo.create(config);
    refresh();
    return result;
  }, [refresh]);

  const updateConfig = useCallback(async (id: number, config: Partial<CreateFeishuConfig>): Promise<FeishuConfig | null> => {
    const result = await feishuConfigRepo.update(id, config);
    refresh();
    return result;
  }, [refresh]);

  const deleteConfig = useCallback(async (id: number): Promise<boolean> => {
    const result = await feishuConfigRepo.delete(id);
    refresh();
    return result;
  }, [refresh]);

  const testConnection = useCallback(async (appId: string, appSecret: string, folderToken?: string) => {
    const response = await chrome.runtime.sendMessage({
      type: MSG_TYPES.TEST_FEISHU_CONNECTION,
      appId,
      appSecret,
      folderToken,
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
