import { Brain, Zap, MessageCircle } from 'lucide-react';
import { useTranslation } from '@/sidepanel/contexts/LanguageContext';
import { THINK_MODES } from '@/shared/constants';
import type { ThinkMode } from '@/shared/types';

interface ThinkModeSelectorProps {
  value: ThinkMode;
  onChange: (mode: ThinkMode) => void;
  disabled?: boolean;
}

const modeIcons: Record<ThinkMode, React.ReactNode> = {
  none: <MessageCircle size={12} />,
  normal: <Zap size={12} />,
  deep: <Brain size={12} />,
};

const modeLabelKeys: Record<ThinkMode, string> = {
  none: 'thinkMode.none',
  normal: 'thinkMode.normal',
  deep: 'thinkMode.deep',
};

export function ThinkModeSelector({ value, onChange, disabled }: ThinkModeSelectorProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
      {(Object.entries(THINK_MODES) as [ThinkMode, { label: string }][]).map(([mode]) => (
        <button
          key={mode}
          onClick={() => onChange(mode)}
          disabled={disabled}
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-all ${
            value === mode
              ? 'bg-white dark:bg-gray-600 shadow-sm text-primary-700 dark:text-primary-400 font-medium'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          title={t(modeLabelKeys[mode])}
        >
          {modeIcons[mode]}
          <span>{t(modeLabelKeys[mode])}</span>
        </button>
      ))}
    </div>
  );
}
