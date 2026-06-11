import { ArrowLeft, ExternalLink, Copy, Check, Trash2, FileText } from 'lucide-react';
import { useState } from 'react';
import type { Note } from '@/shared/types';
import { formatDate } from '@/shared/utils';
import { Button } from '@/sidepanel/components/shared/Button';
import { MarkdownRenderer } from '@/sidepanel/components/shared/MarkdownRenderer';

interface NoteDetailProps {
  note: Note;
  onBack: () => void;
  onDelete: (id: number) => Promise<boolean>;
  onExportToFeishu: (id: number) => Promise<{ success: boolean; docUrl?: string; error?: string }>;
}

const sourceTypeLabels: Record<Note['source_type'], string> = {
  chat: '对话',
  summary: '总结',
  translation: '翻译',
  manual: '手动',
};

export function NoteDetail({ note, onBack, onDelete, onExportToFeishu }: NoteDetailProps) {
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(note.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = async () => {
    setExporting(true);
    await onExportToFeishu(note.id);
    setExporting(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 bg-white shrink-0">
        <button onClick={onBack} className="text-gray-500 hover:text-gray-700">
          <ArrowLeft size={16} />
        </button>
        <h2 className="flex-1 text-sm font-medium text-gray-800 truncate">{note.title}</h2>
      </div>

      {/* Meta */}
      <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 flex items-center gap-3 text-[10px] text-gray-500 shrink-0">
        <span>{formatDate(note.created_at)}</span>
        <span className="px-1.5 py-0.5 bg-white rounded border border-gray-200">{sourceTypeLabels[note.source_type]}</span>
        {note.source_url && (
          <a
            href={note.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-0.5 text-primary-600 hover:underline truncate"
          >
            <ExternalLink size={10} />
            来源
          </a>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <MarkdownRenderer
          content={note.content}
          className="prose prose-sm max-w-none prose-p:my-2 prose-headings:my-3 prose-pre:my-2 prose-ul:my-1 prose-ol:my-1"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-200 bg-white shrink-0">
        <Button onClick={handleCopy} variant="secondary" size="sm">
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? '已复制' : '复制'}
        </Button>
        {note.feishu_doc_url ? (
          <a
            href={note.feishu_doc_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="secondary" size="sm">
              <ExternalLink size={14} />
              打开飞书文档
            </Button>
          </a>
        ) : (
          <Button onClick={handleExport} loading={exporting} variant="primary" size="sm">
            <FileText size={14} />
            导出到飞书
          </Button>
        )}
        <div className="flex-1" />
        <Button onClick={() => onDelete(note.id)} variant="danger" size="sm">
          <Trash2 size={14} />
          删除
        </Button>
      </div>
    </div>
  );
}
