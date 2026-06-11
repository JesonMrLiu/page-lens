import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { EmptyState } from '@/sidepanel/components/shared/EmptyState';
import { NoteCard } from '@/sidepanel/components/notes/NoteCard';
import { NoteDetail } from '@/sidepanel/components/notes/NoteDetail';
import { useNotes } from '@/sidepanel/hooks/useNotes';
import { useToast } from '@/sidepanel/components/shared/Toast';
import type { Note } from '@/shared/types';

const filterOptions: { key: Note['source_type'] | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'summary', label: '总结' },
  { key: 'translation', label: '翻译' },
  { key: 'chat', label: '对话' },
];

export function NotesPage() {
  const { notes, filter, setFilter, deleteNote, exportToFeishu } = useNotes();
  const { showToast } = useToast();
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);

  const handleDelete = async (id: number) => {
    const result = await deleteNote(id);
    if (result) {
      showToast('success', '笔记已删除');
      if (selectedNote?.id === id) {
        setSelectedNote(null);
      }
    }
    return result;
  };

  const handleExport = async (id: number) => {
    const result = await exportToFeishu(id);
    if (result.success) {
      showToast('success', '已导出到飞书');
      // Refresh note detail if currently viewing
      if (selectedNote?.id === id) {
        setSelectedNote({ ...selectedNote, feishu_doc_url: result.docUrl ?? '' });
      }
    } else {
      showToast('error', result.error ?? '导出失败');
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
      <div className="flex items-center gap-2 p-3 border-b border-gray-200 bg-white shrink-0">
        {filterOptions.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setFilter(opt.key)}
            className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
              filter === opt.key
                ? 'bg-primary-50 text-primary-700 font-medium'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Notes list */}
      {notes.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={48} />}
          title="暂无笔记"
          description="在聊天中保存 AI 回复，或总结页面内容后可保存为笔记"
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
