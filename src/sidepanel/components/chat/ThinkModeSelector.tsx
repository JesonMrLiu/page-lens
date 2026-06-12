import { Brain, Zap, MessageCircle } from 'lucide-react';
import type { ThinkMode } from '@/shared/types';
import { THINK_MODES } from '@/shared/constants';

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

export function ThinkModeSelector({ value, onChange, disabled }: ThinkModeSelectorProps) {
  return (
    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
      {(Object.entries(THINK_MODES) as [ThinkMode, { label: string }][]).map(([mode, config]) => (
        <button
          key={mode}
          onClick={() => onChange(mode)}
          disabled={disabled}
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-all ${
            value === mode
              ? 'bg-white shadow-sm text-primary-700 font-medium'
              : 'text-gray-500 hover:text-gray-700'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          title={config.label}
        >
          {modeIcons[mode]}
          <span>{config.label}</span>
        </button>
      ))}
    </div>
  );
}
