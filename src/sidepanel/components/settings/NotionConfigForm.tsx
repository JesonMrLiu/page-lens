import { useState, useEffect } from 'react';
import { Eye, EyeOff, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/sidepanel/components/shared/Button';
import { useTranslation } from '@/sidepanel/contexts/LanguageContext';
import { useNotion } from '@/sidepanel/hooks/useNotion';

export function NotionConfigForm() {
  const { activeConfig, saveConfig, updateConfig, testConnection } = useNotion();
  const { t } = useTranslation();

  const [token, setToken] = useState('');
  const [parentPageId, setParentPageId] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (activeConfig) {
      setToken(activeConfig.token);
      setParentPageId(activeConfig.parent_page_id);
      setSaved(true);
    }
  }, [activeConfig]);

  const handleTest = async () => {
    if (!token.trim()) return;

    setTesting(true);
    setTestResult(null);
    const result = await testConnection(token.trim(), parentPageId.trim() || undefined);
    setTestResult({
      success: result.success,
      message: result.success
        ? (parentPageId.trim() ? t('notion.connectionSuccessWithPage') : t('notion.connectionSuccessNoPage'))
        : (result.error ?? t('notion.connectionFailed')),
    });
    setTesting(false);
  };

  const handleSave = async () => {
    if (!token.trim()) return;

    setSaving(true);
    try {
      if (activeConfig) {
        await updateConfig(activeConfig.id, {
          token: token.trim(),
          parent_page_id: parentPageId.trim(),
        });
      } else {
        await saveConfig({
          token: token.trim(),
          parent_page_id: parentPageId.trim(),
        });
      }
      setSaved(true);
      setTestResult({ success: true, message: t('notion.saveSuccess') });
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || t('notion.saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('notion.title')}</h3>
        {saved && (
          <span className="flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400">
            <CheckCircle size={12} /> {t('notion.configured')}
          </span>
        )}
      </div>

      <div>
        <label className="block text-xs text-gray-600 dark:text-gray-300 mb-1">{t('notion.tokenLabel')}</label>
        <div className="relative">
          <input
            type={showToken ? 'text' : 'password'}
            className="input-field pr-8"
            placeholder={t('notion.tokenPlaceholder')}
            value={token}
            onChange={(e) => { setToken(e.target.value); setSaved(false); }}
          />
          <button
            type="button"
            onClick={() => setShowToken(!showToken)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
          >
            {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
          {t('notion.tokenHint')}
        </p>
      </div>

      <div>
        <label className="block text-xs text-gray-600 dark:text-gray-300 mb-1">{t('notion.parentPageLabel')}</label>
        <input
          type="text"
          className="input-field"
          placeholder={t('notion.parentPagePlaceholder')}
          value={parentPageId}
          onChange={(e) => { setParentPageId(e.target.value); setSaved(false); }}
        />
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
          {t('notion.parentPageHint')}
        </p>
        <p className="text-[10px] text-primary-500 dark:text-primary-400 mt-0.5">
          {t('notion.connectTip')}
        </p>
      </div>

      {/* Test result */}
      {testResult && (
        <div className={`text-xs p-2 rounded flex items-start gap-1.5 ${
          testResult.success ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400'
        }`}>
          {testResult.success ? <CheckCircle size={14} className="shrink-0 mt-0.5" /> : <AlertCircle size={14} className="shrink-0 mt-0.5" />}
          <span className="whitespace-pre-wrap">{testResult.message}</span>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button onClick={handleSave} loading={saving} disabled={!token.trim()} size="sm">
          {t('notion.save')}
        </Button>
        <Button onClick={handleTest} loading={testing} variant="secondary" size="sm" disabled={!token.trim()}>
          {t('notion.testConnection')}
        </Button>
      </div>

      <div className="border-t border-gray-100 dark:border-gray-700 pt-3 mt-3">
        <a
          href="https://www.notion.so/profile/integrations"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
        >
          <ExternalLink size={12} />
          {t('notion.goToIntegrations')}
        </a>
      </div>
    </div>
  );
}
