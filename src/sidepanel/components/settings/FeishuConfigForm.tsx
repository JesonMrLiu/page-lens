import { useState, useEffect } from 'react';
import { Eye, EyeOff, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/sidepanel/components/shared/Button';
import { useFeishu } from '@/sidepanel/hooks/useFeishu';

export function FeishuConfigForm() {
  const { activeConfig, saveConfig, updateConfig, testConnection } = useFeishu();

  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [folderToken, setFolderToken] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saved, setSaved] = useState(false);

  // Load existing config
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
        ? (folderToken.trim() ? '连接成功！应用凭证和文件夹权限验证通过。' : '连接成功！飞书应用认证通过。')
        : (result.error ?? '连接失败'),
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
      setTestResult({ success: true, message: '保存成功！' });
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || '保存失败' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">飞书应用配置</h3>
        {saved && (
          <span className="flex items-center gap-1 text-[10px] text-green-600">
            <CheckCircle size={12} /> 已配置
          </span>
        )}
      </div>

      <div>
        <label className="block text-xs text-gray-600 mb-1">App ID</label>
        <input
          type="text"
          className="input-field"
          placeholder="cli_xxxxxxxxxxxx"
          value={appId}
          onChange={(e) => { setAppId(e.target.value); setSaved(false); }}
        />
      </div>

      <div>
        <label className="block text-xs text-gray-600 mb-1">App Secret</label>
        <div className="relative">
          <input
            type={showSecret ? 'text' : 'password'}
            className="input-field pr-8"
            placeholder="请输入飞书 App Secret"
            value={appSecret}
            onChange={(e) => { setAppSecret(e.target.value); setSaved(false); }}
          />
          <button
            type="button"
            onClick={() => setShowSecret(!showSecret)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-600 mb-1">文件夹 Token（可选）</label>
        <input
          type="text"
          className="input-field"
          placeholder="目标文件夹的 token"
          value={folderToken}
          onChange={(e) => { setFolderToken(e.target.value); setSaved(false); }}
        />
        <p className="text-[10px] text-gray-400 mt-0.5">
          导出的文档将保存到此文件夹。需要同时满足：
          应用已开通 <code className="text-[10px] bg-gray-100 px-0.5 rounded">drive:drive</code> 和 <code className="text-[10px] bg-gray-100 px-0.5 rounded">docx:document</code> 权限，且应用已被添加为该文件夹的协作者。
        </p>
        <p className="text-[10px] text-primary-500 mt-0.5">
          提示：如果测试连接失败，可先清空文件夹 Token 单独测试认证是否通过。
        </p>
      </div>

      {/* Test result */}
      {testResult && (
        <div className={`text-xs p-2 rounded flex items-start gap-1.5 ${
          testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {testResult.success ? <CheckCircle size={14} className="shrink-0 mt-0.5" /> : <AlertCircle size={14} className="shrink-0 mt-0.5" />}
          <span className="whitespace-pre-wrap">{testResult.message}</span>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button onClick={handleSave} loading={saving} disabled={!appId.trim() || !appSecret.trim()} size="sm">
          保存
        </Button>
        <Button onClick={handleTest} loading={testing} variant="secondary" size="sm" disabled={!appId.trim() || !appSecret.trim()}>
          测试连接
        </Button>
      </div>

      <div className="border-t border-gray-100 pt-3 mt-3">
        <a
          href="https://open.feishu.cn/app"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700"
        >
          <ExternalLink size={12} />
          前往飞书开放平台创建应用
        </a>
      </div>
    </div>
  );
}
