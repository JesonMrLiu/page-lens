import { useState, useEffect } from 'react';
import { Eye, EyeOff, Trash2, Star } from 'lucide-react';
import { Button } from '@/sidepanel/components/shared/Button';
import type { ModelConfig, CreateModelConfig } from '@/shared/types';
import { DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE } from '@/shared/constants';
import {
  PRESET_PROVIDERS,
  getPresetById,
  matchPresetByUrl,
  isLocalProvider,
} from '@/shared/preset-models';

interface ModelConfigFormProps {
  model?: ModelConfig | null;
  onSave: (config: CreateModelConfig | { id: number; [key: string]: any }) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
  onSetDefault?: (id: number) => Promise<void>;
  onTest: (baseUrl: string, apiKey: string, model: string) => Promise<{ success: boolean; error?: string }>;
  onCancel?: () => void;
}

export function ModelConfigForm({ model, onSave, onDelete, onSetDefault, onTest, onCancel }: ModelConfigFormProps) {
  const [selectedPresetId, setSelectedPresetId] = useState<string>(
    model ? matchPresetByUrl(model.base_url) : 'openai'
  );
  const [name, setName] = useState(model?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(model?.base_url ?? 'https://api.openai.com');
  const [apiKey, setApiKey] = useState(model?.api_key ?? '');
  const [modelId, setModelId] = useState(model?.model_id ?? 'gpt-5.5');
  const [useCustomModelId, setUseCustomModelId] = useState(false);
  const [maxTokens, setMaxTokens] = useState(model?.max_tokens ?? DEFAULT_MAX_TOKENS);
  const [temperature, setTemperature] = useState(model?.temperature ?? DEFAULT_TEMPERATURE);
  const [showApiKey, setShowApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // When editing, check if the existing model_id is in the preset's available_models
  useEffect(() => {
    if (model && selectedPresetId !== 'custom') {
      const preset = getPresetById(selectedPresetId);
      if (preset && !preset.available_models.includes(model.model_id)) {
        setUseCustomModelId(true);
      }
    }
  }, []);

  const handlePresetChange = (presetId: string) => {
    setSelectedPresetId(presetId);
    setUseCustomModelId(false);

    if (presetId === 'custom') return;

    const preset = getPresetById(presetId);
    if (!preset) return;

    setName((prev) => prev || preset.name);
    setBaseUrl(preset.base_url);
    setModelId(preset.default_model_id);
    setMaxTokens(preset.max_tokens);
    setTemperature(preset.temperature);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await onTest(baseUrl, apiKey, modelId);
      setTestResult({
        success: result.success,
        message: result.success ? '连接成功！' : (result.error ?? '连接失败'),
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message ?? '连接失败',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    const localRequired = isLocalProvider(baseUrl);
    if (!name.trim() || !baseUrl.trim() || (!localRequired && !apiKey.trim()) || !modelId.trim()) return;

    setSaving(true);
    try {
      if (model) {
        await onSave({
          id: model.id,
          name: name.trim(),
          base_url: baseUrl.trim(),
          api_key: apiKey.trim(),
          model_id: modelId.trim(),
          max_tokens: maxTokens,
          temperature,
        });
      } else {
        await onSave({
          name: name.trim(),
          base_url: baseUrl.trim(),
          api_key: apiKey.trim(),
          model_id: modelId.trim(),
          max_tokens: maxTokens,
          temperature,
          is_active: 1,
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const localProvider = isLocalProvider(baseUrl);
  const isValid = name.trim() && baseUrl.trim() && (localProvider || apiKey.trim()) && modelId.trim();
  const currentPreset = getPresetById(selectedPresetId);
  const showModelDropdown = selectedPresetId !== 'custom' && currentPreset && currentPreset.available_models.length > 0;

  return (
    <div className="space-y-3">
      {/* Provider selector */}
      <div>
        <label className="block text-xs text-gray-600 mb-1">服务提供商</label>
        <select
          className="input-field"
          value={selectedPresetId}
          onChange={(e) => handlePresetChange(e.target.value)}
        >
          {PRESET_PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value="custom">自定义</option>
        </select>
      </div>

      {/* Name */}
      <div>
        <label className="block text-xs text-gray-600 mb-1">名称</label>
        <input
          type="text"
          className="input-field"
          placeholder="例如：DeepseekAI"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      {/* Base URL */}
      <div>
        <label className="block text-xs text-gray-600 mb-1">API 地址</label>
        <input
          type="text"
          className="input-field"
          placeholder="https://api.openai.com"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
        <p className="text-[10px] text-gray-400 mt-0.5">支持 OpenAI 兼容的 API 地址</p>
      </div>

      {/* API Key */}
      <div>
        <label className="block text-xs text-gray-600 mb-1">
          API Key{localProvider && <span className="text-gray-400 ml-1">(本地服务可不填)</span>}
        </label>
        <div className="relative">
          <input
            type={showApiKey ? 'text' : 'password'}
            className="input-field pr-8"
            placeholder={localProvider ? '本地服务无需 API Key' : 'sk-...'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowApiKey(!showApiKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      {/* Model ID - dropdown + custom input */}
      <div>
        <label className="block text-xs text-gray-600 mb-1">模型 ID</label>
        {showModelDropdown && !useCustomModelId ? (
          <div className="space-y-1.5">
            <select
              className="input-field"
              value={modelId}
              onChange={(e) => {
                if (e.target.value === '__custom__') {
                  setUseCustomModelId(true);
                  setModelId('');
                } else {
                  setModelId(e.target.value);
                }
              }}
            >
              {currentPreset!.available_models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              <option value="__custom__">自定义模型...</option>
            </select>
          </div>
        ) : (
          <div className="space-y-1">
            <input
              type="text"
              className="input-field"
              placeholder="输入模型 ID"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
            />
            {showModelDropdown && useCustomModelId && (
              <button
                type="button"
                className="text-[10px] text-primary-500 hover:text-primary-600"
                onClick={() => {
                  setUseCustomModelId(false);
                  setModelId(currentPreset!.default_model_id);
                }}
              >
                ← 返回预置模型列表
              </button>
            )}
          </div>
        )}
      </div>

      {/* Max Tokens & Temperature */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-600 mb-1">最大 Tokens</label>
          <input
            type="number"
            className="input-field"
            value={maxTokens}
            onChange={(e) => setMaxTokens(Number(e.target.value))}
            min={256}
            max={128000}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">温度 ({temperature.toFixed(1)})</label>
          <input
            type="range"
            className="w-full mt-2"
            min={0}
            max={2}
            step={0.1}
            value={temperature}
            onChange={(e) => setTemperature(Number(e.target.value))}
          />
        </div>
      </div>

      {/* Test connection result */}
      {testResult && (
        <div className={`text-xs p-2 rounded ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {testResult.message}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 pt-1">
        <Button onClick={handleSave} loading={saving} disabled={!isValid} size="sm">
          {model ? '更新' : '添加'}
        </Button>
        <Button onClick={handleTest} loading={testing} variant="secondary" size="sm" disabled={!isValid}>
          测试连接
        </Button>
        {onCancel && (
          <Button onClick={onCancel} variant="ghost" size="sm">
            取消
          </Button>
        )}
        {model && onDelete && (
          <div className="flex-1 flex justify-end gap-1">
            {onSetDefault && (
              <Button onClick={() => onSetDefault(model.id)} variant="ghost" size="sm" title="设为默认">
                <Star size={14} />
              </Button>
            )}
            <Button onClick={() => onDelete(model.id)} variant="danger" size="sm" title="删除">
              <Trash2 size={14} />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
