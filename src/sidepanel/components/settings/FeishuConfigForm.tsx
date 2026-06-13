import { useState, useEffect } from 'react';
import { Eye, EyeOff, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/sidepanel/components/shared/Button';
import { useTranslation } from '@/sidepanel/contexts/LanguageContext';
import { useFeishu } from '@/sidepanel/hooks/useFeishu';

export function FeishuConfigForm() {
  const { activeConfig, saveConfig, updateConfig, testConnection } = useFeishu();
  const { t } = useTranslation();

  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [folderToken, setFolderToken] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (activeConfig) {
      setAppId(activeConfig.app_id);
      setAppSecret(activeConfig.app_secret);
      setFolderToken(activeConfig.folder_token);
      setSaved(true);
    }
  }, [activeConfig]);

  const handleTest = async () => {
    if (!appId.trim() || !appSecret.trim()) return;

    setTesting(true);
    setTestResult(null);
    const result = await testConnection(appId.trim(), appSecret.trim(), folderToken.trim() || undefined);
    setTestResult({
      success: result.success,
      message: result.success
        ? (folderToken.trim() ? t('feishu.connectionSuccessWithFolder') : t('feishu.connectionSuccessNoFolder'))
        : (result.error ?? t('feishu.connectionFailed')),
    });
    setTesting(false);
  };

  const handleSave = async () => {
    if (!appId.trim() || !appSecret.trim()) return;

    setSaving(true);
    try {
      if (activeConfig) {
        await updateConfig(activeConfig.id, {
          app_id: appId.trim(),
          app_secret: appSecret.trim(),
          folder_token: folderToken.trim(),
        });
      } else {
        await saveConfig({
          app_id: appId.trim(),
          app_secret: appSecret.trim(),
          folder_token: folderToken.trim(),
        });
      }
      setSaved(true);
      setTestResult({ success: true, message: t('feishu.saveSuccess') });
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || t('feishu.saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('feishu.title')}</h3>
        {saved && (
          <span className="flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400">
            <CheckCircle size={12} /> {t('feishu.configured')}
          </span>
        )}
      </div>

      <div>
        <label className="block text-xs text-gray-600 dark:text-gray-300 mb-1">{t('feishu.appIdLabel')}</label>
        <input
          type="text"
          className="input-field"
          placeholder="cli_xxxxxxxxxxxx"
          value={appId}
          onChange={(e) => { setAppId(e.target.value); setSaved(false); }}
        />
      </div>

      <div>
        <label className="block text-xs text-gray-600 dark:text-gray-300 mb-1">{t('feishu.appSecretLabel')}</label>
        <div className="relative">
          <input
            type={showSecret ? 'text' : 'password'}
            className="input-field pr-8"
            placeholder={t('feishu.appSecretPlaceholder')}
            value={appSecret}
            onChange={(e) => { setAppSecret(e.target.value); setSaved(false); }}
          />
          <button
            type="button"
            onClick={() => setShowSecret(!showSecret)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
          >
            {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-600 dark:text-gray-300 mb-1">{t('feishu.folderTokenLabel')}</label>
        <input
          type="text"
          className="input-field"
          placeholder={t('feishu.folderTokenPlaceholder')}
          value={folderToken}
          onChange={(e) => { setFolderToken(e.target.value); setSaved(false); }}
        />
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
          {t('feishu.folderTokenHint')}
        </p>
        <p className="text-[10px] text-primary-500 dark:text-primary-400 mt-0.5">
          {t('feishu.folderTokenTip')}
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
        <Button onClick={handleSave} loading={saving} disabled={!appId.trim() || !appSecret.trim()} size="sm">
          {t('feishu.save')}
        </Button>
        <Button onClick={handleTest} loading={testing} variant="secondary" size="sm" disabled={!appId.trim() || !appSecret.trim()}>
          {t('feishu.testConnection')}
        </Button>
      </div>

      <div className="border-t border-gray-100 dark:border-gray-700 pt-3 mt-3">
        <a
          href="https://open.feishu.cn/app"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
        >
          <ExternalLink size={12} />
          {t('feishu.goToOpenPlatform')}
        </a>
      </div>
    </div>
  );
}
