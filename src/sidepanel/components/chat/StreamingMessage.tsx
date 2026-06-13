import { Bot } from 'lucide-react';
import { MarkdownRenderer } from '@/sidepanel/components/shared/MarkdownRenderer';
import { ThinkingProcessPanel } from './ThinkingProcessPanel';
import type { ThinkingProcess } from '@/shared/types';

interface StreamingMessageProps {
  content: string;
  thinkingProcess?: ThinkingProcess[];
  isThinking?: boolean;
  currentThinkRound?: number;
}

export function StreamingMessage({
  content,
  thinkingProcess,
  isThinking,
  currentThinkRound,
}: StreamingMessageProps) {
  return (
    <div className="flex gap-2.5 px-4 py-3">
      {/* Avatar */}
      <div className="shrink-0 w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center justify-center">
        <Bot size={14} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 text-left">
        {/* Thinking process panel */}
        {(thinkingProcess && thinkingProcess.length > 0) || isThinking ? (
          <ThinkingProcessPanel
            processes={thinkingProcess || []}
            isThinking={isThinking}
            currentRound={currentThinkRound}
          />
        ) : null}

        {/* Main content */}
        <div className="inline-block max-w-[90%] rounded-xl rounded-bl-sm px-3 py-2 text-sm leading-relaxed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100">
          {content ? (
            <>
              <MarkdownRenderer
                content={content}
                className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-pre:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-code:text-primary-700 prose-code:bg-primary-50 dark:prose-code:text-primary-300 dark:prose-code:bg-primary-900/30 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none"
              />
              <span className="inline-block w-1.5 h-4 bg-primary-600 dark:bg-primary-400 animate-pulse rounded-sm align-text-bottom ml-0.5" />
            </>
          ) : (
            <div className="flex items-center gap-1 py-1">
              <style>{`
                @keyframes dotBounce {
                  0%, 80%, 100% { transform: translateY(0); }
                  40% { transform: translateY(-6px); }
                }
                .dot-bounce {
                  width: 6px;
                  height: 6px;
                  border-radius: 50%;
                  background-color: #9ca3af;
                  display: inline-block;
                  animation: dotBounce 1.4s ease-in-out infinite;
                }
              `}</style>
              <span className="dot-bounce" />
              <span className="dot-bounce" style={{ animationDelay: '0.15s' }} />
              <span className="dot-bounce" style={{ animationDelay: '0.3s' }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
