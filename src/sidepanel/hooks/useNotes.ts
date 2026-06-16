import { useState, useCallback, useEffect } from 'react';
import { noteRepo, getEffectiveSourceUrl } from '@/db/repositories/note.repo';
import { feishuConfigRepo } from '@/db/repositories/feishu-config.repo';
import type { Note } from '@/shared/types';
import { MSG_TYPES } from '@/shared/constants';
import { renderAllMermaidBlocks } from '@/sidepanel/utils/mermaid-renderer';

interface UseNotesReturn {
  notes: Note[];
  isLoading: boolean;
  filter: Note['source_type'] | 'all';
  setFilter: (filter: Note['source_type'] | 'all') => void;
  refresh: () => void;
  createNote: (note: { title: string; content: string; source_url?: string; source_type?: Note['source_type']; conversation_id?: number; tags?: string }) => Promise<Note>;
  updateNote: (id: number, updates: Partial<Pick<Note, 'title' | 'content' | 'tags'>>) => Promise<void>;
  deleteNote: (id: number) => Promise<boolean>;
  exportToFeishu: (noteId: number) => Promise<{ success: boolean; docUrl?: string; error?: string; skippedCount?: number }>;
  checkFeishuDoc: (noteId: number) => Promise<{ exists: boolean; deleted?: boolean; error?: string }>;
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

  const updateNote = useCallback(async (id: number, updates: Partial<Pick<Note, 'title' | 'content' | 'tags'>>) => {
    await noteRepo.update(id, updates);
    refresh();
  }, [refresh]);

  const exportToFeishu = useCallback(async (noteId: number): Promise<{ success: boolean; docUrl?: string; error?: string; skippedCount?: number }> => {
    const note = noteRepo.getById(noteId);
    if (!note) {
      return { success: false, error: '笔记不存在' };
    }

    const feishuConfig = feishuConfigRepo.getActive();
    if (!feishuConfig) {
      return { success: false, error: '请先在设置中配置飞书应用' };
    }

    try {
      // 导出内容开头附上原文链接（飞书侧渲染为引用块）
      const sourceUrl = getEffectiveSourceUrl(note);
      const exportContent = sourceUrl
        ? `> 原文链接：${sourceUrl}\n\n${note.content}`
        : note.content;

      // 渲染 Mermaid 块为 PNG 图片
      let mermaidImages: Array<{ base64: string; width: number; height: number } | null> | undefined;
      try {
        mermaidImages = await renderAllMermaidBlocks(exportContent);
        if (mermaidImages && mermaidImages.length === 0) {
          mermaidImages = undefined;
        }
      } catch (err) {
        console.warn('[PageLens] Mermaid 渲染异常，将回退为代码块:', err);
        mermaidImages = undefined;
      }

      const response = await chrome.runtime.sendMessage({
        type: MSG_TYPES.EXPORT_TO_FEISHU,
        noteId,
        title: note.title,
        content: exportContent,
        mermaidImages,
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

      return {
        success: response.success,
        docUrl: response.docUrl,
        error: response.error,
        skippedCount: (response as any).skippedCount || 0,
      };
    } catch (err: any) {
      return { success: false, error: err.message || '导出失败' };
    }
  }, [refresh]);

  const checkFeishuDoc = useCallback(async (noteId: number): Promise<{ exists: boolean; deleted?: boolean; error?: string }> => {
    const note = noteRepo.getById(noteId);
    // 没有飞书文档 id，直接视为不存在，但不触发任何操作
    if (!note || !note.feishu_doc_id) {
      return { exists: false };
    }

    // 未配置飞书应用：无法验证，保守维持现状
    const feishuConfig = feishuConfigRepo.getActive();
    if (!feishuConfig) {
      return { exists: false };
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: MSG_TYPES.CHECK_FEISHU_DOC,
        docId: note.feishu_doc_id,
        feishuConfig: {
          appId: feishuConfig.app_id,
          appSecret: feishuConfig.app_secret,
        },
      });

      // 只有明确「已删除」才清除本地记录；其他失败（权限/网络/认证）维持现状
      if (response && response.deleted === true) {
        await noteRepo.clearFeishuExport(noteId);
        refresh();
      }

      return {
        exists: response?.exists ?? false,
        deleted: response?.deleted,
        error: response?.error,
      };
    } catch (err: any) {
      // 消息通道异常：维持现状
      return { exists: false, error: err.message };
    }
  }, [refresh]);

  return {
    notes,
    isLoading,
    filter,
    setFilter,
    refresh,
    createNote,
    updateNote,
    deleteNote,
    exportToFeishu,
    checkFeishuDoc,
  };
}
