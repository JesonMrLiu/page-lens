import { useState } from 'react';
import { Plus, Star, Edit2, Trash2, Check, X } from 'lucide-react';
import { Button } from '@/sidepanel/components/shared/Button';
import { ModelConfigForm } from './ModelConfigForm';
import { useTranslation } from '@/sidepanel/contexts/LanguageContext';
import type { ModelConfig, CreateModelConfig, UpdateModelConfig } from '@/shared/types';
import { formatDate } from '@/shared/utils';

interface ModelConfigListProps {
  models: ModelConfig[];
  onAdd: (config: CreateModelConfig) => Promise<ModelConfig>;
  onUpdate: (config: UpdateModelConfig) => Promise<ModelConfig | null>;
  onDelete: (id: number) => Promise<boolean>;
  onSetDefault: (id: number) => Promise<void>;
  onTest: (baseUrl: string, apiKey: string, model: string) => Promise<{ success: boolean; error?: string }>;
}

export function ModelConfigList({ models, onAdd, onUpdate, onDelete, onSetDefault, onTest }: ModelConfigListProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const { t, locale } = useTranslation();

  const handleAdd = async (config: CreateModelConfig | UpdateModelConfig) => {
    await onAdd(config as CreateModelConfig);
    setShowAddForm(false);
  };

  const handleUpdate = async (config: UpdateModelConfig | CreateModelConfig) => {
    await onUpdate(config as UpdateModelConfig);
    setEditingId(null);
  };

  const handleSetDefault = async (id: number) => {
    await onSetDefault(id);
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200">
          {t('modelConfig.title', { count: String(models.length) })}
        </h3>
        {!showAddForm && (
          <Button onClick={() => setShowAddForm(true)} variant="ghost" size="sm">
            <Plus size={14} />
            {t('modelConfig.add')}
          </Button>
        )}
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{t('modelConfig.addNewModel')}</span>
            <button onClick={() => setShowAddForm(false)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
              <X size={14} />
            </button>
          </div>
          <ModelConfigForm
            onSave={handleAdd}
            onTest={onTest}
            onCancel={() => setShowAddForm(false)}
          />
        </div>
      )}

      {/* Model cards */}
      {models.length === 0 && !showAddForm && (
        <div className="text-center py-6 text-gray-400 dark:text-gray-500 text-xs">
          {t('modelConfig.noModels')}
        </div>
      )}

      {models.map((model) => (
        <div key={model.id} className="card">
          {editingId === model.id ? (
            <ModelConfigForm
              model={model}
              onSave={handleUpdate}
              onDelete={handleDelete}
              onSetDefault={handleSetDefault}
              onTest={onTest}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{model.name}</span>
                  {model.is_default ? (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 rounded text-[10px] font-medium">
                      <Star size={10} /> {t('modelConfig.default')}
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                  {model.model_id} · {model.base_url}
                </div>
                <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                  {t('modelConfig.addedAt', { date: formatDate(model.created_at, locale) })}
                </div>
              </div>
              <div className="flex items-center gap-1 ml-2">
                {!model.is_default && (
                  <button
                    onClick={() => handleSetDefault(model.id)}
                    className="p-1 text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 rounded"
                    title={t('modelConfig.setDefault')}
                  >
                    <Star size={14} />
                  </button>
                )}
                <button
                  onClick={() => setEditingId(model.id)}
                  className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded"
                  title={t('modelConfig.edit')}
                >
                  <Edit2 size={14} />
                </button>
                {deletingId === model.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDelete(model.id)}
                      className="p-1 text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 rounded"
                      title={t('modelConfig.confirmDelete')}
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => setDeletingId(null)}
                      className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded"
                      title={t('modelConfig.cancel')}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeletingId(model.id)}
                    className="p-1 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 rounded"
                    title={t('modelConfig.delete')}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
