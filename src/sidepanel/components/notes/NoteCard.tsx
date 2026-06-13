import { ExternalLink, Trash2, FileText, Link } from 'lucide-react';
import { useState, useMemo } from 'react';
import type { Note } from '@/shared/types';
import { formatDate, truncateText, extractDomain } from '@/shared/utils';
import { getEffectiveSourceUrl } from '@/db/repositories/note.repo';
import { useTranslation } from '@/sidepanel/contexts/LanguageContext';

interface NoteCardProps {
  note: Note;
  onClick: () => void;
  onDelete: (id: number) => Promise<boolean>;
  onExportToFeishu: (id: number) => Promise<{ success: boolean; docUrl?: string; error?: string }>;
}

export function NoteCard({ note, onClick, onDelete, onExportToFeishu }: NoteCardProps) {
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { t, locale } = useTranslation();

  const sourceTypeInfo: Record<Note['source_type'], { labelKey: string; color: string }> = {
    chat: { labelKey: 'noteCard.sourceChat', color: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' },
    summary: { labelKey: 'noteCard.sourceSummary', color: 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400' },
    translation: { labelKey: 'noteCard.sourceTranslation', color: 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' },
    manual: { labelKey: 'noteCard.sourceManual', color: 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-400' },
  };

  const typeInfo = sourceTypeInfo[note.source_type] ?? sourceTypeInfo.manual;
  const sourceUrl = useMemo(() => getEffectiveSourceUrl(note), [note]);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (deleting) {
      await onDelete(note.id);
    } else {
      setDeleting(true);
      setTimeout(() => setDeleting(false), 3000);
    }
  };

  const handleExport = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setExporting(true);
    await onExportToFeishu(note.id);
    setExporting(false);
  };

  return (
    <div
      onClick={onClick}
      className="card cursor-pointer hover:border-primary-300 dark:hover:border-primary-600 transition-colors group"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${typeInfo.color}`}>
              {t(typeInfo.labelKey)}
            </span>
            {note.feishu_doc_url && (
              <ExternalLink size={10} className="text-green-500 dark:text-green-400" />
            )}
          </div>
          <h4 className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{note.title}</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{truncateText(note.content, 100)}</p>
          <div className="flex items-center gap-2 text-[10px] text-gray-400 dark:text-gray-500 mt-2">
            <span>{formatDate(note.created_at, locale)}</span>
            {sourceUrl && (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-0.5 text-primary-600 dark:text-primary-400 hover:underline truncate max-w-[140px]"
                title={sourceUrl}
              >
                <Link size={10} className="shrink-0" />
                {extractDomain(sourceUrl)}
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {!note.feishu_doc_url && (
            <button
              onClick={handleExport}
              disabled={exporting}
              className="p-1 text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 rounded"
              title={t('noteCard.exportToFeishu')}
            >
              <FileText size={14} />
            </button>
          )}
          <button
            onClick={handleDelete}
            className={`p-1 rounded ${deleting ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400'}`}
            title={deleting ? t('noteCard.confirmDelete') : t('noteCard.delete')}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
