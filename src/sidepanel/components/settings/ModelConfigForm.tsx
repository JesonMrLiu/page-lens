import { useState, useEffect } from 'react';
import { Eye, EyeOff, Trash2, Star } from 'lucide-react';
import { Button } from '@/sidepanel/components/shared/Button';
import { useTranslation } from '@/sidepanel/contexts/LanguageContext';
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
  const { t } = useTranslation();

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
        message: result.success ? t('modelForm.connectionSuccess') : (result.error ?? t('modelForm.connectionFailed')),
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message ?? t('modelForm.connectionFailed'),
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
        <label className="block text-xs text-gray-600 dark:text-gray-300 mb-1">{t('modelForm.providerLabel')}</label>
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
          <option value="custom">{t('modelForm.customProvider')}</option>
        </select>
      </div>

      {/* Name */}
      <div>
        <label className="block text-xs text-gray-600 dark:text-gray-300 mb-1">{t('modelForm.nameLabel')}</label>
        <input
          type="text"
          className="input-field"
          placeholder={t('modelForm.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      {/* Base URL */}
      <div>
        <label className="block text-xs text-gray-600 dark:text-gray-300 mb-1">{t('modelForm.baseUrlLabel')}</label>
        <input
          type="text"
          className="input-field"
          placeholder="https://api.openai.com"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{t('modelForm.baseUrlHint')}</p>
      </div>

      {/* API Key */}
      <div>
        <label className="block text-xs text-gray-600 dark:text-gray-300 mb-1">
          {t('modelForm.apiKeyLabel')}{localProvider && <span className="text-gray-400 dark:text-gray-500 ml-1">{t('modelForm.apiKeyLocalHint')}</span>}
        </label>
        <div className="relative">
          <input
            type={showApiKey ? 'text' : 'password'}
            className="input-field pr-8"
            placeholder={localProvider ? t('modelForm.apiKeyPlaceholderLocal') : 'sk-...'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowApiKey(!showApiKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
          >
            {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      {/* Model ID */}
      <div>
        <label className="block text-xs text-gray-600 dark:text-gray-300 mb-1">{t('modelForm.modelIdLabel')}</label>
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
              <option value="__custom__">{t('modelForm.customModel')}</option>
            </select>
          </div>
        ) : (
          <div className="space-y-1">
            <input
              type="text"
              className="input-field"
              placeholder={t('modelForm.modelIdPlaceholder')}
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
            />
            {showModelDropdown && useCustomModelId && (
              <button
                type="button"
                className="text-[10px] text-primary-500 dark:text-primary-400 hover:text-primary-600 dark:hover:text-primary-300"
                onClick={() => {
                  setUseCustomModelId(false);
                  setModelId(currentPreset!.default_model_id);
                }}
              >
                {t('modelForm.backToPresets')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Max Tokens & Temperature */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-300 mb-1">{t('modelForm.maxTokensLabel')}</label>
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
          <label className="block text-xs text-gray-600 dark:text-gray-300 mb-1">{t('modelForm.temperatureLabel', { value: temperature.toFixed(1) })}</label>
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
        <div className={`text-xs p-2 rounded ${testResult.success ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>
          {testResult.message}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 pt-1">
        <Button onClick={handleSave} loading={saving} disabled={!isValid} size="sm">
          {model ? t('modelForm.update') : t('modelForm.add')}
        </Button>
        <Button onClick={handleTest} loading={testing} variant="secondary" size="sm" disabled={!isValid}>
          {t('modelForm.testConnection')}
        </Button>
        {onCancel && (
          <Button onClick={onCancel} variant="ghost" size="sm">
            {t('modelForm.cancel')}
          </Button>
        )}
        {model && onDelete && (
          <div className="flex-1 flex justify-end gap-1">
            {onSetDefault && (
              <Button onClick={() => onSetDefault(model.id)} variant="ghost" size="sm" title={t('modelForm.setDefault')}>
                <Star size={14} />
              </Button>
            )}
            <Button onClick={() => onDelete(model.id)} variant="danger" size="sm" title={t('modelForm.delete')}>
              <Trash2 size={14} />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
