import { useState, useEffect } from 'react';
import { Brain, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import type { ThinkingProcess } from '@/shared/types';
import { MarkdownRenderer } from '@/sidepanel/components/shared/MarkdownRenderer';

interface ThinkingProcessPanelProps {
  processes: ThinkingProcess[];
  isThinking?: boolean;
  currentRound?: number;
}

export function ThinkingProcessPanel({
  processes,
  isThinking = false,
  currentRound,
}: ThinkingProcessPanelProps) {
  const [expanded, setExpanded] = useState(false);

  // 思考开始或有新内容时自动展开
  useEffect(() => {
    if (isThinking || processes.length > 0) {
      setExpanded(true);
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
        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors py-1"
      >
        <Brain size={14} className="text-purple-500" />
        <span className="font-medium">
          {isThinking
            ? `思考中 (第${currentRound}轮)...`
            : `思考过程 (${processes.length}轮)`}
        </span>
        {isThinking && (
          <Loader2 size={12} className="animate-spin text-purple-500" />
        )}
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {/* Thinking process content */}
      {expanded && (
        <div className="mt-1 ml-2 pl-3 border-l-2 border-purple-200 space-y-3">
          {processes.map((process, index) => (
            <div key={index} className="relative">
              {/* Round indicator */}
              <div className="flex items-center gap-1.5 mb-1">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-medium">
                  {process.round}
                </span>
                <span className="text-xs text-gray-400">
                  第{process.round}轮思考
                </span>
              </div>

              {/* Content */}
              <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-2">
                <MarkdownRenderer
                  content={process.content}
                  className="prose prose-xs max-w-none prose-p:my-0.5 prose-headings:my-1 prose-pre:my-1 prose-ul:my-0.5 prose-ol:my-0.5 prose-li:my-0.25"
                />
              </div>
            </div>
          ))}

          {/* Current thinking indicator */}
          {isThinking && (
            <div className="relative">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-purple-200 text-purple-700 text-[10px] font-medium animate-pulse">
                  {currentRound}
                </span>
                <span className="text-xs text-purple-500 animate-pulse">
                  正在思考...
                </span>
              </div>
              <div className="h-8 bg-gray-50 rounded-lg flex items-center justify-center">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
