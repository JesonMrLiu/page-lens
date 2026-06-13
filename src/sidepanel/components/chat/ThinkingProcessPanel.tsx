import { useState, useEffect, useRef } from 'react';
import { Brain, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { useTranslation } from '@/sidepanel/contexts/LanguageContext';
import type { ThinkingProcess } from '@/shared/types';

interface ThinkingProcessPanelProps {
  processes: ThinkingProcess[];
  isThinking?: boolean;
  currentRound?: number;
  /** 正文内容是否已开始输出——用于在思考结束后触发自动收起 */
  contentStarted?: boolean;
}

export function ThinkingProcessPanel({
  processes,
  isThinking = false,
  currentRound,
}: ThinkingProcessPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const wasThinkingRef = useRef(false);
  const { t } = useTranslation();

  useEffect(() => {
    if (isThinking) {
      setExpanded(true);
      wasThinkingRef.current = true;
    }
  }, [isThinking]);

  useEffect(() => {
    if (wasThinkingRef.current && !isThinking && processes.length > 0) {
      setExpanded(false);
      wasThinkingRef.current = false;
    }
  }, [isThinking, processes.length]);

  if (processes.length === 0 && !isThinking) {
    return null;
  }

  return (
    <div className="mb-2">
      {/* Toggle button */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors py-1"
      >
        <Brain size={14} className="text-purple-500 dark:text-purple-400" />
        <span className="font-medium">
          {isThinking
            ? t('thinking.inProgress', { round: String(currentRound ?? '') })
            : t('thinking.complete', { count: String(processes.length) })}
        </span>
        {isThinking && (
          <Loader2 size={12} className="animate-spin text-purple-500 dark:text-purple-400" />
        )}
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {/* Thinking process content */}
      {expanded && (
        <div className="mt-1 ml-2 pl-3 border-l-2 border-purple-200 dark:border-purple-700 space-y-3">
          {processes.map((process, index) => (
            <div key={index} className="relative">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 text-[10px] font-medium">
                  {process.round}
                </span>
                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                  {t('thinking.roundLabel', { round: String(process.round) })}
                </span>
              </div>

              <div className="text-xs leading-relaxed text-gray-400 dark:text-gray-500 italic bg-purple-50/50 dark:bg-purple-900/20 rounded-lg p-2">
                <p className="whitespace-pre-wrap break-words">{process.content}</p>
              </div>
            </div>
          ))}

          {isThinking && (
            <div className="relative">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-purple-200 dark:bg-purple-800/50 text-purple-700 dark:text-purple-300 text-[10px] font-medium animate-pulse">
                  {currentRound}
                </span>
                <span className="text-xs text-purple-500 dark:text-purple-400 animate-pulse">
                  {t('thinking.currentlyThinking')}
                </span>
              </div>
              <div className="h-8 bg-gray-50 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 bg-purple-400 dark:bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 bg-purple-400 dark:bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 bg-purple-400 dark:bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
