import { Sparkles, Languages, Loader2 } from 'lucide-react';
import { useState, useCallback } from 'react';
import { DEFAULT_QUICK_PROMPTS, STORAGE_KEYS, type QuickActionKey } from '@/shared/constants';
import { useToast } from '@/sidepanel/components/shared/Toast';
import { useTranslation } from '@/sidepanel/contexts/LanguageContext';

interface QuickActionsProps {
  onAction: (prompt: string) => void;
  disabled?: boolean;
}

export function QuickActions({ onAction, disabled }: QuickActionsProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const { showToast } = useToast();
  const { t } = useTranslation();

  const handleQuickAction = useCallback(async (action: QuickActionKey) => {
    setLoading(action);
    try {
      // 点击时实时读取，保证设置页保存后立即生效
      const stored = await new Promise<Record<string, string>>((resolve) => {
        chrome.storage.local.get([STORAGE_KEYS.QUICK_PROMPTS], (result) => {
          resolve((result[STORAGE_KEYS.QUICK_PROMPTS] as Record<string, string>) || {});
        });
      });
      // 缺失或被清空则回退到默认值
      const prompt = stored[action]?.trim() || DEFAULT_QUICK_PROMPTS[action];
      onAction(prompt);
    } catch (err: any) {
      showToast('error', err.message || t('quickActions.actionFailed'));
    } finally {
      setLoading(null);
    }
  }, [onAction, showToast, t]);

  const actions: { key: QuickActionKey; labelKey: string; icon: React.ReactNode }[] = [
    {
      key: 'summarize',
      labelKey: 'quickActions.summarize',
      icon: <Sparkles size={14} />,
    },
    {
      key: 'translate-zh',
      labelKey: 'quickActions.translateToZh',
      icon: <Languages size={14} />,
    },
    {
      key: 'translate-en',
      labelKey: 'quickActions.translateToEn',
      icon: <Languages size={14} />,
    },
  ];

  return (
    <div className="flex items-center gap-1 px-3 pb-2">
      <span className="text-[10px] text-gray-400 dark:text-gray-500 mr-1">{t('quickActions.prefix')}</span>
      {actions.map((action) => (
        <button
          key={action.key}
          onClick={() => handleQuickAction(action.key)}
          disabled={disabled || loading !== null}
          className="flex items-center gap-1 px-2 py-1 text-[11px] text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading === action.key ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            action.icon
          )}
          {t(action.labelKey)}
        </button>
      ))}
    </div>
  );
}
