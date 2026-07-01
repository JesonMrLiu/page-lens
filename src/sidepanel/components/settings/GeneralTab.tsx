import { useState, useEffect } from 'react';
import { Globe, Brain, Sparkles, RotateCcw } from 'lucide-react';
import { STORAGE_KEYS, MAX_THINK_ROUNDS, DEFAULT_NORMAL_ROUNDS, DEFAULT_DEEP_ROUNDS, DEFAULT_QUICK_PROMPTS, type QuickActionKey } from '@/shared/constants';
import { useSettingsStore } from '@/sidepanel/stores/settings-store';
import { useTranslation } from '@/sidepanel/contexts/LanguageContext';
import { Button } from '@/sidepanel/components/shared/Button';

export function GeneralTab() {
  const [normalRounds, setNormalRounds] = useState(DEFAULT_NORMAL_ROUNDS);
  const [deepRounds, setDeepRounds] = useState(DEFAULT_DEEP_ROUNDS);
  const [quickPrompts, setQuickPrompts] = useState<Record<QuickActionKey, string>>({ ...DEFAULT_QUICK_PROMPTS });
  const [saved, setSaved] = useState(false);
  const { theme, setTheme, language, setLanguage } = useSettingsStore();
  const { t } = useTranslation();

  // Load saved settings
  useEffect(() => {
    chrome.storage.local.get(
      [STORAGE_KEYS.THINK_NORMAL_ROUNDS, STORAGE_KEYS.THINK_DEEP_ROUNDS, STORAGE_KEYS.QUICK_PROMPTS],
      (result) => {
        if (result[STORAGE_KEYS.THINK_NORMAL_ROUNDS] !== undefined) {
          setNormalRounds(result[STORAGE_KEYS.THINK_NORMAL_ROUNDS]);
        }
        if (result[STORAGE_KEYS.THINK_DEEP_ROUNDS] !== undefined) {
          setDeepRounds(result[STORAGE_KEYS.THINK_DEEP_ROUNDS]);
        }
        const stored = result[STORAGE_KEYS.QUICK_PROMPTS] as Partial<Record<QuickActionKey, string>> | undefined;
        if (stored) {
          setQuickPrompts({
            summarize: stored.summarize ?? DEFAULT_QUICK_PROMPTS.summarize,
            'translate-zh': stored['translate-zh'] ?? DEFAULT_QUICK_PROMPTS['translate-zh'],
            'translate-en': stored['translate-en'] ?? DEFAULT_QUICK_PROMPTS['translate-en'],
          });
        }
      },
    );
  }, []);

  const handleSave = () => {
    chrome.storage.local.set({
      [STORAGE_KEYS.THINK_NORMAL_ROUNDS]: normalRounds,
      [STORAGE_KEYS.THINK_DEEP_ROUNDS]: deepRounds,
      [STORAGE_KEYS.QUICK_PROMPTS]: quickPrompts,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const updatePrompt = (key: QuickActionKey, value: string) => {
    setQuickPrompts((prev) => ({ ...prev, [key]: value }));
  };

  const resetPrompt = (key: QuickActionKey) => {
    setQuickPrompts((prev) => ({ ...prev, [key]: DEFAULT_QUICK_PROMPTS[key] }));
  };

  const quickPromptFields: { key: QuickActionKey; labelKey: string }[] = [
    { key: 'summarize', labelKey: 'settings.quickPromptSummarize' },
    { key: 'translate-zh', labelKey: 'settings.quickPromptTranslateZh' },
    { key: 'translate-en', labelKey: 'settings.quickPromptTranslateEn' },
  ];

  return (
    <div className="space-y-4">
      {/* Card A: 通用偏好（语言 / 主题，即时生效） */}
      <section className="card space-y-3">
        <div className="flex items-center gap-2">
          <Globe size={15} className="text-primary-500 dark:text-primary-400" />
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('settings.generalTitle')}</h3>
        </div>
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
      </section>

      {/* Card B: AI 功能配置（思考轮数 + 快捷提示词，手动保存） */}
      <section className="card space-y-4">
        {/* B1: 思考推理配置 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Brain size={15} className="text-purple-500 dark:text-purple-400" />
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('settings.thinkConfigTitle')}</h3>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('settings.thinkConfigDesc')}</p>

          <div className="space-y-4">
            {/* Normal think rounds */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-gray-700 dark:text-gray-200">{t('settings.normalThinkRounds')}</label>
                <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700/60 px-2 py-0.5 rounded">
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
                <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700/60 px-2 py-0.5 rounded">
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
        </div>

        {/* 分割线 */}
        <div className="border-t border-gray-100 dark:border-gray-700/60" />

        {/* B2: 快捷功能提示词 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles size={15} className="text-primary-500 dark:text-primary-400" />
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('settings.quickPromptsTitle')}</h3>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('settings.quickPromptsDesc')}</p>

          <div className="space-y-4">
            {quickPromptFields.map((field) => (
              <div key={field.key}>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-gray-700 dark:text-gray-200">{t(field.labelKey)}</label>
                  <button
                    type="button"
                    onClick={() => resetPrompt(field.key)}
                    className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                  >
                    <RotateCcw size={10} />
                    {t('settings.resetToDefault')}
                  </button>
                </div>
                <textarea
                  className="input-field min-h-[60px] resize-y leading-relaxed"
                  value={quickPrompts[field.key]}
                  onChange={(e) => updatePrompt(field.key, e.target.value)}
                  placeholder={DEFAULT_QUICK_PROMPTS[field.key]}
                />
              </div>
            ))}
          </div>
        </div>

        {/* 保存按钮：作用于整张卡（思考轮数 + 快捷提示词） */}
        <div className="flex justify-end pt-1">
          <Button variant={saved ? 'secondary' : 'primary'} size="md" onClick={handleSave}>
            {saved ? t('settings.saved') : t('settings.save')}
          </Button>
        </div>
      </section>
    </div>
  );
}
