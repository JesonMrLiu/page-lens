import { ChevronDown } from 'lucide-react';
import { useTranslation } from '@/sidepanel/contexts/LanguageContext';
import type { ModelConfig } from '@/shared/types';

interface ModelSelectorProps {
  models: ModelConfig[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  disabled?: boolean;
}

export function ModelSelector({ models, selectedId, onSelect, disabled }: ModelSelectorProps) {
  const { t } = useTranslation();

  return (
    <div className="relative">
      <select
        className="appearance-none bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1 pr-7 text-xs text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:focus:ring-primary-400 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed max-w-[180px]"
        value={selectedId ?? ''}
        onChange={(e) => onSelect(Number(e.target.value))}
        disabled={disabled || models.length === 0}
      >
        {models.length === 0 && (
          <option value="">{t('modelSelector.noModel')}</option>
        )}
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.name}{model.is_default ? ' ★' : ''}
          </option>
        ))}
      </select>
      <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" />
    </div>
  );
}
