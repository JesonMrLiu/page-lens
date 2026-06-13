import { useState, useEffect } from 'react';
import { Bot, Feather, Globe, Brain } from 'lucide-react';
import { ModelConfigList } from '@/sidepanel/components/settings/ModelConfigList';
import { FeishuConfigForm } from '@/sidepanel/components/settings/FeishuConfigForm';
import { useModels } from '@/sidepanel/hooks/useModels';
import { STORAGE_KEYS, MAX_THINK_ROUNDS, DEFAULT_NORMAL_ROUNDS, DEFAULT_DEEP_ROUNDS } from '@/shared/constants';
import { useSettingsStore } from '@/sidepanel/stores/settings-store';
import { useTranslation } from '@/sidepanel/contexts/LanguageContext';
import type { CreateModelConfig, UpdateModelConfig } from '@/shared/types';

type SettingsTab = 'ai-models' | 'feishu' | 'general';

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('ai-models');
  const { models, addModel, updateModel, deleteModel, testConnection } = useModels();
  const { t } = useTranslation();

  const tabs: { key: SettingsTab; labelKey: string; icon: React.ReactNode }[] = [
    { key: 'ai-models', labelKey: 'settings.tabAiModels', icon: <Bot size={14} /> },
    { key: 'feishu', labelKey: 'settings.tabFeishu', icon: <Feather size={14} /> },
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
        {activeTab === 'general' && <GeneralTab />}
      </div>
    </div>
  );
}

function GeneralTab() {
  const [normalRounds, setNormalRounds] = useState(DEFAULT_NORMAL_ROUNDS);
  const [deepRounds, setDeepRounds] = useState(DEFAULT_DEEP_ROUNDS);
  const [saved, setSaved] = useState(false);
  const { theme, setTheme, language, setLanguage } = useSettingsStore();
  const { t } = useTranslation();

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
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('settings.generalTitle')}</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-300 mb-1">{t('settings.language')}</label>
            <select
              className="input-field"
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'zh' | 'en')}
            >
              <option value="zh">{t('settings.languageZh')}</option>
              <option value="en">{t('settings.languageEn')}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-300 mb-1">{t('settings.theme')}</label>
            <select
              className="input-field"
              value={theme}
              onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'system')}
            >
              <option value="light">{t('settings.themeLight')}</option>
              <option value="dark">{t('settings.themeDark')}</option>
              <option value="system">{t('settings.themeSystem')}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Think mode settings */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Brain size={16} className="text-purple-500 dark:text-purple-400" />
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('settings.thinkConfigTitle')}</h3>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t('settings.thinkConfigDesc')}
        </p>

        <div className="space-y-4 bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
          {/* Normal think rounds */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700 dark:text-gray-200">{t('settings.normalThinkRounds')}</label>
              <span className="text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 px-2 py-0.5 rounded">
                {t('settings.roundsUnit', { count: String(normalRounds) })}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={MAX_THINK_ROUNDS}
              value={normalRounds}
              onChange={(e) => setNormalRounds(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary-600"
            />
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-gray-400 dark:text-gray-500">{t('settings.roundsFast')}</span>
              <span className="text-[10px] text-gray-400 dark:text-gray-500">{t('settings.roundsDeep', { max: String(MAX_THINK_ROUNDS) })}</span>
            </div>
          </div>

          {/* Deep think rounds */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700 dark:text-gray-200">{t('settings.deepThinkRounds')}</label>
              <span className="text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 px-2 py-0.5 rounded">
                {t('settings.roundsUnit', { count: String(deepRounds) })}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={MAX_THINK_ROUNDS}
              value={deepRounds}
              onChange={(e) => setDeepRounds(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-600"
            />
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-gray-400 dark:text-gray-500">{t('settings.roundsFast')}</span>
              <span className="text-[10px] text-gray-400 dark:text-gray-500">{t('settings.roundsDeep', { max: String(MAX_THINK_ROUNDS) })}</span>
            </div>
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          className={`px-4 py-2 text-sm rounded-lg transition-colors ${
            saved
              ? 'bg-green-500 dark:bg-green-600 text-white'
              : 'bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white'
          }`}
        >
          {saved ? t('settings.saved') : t('settings.save')}
        </button>
      </div>
    </div>
  );
}
