import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useSettingsStore } from '@/sidepanel/stores/settings-store';
import { zh, en } from '@/sidepanel/i18n';

const dictionaries = { zh, en } as const;

interface TranslationContextValue {
  t: (key: string, params?: Record<string, string | number>) => string;
  locale: 'zh' | 'en';
}

const TranslationContext = createContext<TranslationContextValue>({
  t: (key) => key,
  locale: 'zh',
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const language = useSettingsStore((s) => s.language);

  const value = useMemo<TranslationContextValue>(() => {
    const dict = dictionaries[language] ?? dictionaries.zh;
    const fallback = dictionaries.zh;

    const t = (key: string, params?: Record<string, string | number>): string => {
      let text = dict[key] ?? fallback[key] ?? key;
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        });
      }
      return text;
    };

    return { t, locale: language };
  }, [language]);

  return (
    <TranslationContext.Provider value={value}>
      {children}
    </TranslationContext.Provider>
  );
}

export function useTranslation() {
  return useContext(TranslationContext);
}
