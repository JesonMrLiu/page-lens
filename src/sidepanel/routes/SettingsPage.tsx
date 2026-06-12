import { useState, useEffect } from 'react';
import { Bot, Feather, Globe, Brain } from 'lucide-react';
import { ModelConfigList } from '@/sidepanel/components/settings/ModelConfigList';
import { FeishuConfigForm } from '@/sidepanel/components/settings/FeishuConfigForm';
import { useModels } from '@/sidepanel/hooks/useModels';
import { STORAGE_KEYS, MAX_THINK_ROUNDS, DEFAULT_NORMAL_ROUNDS, DEFAULT_DEEP_ROUNDS } from '@/shared/constants';
import type { CreateModelConfig, UpdateModelConfig } from '@/shared/types';

type SettingsTab = 'ai-models' | 'feishu' | 'general';

const tabs: { key: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { key: 'ai-models', label: 'AI 模型', icon: <Bot size={14} /> },
  { key: 'feishu', label: '飞书', icon: <Feather size={14} /> },
  { key: 'general', label: '通用', icon: <Globe size={14} /> },
];

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('ai-models');
  const { models, addModel, updateModel, deleteModel, testConnection } = useModels();

  const handleAddModel = async (config: CreateModelConfig): Promise<any> => {
    return addModel(config);
  };

  const handleUpdateModel = async (config: UpdateModelConfig): Promise<any> => {
    return updateModel(config);
  };

  const handleDeleteModel = async (id: number): Promise<boolean> => {
    return deleteModel(id);
  };

  const handleSetDefault = async (id: number): Promise<void> => {
    await updateModel({ id, is_default: 1 });
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      {/* Tab bar */}
      <div className="flex border-b border-gray-200 bg-white px-4 shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 p-4">
        {activeTab === 'ai-models' && (
          <ModelConfigList
            models={models}
            onAdd={handleAddModel}
            onUpdate={handleUpdateModel}
            onDelete={handleDeleteModel}
            onSetDefault={handleSetDefault}
            onTest={testConnection}
          />
        )}
        {activeTab === 'feishu' && <FeishuConfigForm />}
        {activeTab === 'general' && <GeneralTab />}
      </div>
    </div>
  );
}

function GeneralTab() {
  const [normalRounds, setNormalRounds] = useState(DEFAULT_NORMAL_ROUNDS);
  const [deepRounds, setDeepRounds] = useState(DEFAULT_DEEP_ROUNDS);
  const [saved, setSaved] = useState(false);

  // Load saved settings
  useEffect(() => {
    chrome.storage.local.get(
      [STORAGE_KEYS.THINK_NORMAL_ROUNDS, STORAGE_KEYS.THINK_DEEP_ROUNDS],
      (result) => {
        if (result[STORAGE_KEYS.THINK_NORMAL_ROUNDS] !== undefined) {
          setNormalRounds(result[STORAGE_KEYS.THINK_NORMAL_ROUNDS]);
        }
        if (result[STORAGE_KEYS.THINK_DEEP_ROUNDS] !== undefined) {
          setDeepRounds(result[STORAGE_KEYS.THINK_DEEP_ROUNDS]);
        }
      },
    );
  }, []);

  const handleSave = () => {
    chrome.storage.local.set({
      [STORAGE_KEYS.THINK_NORMAL_ROUNDS]: normalRounds,
      [STORAGE_KEYS.THINK_DEEP_ROUNDS]: deepRounds,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* General settings */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-700">通用设置</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">界面语言</label>
            <select className="input-field">
              <option value="zh">中文</option>
              <option value="en">English</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">主题</label>
            <select className="input-field">
              <option value="light">浅色</option>
              <option value="dark">深色</option>
              <option value="system">跟随系统</option>
            </select>
          </div>
        </div>
      </div>

      {/* Think mode settings */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Brain size={16} className="text-purple-500" />
          <h3 className="text-sm font-medium text-gray-700">思考推理配置</h3>
        </div>
        <p className="text-xs text-gray-500">
          配置不同思考模式的推理轮数。更多轮数可以提供更深入的分析，但会消耗更多时间和 Token。
        </p>

        <div className="space-y-4 bg-gray-50 rounded-lg p-4">
          {/* Normal think rounds */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700">一般思考轮数</label>
              <span className="text-xs text-gray-500 bg-white px-2 py-0.5 rounded">
                {normalRounds} 轮
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={MAX_THINK_ROUNDS}
              value={normalRounds}
              onChange={(e) => setNormalRounds(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
            />
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-gray-400">1轮（快速）</span>
              <span className="text-[10px] text-gray-400">{MAX_THINK_ROUNDS}轮（深入）</span>
            </div>
          </div>

          {/* Deep think rounds */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700">深度思考轮数</label>
              <span className="text-xs text-gray-500 bg-white px-2 py-0.5 rounded">
                {deepRounds} 轮
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={MAX_THINK_ROUNDS}
              value={deepRounds}
              onChange={(e) => setDeepRounds(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
            />
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-gray-400">1轮（快速）</span>
              <span className="text-[10px] text-gray-400">{MAX_THINK_ROUNDS}轮（深入）</span>
            </div>
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          className={`px-4 py-2 text-sm rounded-lg transition-colors ${
            saved
              ? 'bg-green-500 text-white'
              : 'bg-primary-600 hover:bg-primary-700 text-white'
          }`}
        >
          {saved ? '已保存' : '保存设置'}
        </button>
      </div>
    </div>
  );
}
