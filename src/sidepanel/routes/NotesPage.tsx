import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { EmptyState } from '@/sidepanel/components/shared/EmptyState';
import { NoteCard } from '@/sidepanel/components/notes/NoteCard';
import { NoteDetail } from '@/sidepanel/components/notes/NoteDetail';
import { useNotes } from '@/sidepanel/hooks/useNotes';
import { useToast } from '@/sidepanel/components/shared/Toast';
import { useTranslation } from '@/sidepanel/contexts/LanguageContext';
import type { Note } from '@/shared/types';

export function NotesPage() {
  const { notes, filter, setFilter, deleteNote, exportToFeishu } = useNotes();
  const { showToast } = useToast();
  const { t } = useTranslation();
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);

  const filterOptions: { key: Note['source_type'] | 'all'; labelKey: string }[] = [
    { key: 'all', labelKey: 'notes.filterAll' },
    { key: 'summary', labelKey: 'notes.filterSummary' },
    { key: 'translation', labelKey: 'notes.filterTranslation' },
    { key: 'chat', labelKey: 'notes.filterChat' },
  ];

  const handleDelete = async (id: number) => {
    const result = await deleteNote(id);
    if (result) {
      showToast('success', t('notes.deleted'));
      if (selectedNote?.id === id) {
        setSelectedNote(null);
      }
    }
    return result;
  };

  const handleExport = async (id: number) => {
    const result = await exportToFeishu(id);
    if (result.success) {
      showToast('success', t('notes.exportedToFeishu'));
      if (selectedNote?.id === id) {
        setSelectedNote({ ...selectedNote, feishu_doc_url: result.docUrl ?? '' });
      }
      if (result.skippedCount && result.skippedCount > 0) {
        showToast('info', `已跳过 ${result.skippedCount} 个飞书不支持的内容块，详见扩展后台日志`);
      }
    } else {
      showToast('error', result.error ?? t('notes.exportFailed'));
    }
    return result;
  };

  if (selectedNote) {
    return (
      <NoteDetail
        note={selectedNote}
        onBack={() => setSelectedNote(null)}
        onDelete={handleDelete}
        onExportToFeishu={handleExport}
      />
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      {/* Filter bar */}
      <div className="flex items-center gap-2 p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0">
        {filterOptions.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setFilter(opt.key)}
            className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
              filter === opt.key
                ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 font-medium'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            {t(opt.labelKey)}
          </button>
        ))}
      </div>

      {/* Notes list */}
      {notes.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={48} />}
          title={t('notes.emptyTitle')}
          description={t('notes.emptyDesc')}
        />
      ) : (
        <div className="p-3 space-y-2">
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onClick={() => setSelectedNote(note)}
              onDelete={handleDelete}
              onExportToFeishu={handleExport}
            />
          ))}
        </div>
      )}
    </div>
  );
}
