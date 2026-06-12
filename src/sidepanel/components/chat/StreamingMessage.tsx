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
      <div className="shrink-0 w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center">
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
        <div className="inline-block max-w-[90%] rounded-xl rounded-bl-sm px-3 py-2 text-sm leading-relaxed bg-white border border-gray-200 text-gray-800">
          {content ? (
            <MarkdownRenderer
              content={content}
              className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-pre:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-code:text-primary-700 prose-code:bg-primary-50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none"
            />
          ) : null}
          {/* Blinking cursor */}
          <span className="inline-block w-1.5 h-4 bg-primary-600 animate-pulse rounded-sm align-text-bottom ml-0.5" />
        </div>
      </div>
    </div>
  );
}
