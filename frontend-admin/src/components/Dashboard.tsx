import { useEffect, useState } from 'react';
import {
  IconUsers,
  IconPackage,
  IconShoppingCart,
  IconCurrencyDollar,
  IconChartBar,
  IconCash,
  IconReceipt,
  IconRefresh,
} from '@tabler/icons-react';

import logger from '../lib/logger';
import { dashboardApi, getDemoStats, type DashboardStats } from '../lib/api';

import { StatCard, SecondaryStatCard } from './DashboardCards';

// Handle 401 errors - redirect to login
function handleAuthError() {
  // Clear any local state and redirect
  window.location.href = '/login';
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDemo, setShowDemo] = useState(false);

  const demoStats = getDemoStats();

  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await dashboardApi.stats();

      if (response.success && response.data) {
        setStats(response.data);
        setShowDemo(false);
      } else if (demoStats) {
        setStats(demoStats);
        setShowDemo(true);
      }
    } catch (err) {
      // Check for 401 Unauthorized - cookie expired or invalid
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 401) {
        handleAuthError();
        return;
      }
      
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Dashboard', `Failed to fetch stats: ${message}`);
      if (demoStats) {
        setStats(demoStats);
        setShowDemo(true);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleRetry = () => {
    fetchStats();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cream-500"></div>
      </div>
    );
  }

  // Fallback to empty stats if both API and demo data fail
  const displayStats = stats || demoStats || {
    users: { total: 0, active: 0, newThisMonth: 0 },
    products: { total: 0, active: 0, newThisMonth: 0 },
    orders: { total: 0, totalAmount: 0, thisMonth: 0 },
    revenue: { ars: 0, usdt: 0 },
    commissions: { paid: 0, pending: 0 },
    payouts: { pending: 0, completed: 0 },
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <DemoWarning show={showDemo} onRetry={handleRetry} />
      <WelcomeSection />
      <StatsGrid stats={displayStats} />
      <SecondaryStats stats={displayStats} />
    </div>
  );
}

function DemoWarning({ show, onRetry }: { show: boolean; onRetry: () => void }) {
  if (!show) return null;

  return (
    <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3 flex items-center gap-3">
      <IconCurrencyDollar size={20} className="text-orange-400 flex-shrink-0" />
      <p className="text-sm text-orange-400">
        Mostrando datos de demostración. Conecta al backend para ver datos reales.
      </p>
      <button
        onClick={onRetry}
        className="ml-auto text-xs bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 px-3 py-1 rounded-lg transition-colors flex items-center gap-1"
      >
        <IconRefresh size={14} />
        Reintentar
      </button>
    </div>
  );
}

function WelcomeSection() {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-2xl font-bold text-surface-100">Overview</h2>
        <p className="text-surface-400 mt-1">Estado de la plataforma en tiempo real</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
        <span className="text-sm text-surface-400">Sistema operativo</span>
      </div>
    </div>
  );
}

function StatsGrid({ stats }: { stats: DashboardStats }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        icon={<IconUsers size={20} />}
        label="Usuarios Registrados"
        value={stats.users.total.toLocaleString('es-AR')}
        subValue={`${stats.users.active} activos`}
        badge={`+${stats.users.newThisMonth}`}
        colorScheme="cream"
      />
      <StatCard
        icon={<IconPackage size={20} />}
        label="Productos Activos"
        value={stats.products.total.toString()}
        subValue={`${stats.products.active} publicados`}
        badge={`+${stats.products.newThisMonth}`}
        colorScheme="orange"
      />
      <StatCard
        icon={<IconShoppingCart size={20} />}
        label="Órdenes Totales"
        value={stats.orders.total.toLocaleString('es-AR')}
        subValue={`${stats.orders.thisMonth} este mes`}
        colorScheme="coffee"
      />
      <StatCard
        icon={<IconCurrencyDollar size={20} />}
        label="Revenue Total"
        value={`$${(stats.revenue.ars / 1000000).toFixed(1)}M ARS`}
        subValue={`${stats.revenue.usdt.toLocaleString('es-AR')} USDT`}
        colorScheme="cream"
      />
    </div>
  );
}

function SecondaryStats({ stats }: { stats: DashboardStats }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <SecondaryStatCard
        icon={<IconChartBar size={16} className="text-green-500" />}
        title="Comisiones"
        items={[
          { label: 'Pagadas', value: `$${stats.commissions.paid.toLocaleString('es-AR')}`, colorClass: 'text-green-400' },
          { label: 'Pendientes', value: `$${stats.commissions.pending.toLocaleString('es-AR')}`, colorClass: 'text-orange-400' },
        ]}
      />
      <SecondaryStatCard
        icon={<IconCash size={16} className="text-purple-400" />}
        title="Payouts"
        items={[
          { label: 'Pendientes', value: `$${stats.payouts.pending.toLocaleString('es-AR')}`, colorClass: 'text-orange-400' },
          { label: 'Completados', value: `$${stats.payouts.completed.toLocaleString('es-AR')}`, colorClass: 'text-green-400' },
        ]}
      />
      <SecondaryStatCard
        icon={<IconReceipt size={16} className="text-red-400" />}
        title="Retenciones"
        items={[
          { label: 'IVA Retenido', value: `$${stats.taxRetention?.iva?.toLocaleString('es-AR') ?? '0'}`, colorClass: 'text-surface-300' },
          { label: 'IIBB Retenido', value: `$${stats.taxRetention?.iibb?.toLocaleString('es-AR') ?? '0'}`, colorClass: 'text-surface-300' },
        ]}
      />
    </div>
  );
}