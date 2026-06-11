import { useState } from 'react';
import { Eye, EyeOff, Trash2, Star } from 'lucide-react';
import { Button } from '@/sidepanel/components/shared/Button';
import type { ModelConfig, CreateModelConfig } from '@/shared/types';
import { DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE } from '@/shared/constants';

interface ModelConfigFormProps {
  model?: ModelConfig | null;
  onSave: (config: CreateModelConfig | { id: number; [key: string]: any }) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
  onSetDefault?: (id: number) => Promise<void>;
  onTest: (baseUrl: string, apiKey: string, model: string) => Promise<{ success: boolean; error?: string }>;
  onCancel?: () => void;
}

export function ModelConfigForm({ model, onSave, onDelete, onSetDefault, onTest, onCancel }: ModelConfigFormProps) {
  const [name, setName] = useState(model?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(model?.base_url ?? 'https://api.openai.com');
  const [apiKey, setApiKey] = useState(model?.api_key ?? '');
  const [modelId, setModelId] = useState(model?.model_id ?? 'gpt-4o');
  const [maxTokens, setMaxTokens] = useState(model?.max_tokens ?? DEFAULT_MAX_TOKENS);
  const [temperature, setTemperature] = useState(model?.temperature ?? DEFAULT_TEMPERATURE);
  const [showApiKey, setShowApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

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
    if (!name.trim() || !baseUrl.trim() || !apiKey.trim() || !modelId.trim()) return;

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

  const isValid = name.trim() && baseUrl.trim() && apiKey.trim() && modelId.trim();

  return (
    <div className="space-y-3">
      {/* Name */}
      <div>
        <label className="block text-xs text-gray-600 mb-1">名称</label>
        <input
          type="text"
          className="input-field"
          placeholder="例如：GPT-4o"
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
        <label className="block text-xs text-gray-600 mb-1">API Key</label>
        <div className="relative">
          <input
            type={showApiKey ? 'text' : 'password'}
            className="input-field pr-8"
            placeholder="sk-..."
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

      {/* Model ID */}
      <div>
        <label className="block text-xs text-gray-600 mb-1">模型 ID</label>
        <input
          type="text"
          className="input-field"
          placeholder="gpt-4o"
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
        />
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
