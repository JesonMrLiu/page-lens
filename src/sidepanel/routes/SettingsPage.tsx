import { useState } from 'react';
import { Bot, Feather, Globe } from 'lucide-react';
import { ModelConfigList } from '@/sidepanel/components/settings/ModelConfigList';
import { FeishuConfigForm } from '@/sidepanel/components/settings/FeishuConfigForm';
import { useModels } from '@/sidepanel/hooks/useModels';
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
  return (
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
  );
}
