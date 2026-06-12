/**
 * Preset AI model provider configurations.
 * Used to auto-fill model configuration form fields.
 */

export interface PresetModelProvider {
  id: string;
  name: string;
  base_url: string;
  default_model_id: string;
  available_models: string[];
  max_tokens: number;
  temperature: number;
}

export const PRESET_PROVIDERS: PresetModelProvider[] = [
  {
    id: 'deepseek',
    name: 'DeepseekAI',
    base_url: 'https://api.deepseek.com',
    default_model_id: 'deepseek-v4-flash',
    available_models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
    max_tokens: 4096,
    temperature: 0.7,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    base_url: 'https://api.openai.com',
    default_model_id: 'gpt-5.5',
    available_models: ['gpt-5.5'],
    max_tokens: 4096,
    temperature: 0.7,
  },
  {
    id: 'glm',
    name: '智谱GLM',
    base_url: 'https://open.bigmodel.cn/api/paas/v4',
    default_model_id: 'glm-5-turbo',
    available_models: ['glm-5-turbo', 'glm-4.7', 'glm-5.1'],
    max_tokens: 4096,
    temperature: 0.7,
  },
  {
    id: 'moonshot',
    name: '月之暗面 (Kimi)',
    base_url: 'https://api.moonshot.cn/v1',
    default_model_id: 'moonshot-v1-8k',
    available_models: ['moonshot-v1-8k', 'moonshot-v1-32k'],
    max_tokens: 4096,
    temperature: 0.7,
  },
  {
    id: 'qwen',
    name: '通义千问 (Qwen)',
    base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    default_model_id: 'qwen-plus',
    available_models: ['qwen-turbo', 'qwen-plus', 'qwen-max'],
    max_tokens: 4096,
    temperature: 0.7,
  },
  {
    id: 'siliconflow',
    name: 'SiliconFlow',
    base_url: 'https://api.siliconflow.cn/v1',
    default_model_id: 'deepseek-ai/DeepSeek-V3',
    available_models: [
      'deepseek-ai/DeepSeek-V3',
      'Qwen/Qwen2.5-72B-Instruct',
      'meta-llama/Meta-Llama-3.1-70B-Instruct',
    ],
    max_tokens: 4096,
    temperature: 0.7,
  },
  {
    id: 'ollama',
    name: 'Ollama (本地)',
    base_url: 'http://localhost:11434/v1',
    default_model_id: 'llama3',
    available_models: ['llama3', 'mistral', 'codellama', 'qwen2'],
    max_tokens: 4096,
    temperature: 0.7,
  },
];

/** Sentinel value for custom (user-defined) provider */
export const CUSTOM_PRESET: PresetModelProvider = {
  id: 'custom',
  name: '自定义',
  base_url: '',
  default_model_id: '',
  available_models: [],
  max_tokens: 4096,
  temperature: 0.7,
};

/**
 * Find a preset provider by its id.
 * Returns undefined if not found.
 */
export function getPresetById(id: string): PresetModelProvider | undefined {
  if (id === 'custom') return CUSTOM_PRESET;
  return PRESET_PROVIDERS.find((p) => p.id === id);
}

/**
 * Try to match a base_url to a preset provider.
 * Returns the preset id or 'custom' if no match.
 */
export function matchPresetByUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  const match = PRESET_PROVIDERS.find(
    (p) => p.base_url.replace(/\/+$/, '') === trimmed,
  );
  return match ? match.id : 'custom';
}

/**
 * Check if a base_url points to a local service (no API key required).
 */
export function isLocalProvider(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}
