import { useState, useCallback, useEffect } from 'react';
import { modelConfigRepo } from '@/db/repositories/model-config.repo';
import type { ModelConfig, CreateModelConfig, UpdateModelConfig } from '@/shared/types';
import { MSG_TYPES } from '@/shared/constants';

interface UseModelsReturn {
  models: ModelConfig[];
  defaultModel: ModelConfig | null;
  isLoading: boolean;
  refresh: () => void;
  addModel: (config: CreateModelConfig) => Promise<ModelConfig>;
  updateModel: (config: UpdateModelConfig) => Promise<ModelConfig | null>;
  deleteModel: (id: number) => Promise<boolean>;
  testConnection: (baseUrl: string, apiKey: string, model: string) => Promise<{ success: boolean; error?: string }>;
}

export function useModels(): UseModelsReturn {
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [defaultModel, setDefaultModel] = useState<ModelConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(() => {
    try {
      const allModels = modelConfigRepo.getActive();
      setModels(allModels);
      setDefaultModel(modelConfigRepo.getDefault());
    } catch (err) {
      console.error('[PageLens] Failed to load models:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addModel = useCallback(async (config: CreateModelConfig): Promise<ModelConfig> => {
    const model = await modelConfigRepo.create(config);
    refresh();
    return model;
  }, [refresh]);

  const updateModel = useCallback(async (config: UpdateModelConfig): Promise<ModelConfig | null> => {
    const model = await modelConfigRepo.update(config);
    refresh();
    return model;
  }, [refresh]);

  const deleteModel = useCallback(async (id: number): Promise<boolean> => {
    const result = await modelConfigRepo.delete(id);
    refresh();
    return result;
  }, [refresh]);

  const testConnection = useCallback(async (
    baseUrl: string,
    apiKey: string,
    model: string,
  ): Promise<{ success: boolean; error?: string }> => {
    const response = await chrome.runtime.sendMessage({
      type: MSG_TYPES.TEST_AI_CONNECTION,
      modelConfig: { base_url: baseUrl, api_key: apiKey, model_id: model },
    });
    return { success: response.success, error: response.error };
  }, []);

  return {
    models,
    defaultModel,
    isLoading,
    refresh,
    addModel,
    updateModel,
    deleteModel,
    testConnection,
  };
}
