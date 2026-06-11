import { Sparkles, Languages, Loader2 } from 'lucide-react';
import { useState, useCallback } from 'react';
import { PROMPTS } from '@/shared/constants';
import { useToast } from '@/sidepanel/components/shared/Toast';

interface QuickActionsProps {
  onAction: (prompt: string) => void;
  disabled?: boolean;
}

export function QuickActions({ onAction, disabled }: QuickActionsProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const { showToast } = useToast();

  const handleQuickAction = useCallback((action: 'summarize' | 'translate-zh' | 'translate-en') => {
    setLoading(action);
    try {
      let prompt: string;
      switch (action) {
        case 'summarize':
          prompt = PROMPTS.summarize('zh');
          break;
        case 'translate-zh':
          prompt = PROMPTS.translateToZh();
          break;
        case 'translate-en':
          prompt = PROMPTS.translateToEn();
          break;
      }

      onAction(prompt);
    } catch (err: any) {
      showToast('error', err.message || '操作失败');
    } finally {
      setLoading(null);
    }
  }, [onAction, showToast]);

  const actions = [
    {
      key: 'summarize' as const,
      label: '总结',
      icon: <Sparkles size={14} />,
    },
    {
      key: 'translate-zh' as const,
      label: '英→中',
      icon: <Languages size={14} />,
    },
    {
      key: 'translate-en' as const,
      label: '中→英',
      icon: <Languages size={14} />,
    },
  ];

  return (
    <div className="flex items-center gap-1 px-3 pb-2">
      <span className="text-[10px] text-gray-400 mr-1">快捷:</span>
      {actions.map((action) => (
        <button
          key={action.key}
          onClick={() => handleQuickAction(action.key)}
          disabled={disabled || loading !== null}
          className="flex items-center gap-1 px-2 py-1 text-[11px] text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading === action.key ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            action.icon
          )}
          {action.label}
        </button>
      ))}
    </div>
  );
}
