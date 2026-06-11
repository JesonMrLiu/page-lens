import { useState, useCallback, useEffect } from 'react';
import { noteRepo } from '@/db/repositories/note.repo';
import { feishuConfigRepo } from '@/db/repositories/feishu-config.repo';
import type { Note } from '@/shared/types';
import { MSG_TYPES } from '@/shared/constants';

interface UseNotesReturn {
  notes: Note[];
  isLoading: boolean;
  filter: Note['source_type'] | 'all';
  setFilter: (filter: Note['source_type'] | 'all') => void;
  refresh: () => void;
  createNote: (note: { title: string; content: string; source_url?: string; source_type?: Note['source_type']; conversation_id?: number; tags?: string }) => Promise<Note>;
  deleteNote: (id: number) => Promise<boolean>;
  exportToFeishu: (noteId: number) => Promise<{ success: boolean; docUrl?: string; error?: string }>;
}

export function useNotes(): UseNotesReturn {
  const [notes, setNotes] = useState<Note[]>([]);
  const [filter, setFilter] = useState<Note['source_type'] | 'all'>('all');
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(() => {
    try {
      const allNotes = filter === 'all'
        ? noteRepo.getAll()
        : noteRepo.getBySourceType(filter);
      setNotes(allNotes);
    } catch (err) {
      console.error('[PageLens] Failed to load notes:', err);
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createNote = useCallback(async (noteData: Parameters<typeof noteRepo.create>[0]): Promise<Note> => {
    const note = await noteRepo.create(noteData);
    refresh();
    return note;
  }, [refresh]);

  const deleteNote = useCallback(async (id: number): Promise<boolean> => {
    const result = await noteRepo.delete(id);
    refresh();
    return result;
  }, [refresh]);

  const exportToFeishu = useCallback(async (noteId: number): Promise<{ success: boolean; docUrl?: string; error?: string }> => {
    const note = noteRepo.getById(noteId);
    if (!note) {
      return { success: false, error: '笔记不存在' };
    }

    const feishuConfig = feishuConfigRepo.getActive();
    if (!feishuConfig) {
      return { success: false, error: '请先在设置中配置飞书应用' };
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: MSG_TYPES.EXPORT_TO_FEISHU,
        noteId,
        title: note.title,
        content: note.content,
        feishuConfig: {
          appId: feishuConfig.app_id,
          appSecret: feishuConfig.app_secret,
          folderToken: feishuConfig.folder_token,
        },
      });

      if (response.success && response.docId) {
        await noteRepo.updateFeishuExport(noteId, response.docId, response.docUrl);
        refresh();
      }

      return { success: response.success, docUrl: response.docUrl, error: response.error };
    } catch (err: any) {
      return { success: false, error: err.message || '导出失败' };
    }
  }, [refresh]);

  return {
    notes,
    isLoading,
    filter,
    setFilter,
    refresh,
    createNote,
    deleteNote,
    exportToFeishu,
  };
}
