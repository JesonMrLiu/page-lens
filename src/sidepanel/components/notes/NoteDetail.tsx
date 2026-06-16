import { ArrowLeft, ExternalLink, Copy, Check, Trash2, FileText, Pencil, X, Sparkles } from 'lucide-react';
import { useState, useMemo, useRef, useEffect } from 'react';
import type { Note } from '@/shared/types';
import { MSG_TYPES } from '@/shared/constants';
import { formatDate } from '@/shared/utils';
import { getEffectiveSourceUrl } from '@/db/repositories/note.repo';
import { modelConfigRepo } from '@/db/repositories/model-config.repo';
import { Button } from '@/sidepanel/components/shared/Button';
import { MarkdownRenderer } from '@/sidepanel/components/shared/MarkdownRenderer';
import { useTranslation } from '@/sidepanel/contexts/LanguageContext';

interface NoteDetailProps {
  note: Note;
  onBack: () => void;
  onDelete: (id: number) => Promise<boolean>;
  onExportToFeishu: (id: number) => Promise<{ success: boolean; docUrl?: string; error?: string }>;
  onUpdateTitle: (id: number, title: string) => Promise<void>;
  onCheckFeishuDoc: (id: number) => Promise<{ exists: boolean; deleted?: boolean }>;
}

export function NoteDetail({ note, onBack, onDelete, onExportToFeishu, onUpdateTitle, onCheckFeishuDoc }: NoteDetailProps) {
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(note.title);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const { t, locale } = useTranslation();
  const sourceUrl = useMemo(() => getEffectiveSourceUrl(note), [note]);
  const titleInputRef = useRef<HTMLInputElement>(null);
  // 记录已做过飞书云文档存在性校验的笔记 id，避免同一笔记重复校验
  const checkedDocRef = useRef<number | null>(null);

  // 进入编辑模式时聚焦输入框
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  // note 变化时同步标题输入
  useEffect(() => {
    setTitleInput(note.title);
  }, [note.title]);

  // 打开详情页时静默校验飞书云文档是否仍存在；同一笔记仅校验一次。
  // 仅当已导出（有 feishu_doc_url）时才校验；若确认已删除，上层会清空 feishu_doc_url，按钮自动切回「导出到飞书」。
  useEffect(() => {
    if (note.feishu_doc_url && checkedDocRef.current !== note.id) {
      checkedDocRef.current = note.id;
      onCheckFeishuDoc(note.id);
    }
  }, [note.id, note.feishu_doc_url, onCheckFeishuDoc]);

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

  // 点击「打开飞书文档」时实时校验文档是否仍存在。
  // 仅当明确判定「已删除」时不打开链接（上层会清空 feishu_doc_url，按钮自动切回「导出到飞书」并提示）；
  // 其余情况（存在 / 权限或网络等不可判定）保守打开，避免误拦正常文档。
  const handleOpenFeishuDoc = async () => {
    setChecking(true);
    try {
      const result = await onCheckFeishuDoc(note.id);
      if (result.deleted) return;
      window.open(note.feishu_doc_url, '_blank', 'noopener,noreferrer');
    } finally {
      setChecking(false);
    }
  };

  const handleSaveTitle = async () => {
    const trimmed = titleInput.trim();
    if (trimmed && trimmed !== note.title) {
      await onUpdateTitle(note.id, trimmed);
    } else {
      setTitleInput(note.title);
    }
    setIsEditingTitle(false);
  };

  const handleCancelEdit = () => {
    setTitleInput(note.title);
    setIsEditingTitle(false);
  };

  const handleOptimizeTitle = async () => {
    setIsOptimizing(true);
    try {
      const model = modelConfigRepo.getDefault();
      if (!model) {
        alert('请先在设置中配置 AI 模型');
        return;
      }
      const response = await chrome.runtime.sendMessage({
        type: MSG_TYPES.GENERATE_TITLE,
        content: note.content,
        modelConfig: {
          baseUrl: model.base_url,
          apiKey: model.api_key,
          model: model.model_id,
          fullUrl: !!model.full_url,
        },
      });
      if (response.success && response.title) {
        await onUpdateTitle(note.id, response.title);
        setTitleInput(response.title);
      } else {
        alert(response.error || 'AI 标题生成失败');
      }
    } catch (err: any) {
      alert('AI 标题生成失败: ' + (err.message || '未知错误'));
    } finally {
      setIsOptimizing(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0">
        <button onClick={onBack} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 shrink-0">
          <ArrowLeft size={16} />
        </button>

        {isEditingTitle ? (
          <>
            <input
              ref={titleInputRef}
              type="text"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveTitle();
                if (e.key === 'Escape') handleCancelEdit();
              }}
              className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-100 bg-transparent border-b border-primary-400 dark:border-primary-500 outline-none px-1"
              maxLength={200}
            />
            <button onClick={handleSaveTitle} className="text-green-600 hover:text-green-700 shrink-0" title="保存">
              <Check size={16} />
            </button>
            <button onClick={handleCancelEdit} className="text-gray-400 hover:text-gray-600 shrink-0" title="取消">
              <X size={16} />
            </button>
          </>
        ) : (
          <>
            <h2 className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-100 truncate cursor-pointer hover:text-primary-600 dark:hover:text-primary-400" title={note.title}>
              {note.title}
            </h2>
            <button
              onClick={() => setIsEditingTitle(true)}
              className="text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 shrink-0"
              title="编辑标题"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={handleOptimizeTitle}
              disabled={isOptimizing}
              className="text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 disabled:opacity-40 shrink-0"
              title="AI 优化标题"
            >
              <Sparkles size={14} />
            </button>
          </>
        )}
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
          <Button onClick={handleOpenFeishuDoc} loading={checking} variant="secondary" size="sm">
            <ExternalLink size={14} />
            {t('noteDetail.openFeishuDoc')}
          </Button>
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
