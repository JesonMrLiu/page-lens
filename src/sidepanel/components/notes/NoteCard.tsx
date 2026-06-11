import { ExternalLink, Trash2, FileText } from 'lucide-react';
import { useState } from 'react';
import type { Note } from '@/shared/types';
import { formatDate, truncateText } from '@/shared/utils';

interface NoteCardProps {
  note: Note;
  onClick: () => void;
  onDelete: (id: number) => Promise<boolean>;
  onExportToFeishu: (id: number) => Promise<{ success: boolean; docUrl?: string; error?: string }>;
}

const sourceTypeLabels: Record<Note['source_type'], { label: string; color: string }> = {
  chat: { label: '对话', color: 'bg-blue-50 text-blue-600' },
  summary: { label: '总结', color: 'bg-green-50 text-green-600' },
  translation: { label: '翻译', color: 'bg-purple-50 text-purple-600' },
  manual: { label: '手动', color: 'bg-gray-50 text-gray-600' },
};

export function NoteCard({ note, onClick, onDelete, onExportToFeishu }: NoteCardProps) {
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const typeInfo = sourceTypeLabels[note.source_type] ?? sourceTypeLabels.manual;

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
      className="card cursor-pointer hover:border-primary-300 transition-colors group"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${typeInfo.color}`}>
              {typeInfo.label}
            </span>
            {note.feishu_doc_url && (
              <ExternalLink size={10} className="text-green-500" />
            )}
          </div>
          <h4 className="text-sm font-medium text-gray-800 truncate">{note.title}</h4>
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{truncateText(note.content, 100)}</p>
          <div className="text-[10px] text-gray-400 mt-2">{formatDate(note.created_at)}</div>
        </div>
        <div className="flex items-center gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {!note.feishu_doc_url && (
            <button
              onClick={handleExport}
              disabled={exporting}
              className="p-1 text-gray-400 hover:text-primary-600 rounded"
              title="导出到飞书"
            >
              <FileText size={14} />
            </button>
          )}
          <button
            onClick={handleDelete}
            className={`p-1 rounded ${deleting ? 'text-red-600' : 'text-gray-400 hover:text-red-500'}`}
            title={deleting ? '确认删除' : '删除'}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
