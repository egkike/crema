import { useMemo } from 'react';
import { IconBell } from '@tabler/icons-react';

import { useAuthStore } from '../stores/auth.store';

interface HeaderProps {
  title?: string;
}

export default function Header({ title = 'Dashboard' }: HeaderProps) {
  const user = useAuthStore((state) => state.user);

  const formattedDate = useMemo(() => new Date().toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }), []);

  return (
    <header className="h-16 bg-surface-950/80 backdrop-blur-md border-b border-surface-800 flex items-center justify-between px-6 sticky top-0 z-40">
      {/* Page Title */}
      <div>
        <h1 className="text-lg font-semibold text-surface-100">{title}</h1>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-4">
        {/* Date/Time */}
        <div className="text-sm text-surface-500">
          {formattedDate}
        </div>

        {/* Notifications */}
        <button className="relative p-2 rounded-lg hover:bg-surface-800 text-surface-400 hover:text-cream-500 transition-colors">
          <IconBell size={20} stroke={1.5} />
          <span className="absolute top-1 right-1 w-2 h-2 bg-orange-500 rounded-full"></span>
        </button>

        {/* User Menu */}
        <div className="flex items-center gap-3 pl-4 border-l border-surface-800">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium text-surface-200">{user?.fullname || 'Administrador'}</p>
            <p className="text-xs text-surface-500">{user?.email || ''}</p>
          </div>
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cream-500 to-orange-500 flex items-center justify-center text-surface-950 font-bold text-sm">
            {user?.fullname?.charAt(0).toUpperCase() || 'A'}
          </div>
        </div>
      </div>
    </header>
  );
}