import { create } from 'zustand';
import { STORAGE_KEYS } from '@/shared/constants';

export type ThemeMode = 'light' | 'dark' | 'system';
export type Language = 'zh' | 'en';

interface SettingsState {
  theme: ThemeMode;
  language: Language;
  effectiveTheme: 'light' | 'dark';

  // Actions
  setTheme: (theme: ThemeMode) => void;
  setLanguage: (language: Language) => void;
  initialize: () => void;
}

/** 根据主题设置和系统偏好计算实际主题 */
function computeEffectiveTheme(theme: ThemeMode): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

/** 切换 document.documentElement 上的 dark class */
function applyThemeToDOM(effectiveTheme: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', effectiveTheme === 'dark');
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  theme: 'system',
  language: 'zh',
  effectiveTheme: 'light',

  setTheme: (theme: ThemeMode) => {
    const effectiveTheme = computeEffectiveTheme(theme);
    chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS_THEME]: theme });
    applyThemeToDOM(effectiveTheme);
    set({ theme, effectiveTheme });
  },

  setLanguage: (language: Language) => {
    chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS_LANGUAGE]: language });
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    set({ language });
  },

  initialize: () => {
    // 从 chrome.storage.local 加载设置
    chrome.storage.local.get(
      [STORAGE_KEYS.SETTINGS_THEME, STORAGE_KEYS.SETTINGS_LANGUAGE],
      (result) => {
        const theme = (result[STORAGE_KEYS.SETTINGS_THEME] as ThemeMode) || 'system';
        const language = (result[STORAGE_KEYS.SETTINGS_LANGUAGE] as Language) || 'zh';
        const effectiveTheme = computeEffectiveTheme(theme);

        applyThemeToDOM(effectiveTheme);
        document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
        set({ theme, language, effectiveTheme });
      },
    );

    // 监听系统主题变化（用于 system 模式）
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      const { theme } = get();
      if (theme === 'system') {
        const effectiveTheme = computeEffectiveTheme('system');
        applyThemeToDOM(effectiveTheme);
        set({ effectiveTheme });
      }
    };
    mediaQuery.addEventListener('change', handleChange);
  },
}));
