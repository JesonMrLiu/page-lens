import { Routes, Route, Navigate } from 'react-router-dom';
import { Header } from './components/shared/Header';
import { ToastProvider } from './components/shared/Toast';
import { ChatPage } from './routes/ChatPage';
import { SettingsPage } from './routes/SettingsPage';
import { NotesPage } from './routes/NotesPage';
import { useDatabase } from './hooks/useDatabase';
import { LoadingSpinner } from './components/shared/LoadingSpinner';
import { useTranslation } from './contexts/LanguageContext';

export default function App() {
  const { isReady, isLoading, error, retry } = useDatabase();
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-900">
        <LoadingSpinner text={t('app.initDatabase')} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 dark:bg-gray-900 p-6 text-center">
        <p className="text-sm text-red-600 dark:text-red-400 mb-3">{t('app.databaseInitFailed')}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">{error}</p>
        <button onClick={retry} className="btn-primary text-sm">
          {t('app.retry')}
        </button>
      </div>
    );
  }

  if (!isReady) return null;

  return (
    <ToastProvider>
      <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
        <Header />
        <main className="flex-1 overflow-hidden flex flex-col min-h-0">
          <Routes>
            <Route path="/" element={<Navigate to="/chat" replace />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/notes" element={<NotesPage />} />
          </Routes>
        </main>
      </div>
    </ToastProvider>
  );
}
