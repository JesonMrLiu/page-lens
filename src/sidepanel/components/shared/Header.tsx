import { useLocation, useNavigate } from 'react-router-dom';
import { MessageSquare, Settings, BookOpen } from 'lucide-react';

const navItems = [
  { path: '/chat', icon: MessageSquare, label: '聊天' },
  { path: '/notes', icon: BookOpen, label: '笔记' },
  { path: '/settings', icon: Settings, label: '设置' },
];

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <header className="flex items-center justify-between px-4 h-12 bg-white border-b border-gray-200 shrink-0">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded bg-primary-600 flex items-center justify-center">
          <span className="text-white text-[9px] font-bold">PL</span>
        </div>
        <h1 className="text-sm font-semibold text-gray-800">PageLens</h1>
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
                  ? 'bg-primary-50 text-primary-700 font-medium'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
              title={item.label}
            >
              <Icon size={14} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </header>
  );
}
