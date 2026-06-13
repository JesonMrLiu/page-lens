import { ArrowLeft, ExternalLink, Copy, Check, Trash2, FileText } from 'lucide-react';
import { useState, useMemo } from 'react';
import type { Note } from '@/shared/types';
import { formatDate } from '@/shared/utils';
import { getEffectiveSourceUrl } from '@/db/repositories/note.repo';
import { Button } from '@/sidepanel/components/shared/Button';
import { MarkdownRenderer } from '@/sidepanel/components/shared/MarkdownRenderer';
import { useTranslation } from '@/sidepanel/contexts/LanguageContext';

interface NoteDetailProps {
  note: Note;
  onBack: () => void;
  onDelete: (id: number) => Promise<boolean>;
  onExportToFeishu: (id: number) => Promise<{ success: boolean; docUrl?: string; error?: string }>;
}

export function NoteDetail({ note, onBack, onDelete, onExportToFeishu }: NoteDetailProps) {
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { t, locale } = useTranslation();
  const sourceUrl = useMemo(() => getEffectiveSourceUrl(note), [note]);

  const sourceTypeLabels: Record<Note['source_type'], string> = {
    chat: t('noteDetail.sourceChat'),
    summary: t('noteDetail.sourceSummary'),
    translation: t('noteDetail.sourceTranslation'),
    manual: t('noteDetail.sourceManual'),
  };

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
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0">
        <button onClick={onBack} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
          <ArrowLeft size={16} />
        </button>
        <h2 className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{note.title}</h2>
      </div>

      {/* Meta */}
      <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex items-center gap-3 text-[10px] text-gray-500 dark:text-gray-400 shrink-0">
        <span>{formatDate(note.created_at, locale)}</span>
        <span className="px-1.5 py-0.5 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-600">{sourceTypeLabels[note.source_type]}</span>
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-0.5 text-primary-600 dark:text-primary-400 hover:underline truncate"
          >
            <ExternalLink size={10} />
            {t('noteDetail.source')}
          </a>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {sourceUrl && (
          <blockquote className="mb-3 pl-3 border-l-2 border-primary-300 dark:border-primary-700 text-xs text-gray-500 dark:text-gray-400">
            {t('noteDetail.sourceLabel')}
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 dark:text-primary-400 hover:underline break-all"
            >
              {sourceUrl}
            </a>
          </blockquote>
        )}
        <MarkdownRenderer
          content={note.content}
          className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-headings:my-3 prose-pre:my-2 prose-ul:my-1 prose-ol:my-1"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0">
        <Button onClick={handleCopy} variant="secondary" size="sm">
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? t('noteDetail.copied') : t('noteDetail.copy')}
        </Button>
        {note.feishu_doc_url ? (
          <a
            href={note.feishu_doc_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="secondary" size="sm">
              <ExternalLink size={14} />
              {t('noteDetail.openFeishuDoc')}
            </Button>
          </a>
        ) : (
          <Button onClick={handleExport} loading={exporting} variant="primary" size="sm">
            <FileText size={14} />
            {t('noteDetail.exportToFeishu')}
          </Button>
        )}
        <div className="flex-1" />
        <Button onClick={() => onDelete(note.id)} variant="danger" size="sm">
          <Trash2 size={14} />
          {t('noteDetail.delete')}
        </Button>
      </div>
    </div>
  );
}
