import { useState } from 'react';
import { Bot, Feather, Globe, FileText } from 'lucide-react';
import { ModelConfigList } from '@/sidepanel/components/settings/ModelConfigList';
import { FeishuConfigForm } from '@/sidepanel/components/settings/FeishuConfigForm';
import { NotionConfigForm } from '@/sidepanel/components/settings/NotionConfigForm';
import { GeneralTab } from '@/sidepanel/components/settings/GeneralTab';
import { useModels } from '@/sidepanel/hooks/useModels';
import { useTranslation } from '@/sidepanel/contexts/LanguageContext';
import type { CreateModelConfig, UpdateModelConfig } from '@/shared/types';

type SettingsTab = 'ai-models' | 'feishu' | 'notion' | 'general';

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('ai-models');
  const { models, addModel, updateModel, deleteModel, testConnection } = useModels();
  const { t } = useTranslation();

  const tabs: { key: SettingsTab; labelKey: string; icon: React.ReactNode }[] = [
    { key: 'ai-models', labelKey: 'settings.tabAiModels', icon: <Bot size={14} /> },
    { key: 'feishu', labelKey: 'settings.tabFeishu', icon: <Feather size={14} /> },
    { key: 'notion', labelKey: 'settings.tabNotion', icon: <FileText size={14} /> },
    { key: 'general', labelKey: 'settings.tabGeneral', icon: <Globe size={14} /> },
  ];

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
      <div className="flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-primary-600 dark:border-primary-400 text-primary-700 dark:text-primary-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {tab.icon}
            {t(tab.labelKey)}
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
        {activeTab === 'notion' && <NotionConfigForm />}
        {activeTab === 'general' && <GeneralTab />}
      </div>
    </div>
  );
}
