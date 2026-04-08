import { useState } from 'react';
import {
  IconLayoutDashboard,
  IconUsers,
  IconPackage,
  IconShoppingCart,
  IconWallet,
  IconCash,
  IconChartBar,
  IconBolt,
  IconFileAnalytics,
  IconSettings,
  IconShieldCheck,
  IconShieldLock,
  IconLogout,
  IconChevronLeft,
  IconChevronRight,
  IconIceCream,
} from '@tabler/icons-react';

import { useAuthStore } from '../stores/auth.store';

interface NavItem {
  label: string;
  href: string;
  icon: typeof IconLayoutDashboard;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: IconLayoutDashboard },
  { label: 'Usuarios', href: '/users', icon: IconUsers },
  { label: 'Productos', href: '/products', icon: IconPackage },
  { label: 'Órdenes', href: '/orders', icon: IconShoppingCart },
  { label: 'Balance', href: '/balance', icon: IconWallet },
  { label: 'Payouts', href: '/payouts', icon: IconCash },
  { label: 'Comisiones', href: '/commissions', icon: IconChartBar },
  { label: 'AI Stats', href: '/ai-stats', icon: IconBolt },
  { label: 'Reports', href: '/reports', icon: IconFileAnalytics },
  { label: 'Configuración', href: '/config', icon: IconSettings },
  { label: 'LEC', href: '/lec', icon: IconShieldCheck },
  { label: 'Seguridad', href: '/security', icon: IconShieldLock },
];

interface SidebarProps {
  currentPath?: string;
}

export default function Sidebar({ currentPath = '/' }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const logout = useAuthStore((state) => state.logout);

  return (
    <aside
      className={`fixed left-0 top-0 h-full bg-surface-950 border-r border-surface-800 transition-all duration-300 z-50 ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-surface-800">
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <IconIceCream size={28} stroke={1.5} className="text-cream-500" />
            <span className="text-xl font-bold text-cream-500">Crema</span>
          </div>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-2 rounded-lg hover:bg-surface-800 text-surface-400 hover:text-cream-500 transition-colors"
        >
          {isCollapsed ? (
            <IconChevronRight size={20} stroke={1.5} />
          ) : (
            <IconChevronLeft size={20} stroke={1.5} />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="p-4 space-y-1 overflow-y-auto h-[calc(100vh-8rem)]">
        {navItems.map((item) => {
          const isActive = currentPath === item.href;
          const Icon = item.icon;
          return (
            <a
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${
                isActive
                  ? 'bg-cream-500/10 text-cream-500 border-l-2 border-cream-500'
                  : 'text-surface-400 hover:bg-surface-800 hover:text-cream-400'
              }`}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon size={20} stroke={1.5} className="flex-shrink-0" />
              {!isCollapsed && (
                <span className="text-sm font-medium">{item.label}</span>
              )}
            </a>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-surface-800">
        <button
          onClick={() => {
            if (window.confirm('¿Estás seguro de que querés cerrar sesión?')) {
              logout();
            }
          }}
          className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-surface-400 hover:bg-red-500/10 hover:text-red-400 transition-colors ${
            isCollapsed ? 'justify-center' : ''
          }`}
        >
          <IconLogout size={20} stroke={1.5} />
          {!isCollapsed && <span className="text-sm font-medium">Cerrar Sesión</span>}
        </button>
      </div>
    </aside>
  );
}