import type { ReactNode } from 'react';

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  subValue: string;
  badge?: string;
  colorScheme: 'cream' | 'orange' | 'coffee';
}

const colorSchemes = {
  cream: {
    container: 'hover:border-cream-500/30',
    text: 'group-hover:text-cream-400',
    iconBg: 'bg-cream-500/10',
    icon: 'text-cream-500',
  },
  orange: {
    container: 'hover:border-orange-500/30',
    text: 'group-hover:text-orange-400',
    iconBg: 'bg-orange-500/10',
    icon: 'text-orange-500',
  },
  coffee: {
    container: 'hover:border-coffee-500/30',
    text: 'group-hover:text-coffee-400',
    iconBg: 'bg-coffee-500/10',
    icon: 'text-coffee-500',
  },
};

export function StatCard({ icon, label, value, subValue, badge, colorScheme }: StatCardProps) {
  const colors = colorSchemes[colorScheme];
  
  return (
    <div className={`bg-surface-900/50 border border-surface-800 rounded-xl p-5 ${colors.container} transition-all duration-300 group`}>
      <div className="flex items-center justify-between mb-4">
        <div className={`w-10 h-10 rounded-lg ${colors.iconBg} flex items-center justify-center`}>
          <span className={colors.icon}>{icon}</span>
        </div>
        {badge && (
          <span className="text-xs font-medium text-green-400 bg-green-500/10 px-2 py-1 rounded-full">
            {badge}
          </span>
        )}
      </div>
      <p className="text-surface-400 text-sm">{label}</p>
      <p className={`text-2xl font-bold text-surface-100 mt-1 ${colors.text} transition-colors`}>
        {value}
      </p>
      <p className="text-xs text-surface-500 mt-2">{subValue}</p>
    </div>
  );
}

interface SecondaryStatCardProps {
  icon: React.ReactNode;
  title: string;
  items: Array<{ label: string; value: string; colorClass: string }>;
}

export function SecondaryStatCard({ icon, title, items }: SecondaryStatCardProps) {
  return (
    <div className="bg-surface-900/30 border border-surface-800 rounded-xl p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
          <span className="text-green-500">{icon}</span>
        </div>
        <span className="text-sm text-surface-400">{title}</span>
      </div>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex justify-between items-center">
            <span className="text-xs text-surface-500">{item.label}</span>
            <span className={`text-sm font-medium ${item.colorClass}`}>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}