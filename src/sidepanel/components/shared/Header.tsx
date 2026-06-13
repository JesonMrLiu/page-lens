import { useLocation, useNavigate } from 'react-router-dom';
import { MessageSquare, Settings, BookOpen } from 'lucide-react';
import { useTranslation } from '@/sidepanel/contexts/LanguageContext';

const navItems = [
  { path: '/chat', icon: MessageSquare, labelKey: 'header.chat' },
  { path: '/notes', icon: BookOpen, labelKey: 'header.notes' },
  { path: '/settings', icon: Settings, labelKey: 'header.settings' },
];

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <header className="flex items-center justify-between px-4 h-12 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shrink-0">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded bg-primary-600 dark:bg-primary-500 flex items-center justify-center">
          <span className="text-white text-[9px] font-bold">PL</span>
        </div>
        <h1 className="text-sm font-semibold text-gray-800 dark:text-gray-100">PageLens</h1>
      </div>
      <nav className="flex items-center gap-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                isActive
                  ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 font-medium'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              title={t(item.labelKey)}
            >
              <Icon size={14} />
              <span>{t(item.labelKey)}</span>
            </button>
          );
        })}
      </nav>
    </header>
  );
}
